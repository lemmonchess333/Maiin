#!/usr/bin/env node
/**
 * Backfill totalCalories on historical workout records using the canonical
 * estimateLiftBurn formula from src/lib/workoutBurn.ts.
 *
 * Usage:
 *   DRY_RUN=true node functions/scripts/backfill-workout-burns.js   # report only
 *   node functions/scripts/backfill-workout-burns.js                # write updates
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS points at a service-account JSON with
 *     Firestore write access, OR `firebase login:ci` + GOOGLE_CLOUD_PROJECT.
 *   - Run from the repo root.
 *
 * Behaviour:
 *   - Iterates every user under `users/` and each user's `workouts/` subcol.
 *   - For each workout, recomputes totalCalories from stored durationMinutes,
 *     tonnage (summed from sets' weightKg * reps), and the user's
 *     profile.weightKg (bodyweight-at-the-time isn't tracked historically;
 *     we use the current profile weight as a reasonable proxy).
 *   - Skips workouts where required data is missing (no sets / no bodyweight).
 *   - In write mode: sets totalCaloriesLegacy = <old value> and updates
 *     totalCalories to the new value.
 *   - In dry-run mode: reports stats and anomalies; writes nothing.
 *
 * Safety guards (dry-run and write):
 *   - Any individual new totalCalories > 2000 → HALT before writing.
 *   - Any individual new totalCalories < 0 → HALT before writing.
 *   - If the mean of new values is LOWER than mean of old values across the
 *     whole sample → HALT (the old values are supposed to be artificially
 *     low, so this would indicate a regression in the formula).
 *
 * This script duplicates the lift burn formula inline. KEEP IN SYNC WITH
 * src/lib/workoutBurn.ts — if that formula changes, mirror the change here.
 */

const admin = require("firebase-admin");

// ── Formula (mirror of src/lib/workoutBurn.ts) ───────────────────────
function selectLiftMET(tonnageKg, durationMinutes) {
  if (tonnageKg === 0) return 4.5;
  if (durationMinutes <= 0) return 4.5;
  const density = tonnageKg / durationMinutes;
  if (density < 80) return 3.5;
  if (density < 200) return 4.5;
  return 5.5;
}

function estimateLiftBurn({ durationMinutes, tonnageKg, bodyweightKg, completedSetCount }) {
  const effectiveDuration = durationMinutes > 0
    ? durationMinutes
    : completedSetCount * 3;
  if (effectiveDuration === 0 || bodyweightKg <= 0) return 0;
  const met = selectLiftMET(tonnageKg, effectiveDuration);
  return Math.round((effectiveDuration * bodyweightKg * met) / 60);
}

// ── Safety guard thresholds ──────────────────────────────────────────
const MAX_PLAUSIBLE_KCAL = 2000;
const BATCH_SIZE = 50;

