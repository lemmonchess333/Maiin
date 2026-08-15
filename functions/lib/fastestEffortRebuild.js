"use strict";

/**
 * fastest_effort rebuild — closing the one honest hole in ADR-0012's
 * delete-reversal.
 *
 * The SUM metrics reverse exactly (their markers record the applied
 * amount). `fastest_effort` applies through a MIN whose marker records
 * the run's OWN time, never the best it displaced — so a REVERSAL is
 * impossible, and the ADR's second amendment classifies the best as
 * history. The consequence it accepts is real, though: delete the
 * mis-logged 12-minute "5K" that a GPS glitch produced, and the bogus
 * time keeps your challenge standing forever.
 *
 * The amendment itself names the honest fix: "recovering it would mean
 * re-scanning the user's whole run history against the challenge's
 * target distance, which is a rebuild, not a reversal." This module IS
 * that rebuild. It re-derives the participant's true best from the runs
 * that still exist, through the SAME window, eligibility and
 * target-distance gates as the live apply path and the join-time
 * backfill (challengeBackfill / runEligibility / challengeActivityWindow
 * — one source of truth, per the tested-copy rule).
 *
 * WHEN it runs: only when the deleted run could have been the driver.
 * `rebuildNeeded` compares the deleted run's marker-recorded time against
 * the standing best — a deleted run SLOWER than the best cannot have set
 * it, so the common case (deleting an ordinary run) costs nothing beyond
 * the reversal that already ran. The rebuild scan is bounded by the
 * challenge window, the same bound the join-time backfill uses.
 *
 * IDEMPOTENCY. The rebuild is a pure recompute-and-write: re-running it
 * converges on the same value, so trigger redelivery is safe without a
 * marker. Surviving runs' apply markers are untouched — they record each
 * run's own time and stay consistent with any rebuilt best — and the
 * deleted run's marker was already removed by the reversal, so a re-log
 * re-applies through the live MIN path and lands correctly.
 */

const challengeTiers = require("./challengeTiers");
const challengeBackfill = require("./challengeBackfill");
const { isVolumeEligibleRun } = require("./runEligibility");
const {
  sourceActivityDateKey,
  challengeContainsActivityDate,
} = require("./challengeActivityWindow");

/**
 * Could the deleted run have been driving the standing best?
 *
 * True when the marker is a fastest_effort marker AND its recorded time
 * is at or below the participant's currentValue (MIN semantics: only a
 * run at least as fast as the best can have set it). A marker missing
 * its runSeconds — which the apply path has always stamped, so this is
 * belt-and-braces for hand-repaired data — errs toward rebuilding:
 * a wasted recompute converges; a skipped one strands a stale best.
 */
function rebuildNeeded(markerData, participantCurrentValue) {
  if (!markerData || markerData.metric !== "fastest_effort") return false;
  const current = Number(participantCurrentValue) || 0;
  if (current <= 0) return false; // nothing standing to correct
  const runSeconds = Number(markerData.runSeconds);
  if (!Number.isFinite(runSeconds) || runSeconds <= 0) return true;
  return runSeconds <= current;
}

/**
 * Recompute one participant's fastest_effort best for one challenge from
 * the runs that still exist, and write it (with its tier) if it moved.
 * 0 means "no qualifying effort" — the same sentinel the apply path and
 * resolveTier already use.
 */
async function rebuildFastestEffortInChallenge(
  db,
  challengeDocId,
  challenge,
  uid
) {
  const target = (challenge && challenge.targetDistance) || 0;
  if (target <= 0) return; // malformed def — apply never credits these either
  const window = challengeBackfill.backfillQueryWindow(challenge);
  if (!window) return; // fail closed, same as the backfill

  const runsSnap = await db
    .collection("users")
    .doc(uid)
    .collection("runs")
    .where("date", ">=", window.startKey)
    .where("date", "<", window.endKey)
    .get();

  let best = 0;
  for (const d of runsSnap.docs) {
    const data = d.data() || {};
    if (!isVolumeEligibleRun(data)) continue;
    const dayKey = sourceActivityDateKey(data);
    if (!dayKey) continue;
    if (!challengeContainsActivityDate(challenge, dayKey)) continue;
    const inc = challengeBackfill
      .runChallengeIncrements(data)
      .find((i) => i.metric === "fastest_effort");
    if (!inc) continue;
    if (inc.meters < target) continue;
    const seconds = Math.round(inc.seconds);
    if (!(seconds > 0)) continue;
    best = best === 0 ? seconds : Math.min(best, seconds);
  }

  const participantRef = db
    .collection("challenges")
    .doc(challengeDocId)
    .collection("participants")
    .doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(participantRef);
    if (!snap.exists) return; // left the challenge between scan and write
    const current = Number(snap.data().currentValue) || 0;
    if (current === best) return; // already true — redelivery, or a tie
    tx.set(
      participantRef,
      {
        currentValue: best,
        tierAchieved: challengeTiers.resolveTier(
          best,
          (challenge && challenge.tiers) || {},
          "fastest_effort"
        ),
      },
      { merge: true }
    );
  });
  console.log(
    `fastestEffortRebuild: ${uid} in ${challengeDocId} → ${best || "none"}`
  );
}

module.exports = {
  rebuildNeeded,
  rebuildFastestEffortInChallenge,
};
