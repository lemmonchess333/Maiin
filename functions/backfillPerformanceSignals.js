/* ─────────────────────────────────────────────
   PI1a — Performance signals backfill script

   Standalone Node script (NOT a Cloud Function). Run manually
   after PI1a deploys to populate `signals` on legacy perf docs
   that were written before the CF rewrite.

   USAGE
     1. Set up a Firebase Admin service account locally:
        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
     2. From the repo root:
        node functions/backfillPerformanceSignals.js [--dry-run]
        node functions/backfillPerformanceSignals.js --user-id=<uid>

   PROPERTIES
   - Idempotent: skips docs that already have a `signals` field.
   - Batched: writes ≤ MAX_PARALLEL_USERS users in parallel, with
     ≤ MAX_PARALLEL_WRITES doc writes per user concurrently.
   - Resumable: each user's docs are independent; rerun is safe.
   - Defensive: derives signals from the legacy doc's existing
     fields (liftLoadScore, runLoadScore, recoveryScore, etc.).
     Lifetime/daysSinceLastTraining are set to 0 — too expensive
     to query per backfilled doc, and the consolidated card's
     getLine() handles 0 values via generic-copy fallback. New
     CF writes (post-deploy) populate full signals.

   WHY THIS ISN'T NEEDED FOR CORRECTNESS
   - normalisePerformanceDoc fills defensive defaults for missing
     signals (see src/hooks/usePerformance.ts).
   - The consolidated card renders correctly even with all defaults
     (falls through to generic copy for the verb-state).
   - This backfill is a quality-of-life: legacy docs get partial
     signals so the card's data-aware lines (recoveryWeak,
     bothLoadsStrong) fire on legacy weeks too, not just from PI1a
     onward.
   ───────────────────────────────────────────── */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SINGLE_USER = args.find((a) => a.startsWith("--user-id="))?.split("=")[1] || null;

const MAX_PARALLEL_USERS = 5;
const MAX_PARALLEL_WRITES = 10;

/** Derive synthetic signals from a legacy doc's existing fields. */
function deriveSignalsFromLegacyDoc(doc) {
  const liftLoadScore = Number(doc.liftLoadScore) || 0;
  const runLoadScore = Number(doc.runLoadScore) || 0;
  const recoveryScore = Number(doc.recoveryScore) || 0;
  const adherenceScore = Number(doc.adherenceScore) || 0;
  const liftProgression = Number(doc.liftProgression) || 0;
  const runVolume = Number(doc.runVolume) || 0;
  const deloadRecommended = doc.deloadRecommended === true;

  const liftAheadOfBaseline = liftProgression > 1.05 ? liftProgression - 1 : 0;
  const runAheadOfBaseline = runVolume > 1.05 ? runVolume - 1 : 0;

  // baseline.weeksUsed (if present) gives us lifetimeWeeks-ish.
  // Legacy docs computed this against prior 4 weeks, so the value
  // is roughly correct for "established baseline" detection.
  const weeksUsed = doc.baseline && typeof doc.baseline.weeksUsed === "number"
    ? doc.baseline.weeksUsed
    : 0;

  return {
    bothLoadsStrong: liftLoadScore >= 70 && runLoadScore >= 70,
    liftAheadOfBaseline: Math.round(liftAheadOfBaseline * 1000) / 1000,
    runAheadOfBaseline: Math.round(runAheadOfBaseline * 1000) / 1000,
    recoveryWeak: recoveryScore < 50,
    adherenceWeak: adherenceScore < 50,
    deloadFlag: deloadRecommended,
    lifetimeWeeks: weeksUsed,
    // Backfill can't cheaply compute "days since user's last training"
    // for legacy docs. Default to 0 — the consolidated card falls
    // through to the "Light week — take it easy" line for low
    // PI states rather than the "Quiet week — log when you're back"
    // variant. Slightly less accurate for genuinely-lapsed users
    // viewing legacy docs, but acceptable for a one-time backfill.
    daysSinceLastTraining: 0,
  };
}

async function backfillUser(uid) {
  const perfCol = db.collection("users").doc(uid).collection("performance");
  const snap = await perfCol.get();
  if (snap.empty) {
    return { uid, processed: 0, written: 0, skipped: 0 };
  }

  const docsToWrite = [];
  let skipped = 0;
  snap.forEach((d) => {
    const data = d.data();
    if (data.signals && typeof data.signals === "object") {
      skipped++;
      return;
    }
    const signals = deriveSignalsFromLegacyDoc(data);
    docsToWrite.push({ id: d.id, signals });
  });

  if (DRY_RUN) {
    return { uid, processed: snap.size, written: 0, skipped, wouldWrite: docsToWrite.length };
  }

  // Batched writes per user
  let written = 0;
  for (let i = 0; i < docsToWrite.length; i += MAX_PARALLEL_WRITES) {
    const batch = docsToWrite.slice(i, i + MAX_PARALLEL_WRITES);
    await Promise.all(
      batch.map(async ({ id, signals }) => {
        try {
          await perfCol.doc(id).set({ signals }, { merge: true });
          written++;
        } catch (err) {
          console.error(`backfill: write failed for ${uid}/${id}:`, err.message);
        }
      })
    );
  }

  return { uid, processed: snap.size, written, skipped };
}

async function main() {
  console.log(`backfillPerformanceSignals: starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  let uids;
  if (SINGLE_USER) {
    uids = [SINGLE_USER];
  } else {
    console.log("Fetching user list...");
    const usersSnap = await db.collection("users").select().get();
    uids = usersSnap.docs.map((d) => d.id);
  }
  console.log(`Found ${uids.length} user(s) to process`);

  let totalProcessed = 0;
  let totalWritten = 0;
  let totalSkipped = 0;

  for (let i = 0; i < uids.length; i += MAX_PARALLEL_USERS) {
    const batch = uids.slice(i, i + MAX_PARALLEL_USERS);
    const results = await Promise.all(
      batch.map(async (uid) => {
        try {
          return await backfillUser(uid);
        } catch (err) {
          console.error(`backfill: user ${uid} failed:`, err.message);
          return { uid, processed: 0, written: 0, skipped: 0, error: err.message };
        }
      })
    );

    results.forEach((r) => {
      totalProcessed += r.processed;
      totalWritten += r.written;
      totalSkipped += r.skipped;
      const tag = r.error ? "ERROR" : DRY_RUN ? "DRY" : "OK";
      console.log(
        `  ${tag} ${r.uid}: processed=${r.processed} written=${r.written} skipped=${r.skipped}` +
          (r.wouldWrite != null ? ` wouldWrite=${r.wouldWrite}` : "") +
          (r.error ? ` error=${r.error}` : "")
      );
    });

    console.log(`Batch ${Math.floor(i / MAX_PARALLEL_USERS) + 1} done (${i + batch.length}/${uids.length})`);
  }

  console.log("\nSummary:");
  console.log(`  Users processed: ${uids.length}`);
  console.log(`  Docs processed:  ${totalProcessed}`);
  console.log(`  Docs written:    ${totalWritten}${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  Docs skipped:    ${totalSkipped} (already had signals)`);
}

main()
  .then(() => {
    console.log("backfillPerformanceSignals: done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("backfillPerformanceSignals: fatal error:", err);
    process.exit(1);
  });