const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  console.log(`[backfill] mode=${DRY_RUN ? "DRY_RUN" : "WRITE"}  batch=${BATCH_SIZE}`);

  const usersSnap = await db.collection("users").get();
  console.log(`[backfill] scanning ${usersSnap.size} users`);

  const allDeltas = [];
  let processed = 0;
  let skipped = 0;
  let wouldUpdate = 0;
  let updated = 0;
  const skipReasons = Object.create(null);
  const anomalies = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const profile = userDoc.data() || {};
    const bodyweightKg = Number(profile.weightKg) || 0;

    const workoutsRef = db.collection("users").doc(uid).collection("workouts");
    let lastDoc = null;
    while (true) {
      let q = workoutsRef.orderBy("date", "desc").limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;
      lastDoc = snap.docs[snap.docs.length - 1];

      for (const doc of snap.docs) {
        processed++;
        const w = doc.data() || {};

        if (!Array.isArray(w.exercises) || w.exercises.length === 0) {
          skipped++;
          skipReasons.noExercises = (skipReasons.noExercises || 0) + 1;
          continue;
        }
        if (bodyweightKg <= 0) {
          skipped++;
          skipReasons.noBodyweight = (skipReasons.noBodyweight || 0) + 1;
          continue;
        }

        let tonnageKg = 0;
        let completedSetCount = 0;
        for (const ex of w.exercises) {
          const sets = Array.isArray(ex.sets) ? ex.sets : [];
          for (const set of sets) {
            const weight = Number(set.weightKg) || 0;
            const reps = Number(set.reps) || 0;
            tonnageKg += weight * reps;
            completedSetCount++;
          }
        }
        if (completedSetCount === 0) {
          skipped++;
          skipReasons.noSets = (skipReasons.noSets || 0) + 1;
          continue;
        }

        const durationMinutes = Number(w.durationMinutes) || 0;
        const newKcal = estimateLiftBurn({
          durationMinutes,
          tonnageKg,
          bodyweightKg,
          completedSetCount,
        });
        const oldKcal = Number(w.totalCalories) || 0;

        // Anomaly guards — collect first, halt before writing.
        if (newKcal > MAX_PLAUSIBLE_KCAL) {
          anomalies.push({ uid, id: doc.id, reason: `>${MAX_PLAUSIBLE_KCAL}`, newKcal });
        }
        if (newKcal < 0) {
          anomalies.push({ uid, id: doc.id, reason: "negative", newKcal });
        }

        const delta = newKcal - oldKcal;
        allDeltas.push({ uid, id: doc.id, oldKcal, newKcal, delta });
        wouldUpdate++;

        if (!DRY_RUN && anomalies.length === 0) {
          // Defer writes until after we've read all docs and checked the
          // mean-direction guard. We'll do a second pass below.
        }
      }

      if (snap.size < BATCH_SIZE) break;
    }
  }

  // ── Summary stats ────────────────────────────────────────────────────
  const newValues = allDeltas.map((d) => d.newKcal);
  const oldValues = allDeltas.map((d) => d.oldKcal);
  const deltaValues = allDeltas.map((d) => d.delta);
  const mean = (a) => (a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length);
  const stats = {
    processed,
    wouldUpdate,
    skipped,
    min_new: Math.min(...newValues, Infinity),
    max_new: Math.max(...newValues, -Infinity),
    mean_new: Math.round(mean(newValues)),
    mean_old: Math.round(mean(oldValues)),
    min_delta: Math.min(...deltaValues, Infinity),
    max_delta: Math.max(...deltaValues, -Infinity),
    mean_delta: Math.round(mean(deltaValues)),
  };

  const largestPositive = [...allDeltas].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const largestNegative = [...allDeltas].sort((a, b) => a.delta - b.delta).slice(0, 5);

  console.log("\n[backfill] stats:");
  console.log(JSON.stringify(stats, null, 2));
  console.log("\n[backfill] skip reasons:", skipReasons);
  console.log("\n[backfill] 5 largest positive deltas:");
  largestPositive.forEach((d) => console.log(`  +${d.delta}  uid=${d.uid}  id=${d.id}  ${d.oldKcal}→${d.newKcal}`));
  console.log("\n[backfill] 5 largest negative deltas:");
  largestNegative.forEach((d) => console.log(`  ${d.delta}  uid=${d.uid}  id=${d.id}  ${d.oldKcal}→${d.newKcal}`));

  // ── Anomaly guards — halt before any write ───────────────────────────
  if (anomalies.length > 0) {
    console.error(`\n[backfill] HALT — ${anomalies.length} anomaly record(s):`);
    anomalies.slice(0, 20).forEach((a) => console.error(`  ${a.reason}  uid=${a.uid}  id=${a.id}  new=${a.newKcal}`));
    console.error("\nNo writes performed. Investigate the formula before re-running.");
    process.exitCode = 1;
    return;
  }
  if (allDeltas.length > 0 && stats.mean_new < stats.mean_old) {
    console.error(`\n[backfill] HALT — new mean (${stats.mean_new}) is lower than old mean (${stats.mean_old}).`);
    console.error("Expected increase (old values were artificially low). Investigate before writing.");
    process.exitCode = 1;
    return;
  }

  // ── Write pass ──────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n[backfill] DRY_RUN — no writes performed.");
    return;
  }

  console.log(`\n[backfill] WRITE mode — updating ${wouldUpdate} records...`);
  for (const d of allDeltas) {
    const ref = db.collection("users").doc(d.uid).collection("workouts").doc(d.id);
    await ref.set(
      {
        totalCalories: d.newKcal,
        totalCaloriesLegacy: d.oldKcal,
        backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    updated++;
    if (updated % BATCH_SIZE === 0) console.log(`  ...${updated}/${wouldUpdate}`);
  }
  console.log(`\n[backfill] DONE — ${updated} records updated.`);
}

main().catch((err) => {
  console.error("[backfill] FATAL", err);
  process.exit(1);
});
