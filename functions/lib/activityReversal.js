"use strict";

/**
 * Reversing one deleted activity's contribution to the accumulators.
 *
 * ADR-0012 ("Deleting a logged session reverses accumulators, not
 * history") is the decision this implements. Short version: a workout or
 * run is deletable, and the four pieces of derived state get three
 * different answers.
 *
 *   Performance Index   nothing to do — it is a projection over a window
 *                       and self-heals on the next recompute.
 *   Challenge progress  reversed here.
 *   Lifetime totals     reversed here.
 *   Partner streaks     deliberately NOT reversed. A shared day is a fact
 *                       about a DAY, and stays true if the user logged two
 *                       sessions and deleted one.
 *
 * Two things the ADR did not have right, both found while writing this and
 * both recorded in its second amendment:
 *
 * 1. It claimed "neither marker records the amount it applied". The
 *    CHALLENGE marker does — `applyChallengeProgressIncrement` stamps
 *    `incrementBy` on it. So the challenge reversal reads the applied
 *    figure back rather than re-deriving it, which is strictly stronger:
 *    exact even if the increment formula changed between the accrual and
 *    the delete, and exact even if the source doc was rewritten in
 *    between (deterministic ids mean a resumed programme Finish
 *    overwrites the same workout doc, and that overwrite accrues nothing
 *    because it is not a create).
 *
 * 2. `fastest_effort` cannot be REVERSED at all — its apply path is a
 *    MIN, and the marker records the run's own time, never the best it
 *    displaced, so nothing here knows what the previous best was. What it
 *    gets instead (ADR-0012, third amendment) is the REBUILD the second
 *    amendment named: when the deleted run's recorded time could have
 *    been driving the standing best, `lib/fastestEffortRebuild` re-derives
 *    the true best from the runs that still exist, through the same
 *    gates as the live apply path. A deleted run slower than the best
 *    skips the scan entirely.
 *
 * IDEMPOTENCY. Firestore delivers at-least-once, so every reversal must
 * survive redelivery. The marker is the guard in both directions: its
 * presence means the accrual happened and has not been undone, its absence
 * means either it never credited or the reversal already ran. Each
 * reversal reads the marker and deletes it inside the SAME transaction
 * that applies the decrement, so a redelivery finds nothing and no-ops.
 *
 * Deleting the marker is also what makes re-logging work: the ids are
 * deterministic for programme and routine sessions (`programme-{id}`,
 * `routine-{id}`), so a delete-then-relog reuses the id, and a surviving
 * marker would silently deny the re-log its credit — the same shape as the
 * leave/re-join bug that `challengeMarkers` exists to prevent.
 */

const challengeMarkers = require("./challengeMarkers");
const challengeTiers = require("./challengeTiers");
const fastestEffortRebuild = require("./fastestEffortRebuild");

/**
 * Undo one source activity's SUM-metric challenge credit, everywhere it
 * landed.
 *
 * Mirrors the accrual's shape on purpose: the create path loops every
 * challenge and lets the per-challenge helper decide, so this does too.
 * There is no query that finds "the markers for this source" directly —
 * the source id lives in the marker's document ID, not in a field — and
 * inventing a denormalised field to enable one would be a schema change
 * for a path that already costs the same order of reads as the accrual it
 * undoes.
 *
 * No eligibility re-check, deliberately. An ineligible run (isInvalid /
 * savedAnyway / sub-threshold) never credited, so it has no markers, so
 * this is already a no-op for it. The marker is the record of whether
 * something credited — re-deriving that judgement from flags that may
 * themselves have been edited would be a second opinion where a fact is
 * available.
 */
async function reverseChallengeProgressForSource(db, uid, sourceId) {
  if (!uid || !sourceId) return;

  let challengesSnap;
  try {
    challengesSnap = await db.collection("challenges").get();
  } catch (err) {
    console.error(
      `reverseChallengeProgress: challenge read failed for ${uid}:`,
      err.message
    );
    return;
  }

  for (const doc of challengesSnap.docs) {
    try {
      const outcome = await reverseChallengeProgressInOne(
        db,
        doc.id,
        doc.data() || {},
        uid,
        sourceId
      );
      // Rebuild AFTER the reversal transaction commits (the scan is a
      // query, so it cannot live inside it). Best-effort per challenge:
      // a failed rebuild leaves the stale best it would have corrected,
      // never anything worse, and redelivery retries it.
      if (outcome && outcome.fastestRebuild) {
        await fastestEffortRebuild.rebuildFastestEffortInChallenge(
          db,
          doc.id,
          doc.data() || {},
          uid
        );
      }
    } catch (err) {
      // One challenge failing must not strand the rest, or the user is
      // left with an arbitrary subset reversed and no way to tell which.
      console.error(
        `reverseChallengeProgress: error for ${uid} in ${doc.id}:`,
        err.message
      );
    }
  }
}

