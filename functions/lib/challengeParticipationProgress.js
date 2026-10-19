"use strict";

const {
  sourceActivityDateKey,
  challengeContainsActivityDate,
  isValidDateKey,
  openOnDayBound,
} = require("./challengeActivityWindow");
const { backfillQueryWindow } = require("./challengeBackfill");
const { resolveTier } = require("./challengeTiers");
const { isVolumeEligibleRun } = require("./runEligibility");

function isParticipationMetric(metric) {
  return metric === "active_days" || metric === "training_minutes";
}

/** Event facts select affected windows; current source facts determine credit. */
function affectedActivityDays(...sources) {
  return [...new Set(sources.map(sourceActivityDateKey).filter(Boolean))];
}

function storedSeconds(value, multiplier = 1) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return 0;
  const seconds = Math.round(value * multiplier);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Project the two participation goals from saved facts. Days are distinct
 * local calendar dates across both sports. Minutes use the stored session
 * duration only; the metric never estimates time from sets or distance.
 * Sum whole seconds before converting, so two thirty-second runs earn one
 * minute and editing/deleting either source removes exactly its own time.
 */
function participationValue(challenge, workouts, runs) {
  if (!isParticipationMetric(challenge?.metric)) return null;
  const days = new Set();
  let seconds = 0;
  for (const data of workouts) {
    const day = sourceActivityDateKey(data);
    if (!challengeContainsActivityDate(challenge, day)) continue;
    days.add(day);
    seconds += storedSeconds(data.durationMinutes, 60);
  }
  for (const data of runs) {
    // The eligibility predicate also serves older, loosely shaped records.
    // These new goals accept only the finite numeric saved-run shape.
    if (
      !isVolumeEligibleRun(data) ||
      typeof data.distance !== "number" ||
      !Number.isFinite(data.distance) ||
      typeof data.duration !== "number" ||
      !Number.isFinite(data.duration)
    )
      continue;
    const day = sourceActivityDateKey(data);
    if (!challengeContainsActivityDate(challenge, day)) continue;
    days.add(day);
    seconds += storedSeconds(data.duration);
  }
  return challenge.metric === "active_days" ? days.size : seconds / 60;
}

/**
 * No per-source counters or markers: recompute the bounded period from the
 * sources that still exist. All source queries are INSIDE the participant
 * transaction, so a stale scan cannot overwrite a later edit or membership.
 * A leave/rejoin or concurrent event changes a transaction read and retries
 * against current facts. Source IDs from different sports never collide.
 */
async function recomputeParticipationChallenge(db, challengeId, uid) {
  const challengeRef = db.collection("challenges").doc(challengeId);
  const participantRef = challengeRef.collection("participants").doc(uid);
  return db.runTransaction(async (tx) => {
    const participant = await tx.get(participantRef);
    if (!participant.exists) return;
    const challengeSnap = await tx.get(challengeRef);
    if (!challengeSnap.exists) return;
    const challenge = challengeSnap.data();
    if (!isParticipationMetric(challenge.metric)) return;
    const window = backfillQueryWindow(challenge);
    if (!window) return;
    const user = db.collection("users").doc(uid);
    const periodQuery = (kind) =>
      user
        .collection(kind)
        .where("date", ">=", window.startKey)
        .where("date", "<", window.endKey);
    const workouts = await tx.get(periodQuery("workouts"));
    const runs = await tx.get(periodQuery("runs"));
    const currentValue = participationValue(
      challenge,
      workouts.docs.map((doc) => doc.data()),
      runs.docs.map((doc) => doc.data())
    );
    const tierAchieved = resolveTier(
      currentValue,
      challenge.tiers || {},
      challenge.metric
    );
    if (
      participant.data().currentValue === currentValue &&
      participant.data().tierAchieved === tierAchieved
    )
      return;
    tx.update(participantRef, { currentValue, tierAchieved });
  });
}

/** Only periods touched by an event's old/new local day need source scans. */
async function reconcileParticipationChallenges(db, uid, activityDays) {
  const days = [...new Set(activityDays.filter(isValidDateKey))];
  if (!uid || days.length === 0) return;
  // Only challenges still open on the earliest affected day can contain
  // any of them (see openOnDayBound); this runs on every session create,
  // edit and delete, and challenges are never deleted.
  const earliest = [...days].sort()[0];
  const challenges = await db
    .collection("challenges")
    .where("endDate", ">", openOnDayBound(earliest))
    .get();
  for (const doc of challenges.docs) {
    const challenge = doc.data();
    if (
      isParticipationMetric(challenge.metric) &&
      days.some((day) => challengeContainsActivityDate(challenge, day))
    )
      await recomputeParticipationChallenge(db, doc.id, uid);
  }
}

module.exports = {
  isParticipationMetric,
  affectedActivityDays,
  participationValue,
  recomputeParticipationChallenge,
  reconcileParticipationChallenges,
};