async function reverseChallengeProgressInOne(db, challengeDocId, challenge, uid, sourceId) {
  const participantRef = db
    .collection("challenges")
    .doc(challengeDocId)
    .collection("participants")
    .doc(uid);

  // Fast-path skip, mirroring the accrual: no membership means no
  // participant doc to decrement. Any markers still sitting under a
  // deleted membership are already inert — the key is namespaced by
  // `joinedAt`, so a future re-join cannot see them.
  const probe = await participantRef.get();
  if (!probe.exists) return;

  const tiers = challenge.tiers || {};

  return db.runTransaction(async (tx) => {
    // All reads before any write. Sequential rather than parallel because
    // the marker's path depends on this participant's `joinedAt` — the
    // same membership namespacing the accrual uses.
    const snap = await tx.get(participantRef);
    if (!snap.exists) return null;

    const markerRef = participantRef.collection("applied").doc(
      challengeMarkers.markerDocId(
        snap.data().joinedAt,
        sourceId,
        // Unreachable: `sourceId` is the deleted document's id and the
        // caller returns early when it is absent. Present because
        // markerDocId's signature requires a fallback.
        "unused"
      )
    );
    const marker = await tx.get(markerRef);
    if (!marker.exists) return null; // never credited here, or already reversed

    const applied = marker.data() || {};
    const isSum =
      applied.metric !== "fastest_effort" &&
      Number.isFinite(Number(applied.incrementBy));

    if (isSum) {
      const current = Number(snap.data().currentValue) || 0;
      // Floored at zero. A negative total is never right, and clamping
      // beats trusting arithmetic over data that may have been touched by
      // a migration or a manual repair between the accrual and now.
      const newValue = Math.max(0, current - Number(applied.incrementBy));
      tx.set(
        participantRef,
        {
          currentValue: newValue,
          // Recomputed, not left standing. Without this the participant
          // keeps the tier the deleted session earned them, which is the
          // visible half of the inconsistency this whole path removes.
          tierAchieved: challengeTiers.resolveTier(
            newValue,
            tiers,
            challenge.metric
          ),
        },
        { merge: true }
      );
    }

    // The marker goes either way — including for `fastest_effort`. It is
    // safe precisely because MIN is idempotent for the same run: if the
    // user re-logs it under the same id, re-applying the same time yields
    // the same best. Keeping it would deny a genuine re-log its credit
    // forever.
    tx.delete(markerRef);

    // The best itself cannot be reversed here (the marker records the
    // run's own time, not what it displaced) — signal the caller to
    // rebuild it from surviving runs when this run could have been the
    // driver.
    return {
      fastestRebuild: fastestEffortRebuild.rebuildNeeded(
        applied,
        snap.data().currentValue
      ),
    };
  });
}

/**
 * Undo one source activity's lifetime-total accrual.
 *
 * `fallbackAmount` is the caller's re-derivation from the deleted
 * document, used only for markers written before `appliedValue` was
 * stamped on them. Callers must derive it through `lib/lifetimeAccrual`,
 * which is the same module the accrual side uses — ADR-0012's constraint
 * that the reversal call the accrual's function rather than a copy.
 *
 * The residue that leaves, stated rather than hidden: for a pre-existing
 * marker whose source document was overwritten between the accrual and
 * the delete (a resumed programme Finish reuses the workout id), the
 * re-derivation returns the LATER figure while the accrual applied the
 * earlier one, and the difference stays in the total. New accruals carry
 * `appliedValue` and are immune.
 *
 * Milestone badges are NOT revoked. A badge is an achievement that was
 * genuinely reached, and un-awarding it on a mis-log delete is the same
 * category error as breaking a partner streak — history, not an
 * accumulator. The lifetime total dropping back below the threshold is
 * harmless: `awardMilestoneBadges` is idempotent via `earnedAt`, so a
 * later re-crossing is a no-op rather than a duplicate award.
 */
async function reverseLifetimeStat(db, uid, kind, sourceId, fallbackAmount) {
  if (!uid || !sourceId) return;
  if (kind !== "run" && kind !== "lift") return;

  const field = kind === "run" ? "runMeters" : "liftVolumeKg";
  const totalsRef = db.doc(`users/${uid}/lifetime/totals`);
  const markerRef = db.doc(`users/${uid}/lifetime/applied_${kind}_${sourceId}`);

  try {
    await db.runTransaction(async (tx) => {
      const [totalsSnap, markerSnap] = await Promise.all([
        tx.get(totalsRef),
        tx.get(markerRef),
      ]);
      if (!markerSnap.exists) return; // never accrued, or already reversed

      const marker = markerSnap.data() || {};
      const recorded = Number(marker.appliedValue);
      const applied = Number.isFinite(recorded)
        ? recorded
        : Number(fallbackAmount) || 0;

      // Guarded on existence, and written with `update` rather than a
      // merging `set`, so this can never RE-CREATE a totals document the
      // account-deletion sweep has already removed. That resurrection is
      // the failure ADR-0012's first amendment names, and the
      // system-writer guard in the trigger is only the first line against
      // it — a guard that passes and then loses a race would still land
      // here.
      if (totalsSnap.exists) {
        const current = Number(totalsSnap.data()[field]) || 0;
        tx.update(totalsRef, { [field]: Math.max(0, current - applied) });
      }
      tx.delete(markerRef);
    });
  } catch (err) {
    console.error(
      `reverseLifetimeStat: error for ${uid}/${kind}/${sourceId}:`,
      err.message
    );
  }
}

module.exports = {
  reverseChallengeProgressForSource,
  reverseLifetimeStat,
};
