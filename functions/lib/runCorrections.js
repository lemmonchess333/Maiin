"use strict";
/**
 * A saved run whose track changed has what the server credited from it
 * made to match it: its lifetime distance, its challenge progress, its
 * community-goal credit and its post's figures. Its segment efforts are
 * matched again by onRunUpdated through lib/segments.
 *
 * The track changes when the runner crops the run on its page (
 * RunCropSheet), which rewrote its distance, time and best efforts while
 * onRunUpdated reconciled only what reads the session's day (participation
 * goals, leagues, Space weeks): every credit read from the distance kept
 * the run uncropped (the 28 November audit). It is the run's twin of
 * lib/workoutCorrections, and reads the same way.
 *
 * Read from the current documents, never the event's snapshot, so a late,
 * repeated or out-of-order delivery writes the newest figures once. Each
 * credit's marker records what it applied, so the correction moves it by
 * the difference: a challenge that has ended is corrected as a delete
 * would correct it, without crediting the run afresh. A run with no
 * marker yet (its create has not run, or it never counted) is credited as
 * a new one is, and the create then finds the marker and adds nothing.
 */
const admin = require("./adminSdk");
const { runMetersFor } = require("./lifetimeAccrual");
const { runChallengeIncrements } = require("./challengeBackfill");
const { markerDocId } = require("./challengeMarkers");
const { resolveTier } = require("./challengeTiers");
const {
  sourceActivityDateKey,
  challengeContainsActivityDate,
} = require("./challengeActivityWindow");
const { isVolumeEligibleRun } = require("./runEligibility");
const fastestEffortRebuild = require("./fastestEffortRebuild");

const finiteOrNull = (value) => {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : null;
};

/** The saved trace as far as a change to it shows: its length and ends. */
function traceKey(points) {
  if (!Array.isArray(points) || points.length === 0) return "none";
  const first = points[0] || {};
  const last = points[points.length - 1] || {};
  return `${points.length}:${first.timestamp}:${last.timestamp}`;
}

/** True when an update changed what the run's credits are read from: its
 *  distance, time, best efforts, trace or whether it counts. */
function runTrackMayHaveChanged(before = {}, after = {}) {
  const b = before || {};
  const a = after || {};
  return (
    finiteOrNull(b.distance) !== finiteOrNull(a.distance) ||
    finiteOrNull(b.duration) !== finiteOrNull(a.duration) ||
    JSON.stringify(b.bestEfforts ?? null) !==
      JSON.stringify(a.bestEfforts ?? null) ||
    traceKey(b.points) !== traceKey(a.points) ||
    isVolumeEligibleRun(b) !== isVolumeEligibleRun(a)
  );
}

/** Metres the run adds to the lifetime total: none unless it counts, as
 *  onRunCreated credits it. */
function lifetimeMetres(data) {
  return isVolumeEligibleRun(data || {}) ? runMetersFor(data) : 0;
}

const runRef = (db, uid, runId) =>
  db.collection("users").doc(uid).collection("runs").doc(runId);

function serverTimestamp(fieldValue) {
  return (fieldValue || admin.firestore.FieldValue).serverTimestamp();
}

/**
 * The lifetime distance moved by the difference between what the run
 * credited and what it counts now. `fallbackApplied` is the figure a
 * marker written before markers kept theirs (`appliedValue`) applied:
 * the run's distance before this update.
 */
async function reconcileRunLifetimeDistance(
  db,
  uid,
  runId,
  { fallbackApplied = 0, fieldValue } = {}
) {
  const sourceRef = runRef(db, uid, runId);
  const totalsRef = db.doc(`users/${uid}/lifetime/totals`);
  const markerRef = db.doc(`users/${uid}/lifetime/applied_run_${runId}`);
  return db.runTransaction(async (tx) => {
    const [source, totals, marker] = await Promise.all([
      tx.get(sourceRef),
      tx.get(totalsRef),
      tx.get(markerRef),
    ]);
    // A marker with no totals is an account being swept: write nothing.
    if (!source.exists || (marker.exists && !totals.exists)) return false;
    const value = lifetimeMetres(source.data());
    const applied = marker.exists
      ? Number(marker.data().appliedValue ?? fallbackApplied)
      : 0;
    if (!Number.isFinite(applied) || value === applied) return false;
    if (!marker.exists && !(value > 0)) return false;
    const current = Number((totals.exists && totals.data().runMeters) || 0);
    tx.set(
      totalsRef,
      { runMeters: Math.max(0, current + value - applied) },
      { merge: true }
    );
    tx.set(
      markerRef,
      {
        kind: "run",
        sourceId: runId,
        appliedValue: value,
        appliedAt: serverTimestamp(fieldValue),
      },
      { merge: true }
    );
    return true;
  });
}

/**
 * The run's progress in every challenge it is credited in, or should be:
 * a distance (total_km, hybrid_score) moves by the difference; a fastest
 * effort the run held is rebuilt from the runs that exist now, the
 * cropped one among them, and the run is applied again if it still
 * reaches the distance. `applyFastestEffort` is index.js's
 * applyFastestEffortToChallenge, the one apply path for a fastest effort.
 */
async function reconcileRunChallenges(
  db,
  uid,
  runId,
  { applyFastestEffort, fieldValue } = {}
) {
  const sourceRef = runRef(db, uid, runId);
  const source = await sourceRef.get();
  if (!source.exists) return;
  const data = source.data() || {};
  const increments = isVolumeEligibleRun(data)
    ? runChallengeIncrements(data)
    : [];
  const activityDateKey = sourceActivityDateKey(data);
  const challenges = await db.collection("challenges").get();
  const failed = [];
  for (const challenge of challenges.docs) {
    try {
      await reconcileInOne(db, challenge, uid, runId, {
        sourceRef,
        increments,
        activityDateKey,
        applyFastestEffort,
        fieldValue,
      });
    } catch (err) {
      failed.push(challenge.id);
      console.error(
        `reconcileRunChallenges: error for ${uid}/${runId} in ${challenge.id}:`,
        err.message
      );
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `reconcileRunChallenges: ${failed.length} challenge(s) not corrected for ${uid}/${runId}: ${failed.join(", ")}`
    );
  }
}

async function reconcileInOne(
  db,
  challengeDoc,
  uid,
  runId,
  { sourceRef, increments, activityDateKey, applyFastestEffort, fieldValue }
) {
  const challenge = challengeDoc.data() || {};
  const metric = challenge.metric;
  const sum = metric === "total_km" || metric === "hybrid_score";
  if (!sum && metric !== "fastest_effort") return;
  const participantRef = challengeDoc.ref.collection("participants").doc(uid);
  const probe = await participantRef.get();
  if (!probe.exists) return;
  const markerOf = (participant) =>
    participantRef
      .collection("applied")
      .doc(markerDocId(participant.data().joinedAt, runId, "unused"));

  if (sum) {
    const value =
      increments.find((increment) => increment.metric === metric)?.value ?? 0;
    await db.runTransaction(async (tx) => {
      const participant = await tx.get(participantRef);
      if (!participant.exists) return;
      const markerRef = markerOf(participant);
      const marker = await tx.get(markerRef);
      if (
        !marker.exists &&
        !challengeContainsActivityDate(challenge, activityDateKey)
      )
        return;
      if (!marker.exists && !(value > 0)) return;
      const previous = Number(marker.exists ? marker.data().incrementBy : 0);
      if (!Number.isFinite(previous) || previous === value) return;
      // To the hundredth, as the increments are, so 12 - 12 + 5.2 reads 5.2.
      const currentValue =
        Math.round(
          Math.max(
            0,
            (Number(participant.data().currentValue) || 0) + value - previous
          ) * 100
        ) / 100;
      tx.update(participantRef, {
        currentValue,
        tierAchieved: resolveTier(currentValue, challenge.tiers || {}, metric),
      });
      tx.set(
        markerRef,
        {
          metric,
          incrementBy: value,
          activityDateKey,
          appliedAt: serverTimestamp(fieldValue),
        },
        { merge: true }
      );
    });
    return;
  }

  const effort = increments.find(
    (increment) => increment.metric === "fastest_effort"
  );
  const target = Number(challenge.targetDistance) || 0;
  const reaches = Boolean(effort) && target > 0 && effort.meters >= target;
  const runSeconds = reaches ? Math.round(effort.seconds) : null;
  const next = await db.runTransaction(async (tx) => {
    const participant = await tx.get(participantRef);
    if (!participant.exists) return "none";
    const markerRef = markerOf(participant);
    const marker = await tx.get(markerRef);
    if (!marker.exists) return reaches ? "apply" : "none";
    if (reaches && Number(marker.data().runSeconds) === runSeconds)
      return "none";
    // The best it set can't be taken back from the marker, which keeps
    // the run's own time: rebuilt from the runs below, as a delete does.
    tx.delete(markerRef);
    return "rebuild";
  });
  if (next === "rebuild")
    await fastestEffortRebuild.rebuildFastestEffortInChallenge(
      db,
      challengeDoc.id,
      challenge,
      uid
    );
  if ((next === "rebuild" || next === "apply") && reaches && applyFastestEffort)
    await applyFastestEffort(
      challengeDoc.id,
      challenge,
      uid,
      effort.meters,
      effort.seconds,
      runId,
      activityDateKey,
      sourceRef
    );
}

/** The moments a post claims from the run's track, which a changed track
 *  may no longer hold: its longest run, a first distance, a fastest
 *  effort (src/lib/postMoments.ts). The others stay. */
const TRACK_MOMENTS = new Set(["longestRun", "firstDistance", "fastestEffort"]);

/**
 * The run's post takes its figures: distance, time, pace, climb and
 * calories. A post is server-owned past its visibility, so they reach it
 * here, as a corrected workout's reach its post in workoutCorrections,
 * and a moment read from the old track goes (`correctedPostMoments`'s
 * rule). The route on the post is left as the runner shared it: it was
 * cut for their privacy zones on their phone.
 */
async function syncSharedRunFigures(db, uid, runId, { fieldValue } = {}) {
  const FieldValue = fieldValue || admin.firestore.FieldValue;
  const sourceRef = runRef(db, uid, runId);
  return db.runTransaction(async (tx) => {
    const run = await tx.get(sourceRef);
    if (!run.exists) return "unchanged";
    const data = run.data() || {};
    const activityId = data.sharedActivityId;
    if (typeof activityId !== "string" || !activityId) return "unchanged";
    const activityRef = db.collection("activities").doc(activityId);
    const activity = await tx.get(activityRef);
    if (!activity.exists) return "unchanged";
    const post = activity.data() || {};
    if (post.authorId !== uid || post.type !== "run") return "unchanged";
    const update = {};
    for (const field of [
      "distance",
      "duration",
      "avgPace",
      "elevationGain",
      "calories",
    ]) {
      const value = finiteOrNull(data[field]);
      if (value !== null && finiteOrNull(post[field]) !== value)
        update[field] = value;
    }
    if (Object.keys(update).length === 0) return "unchanged";
    if (Array.isArray(post.moments)) {
      const kept = post.moments.filter(
        (moment) => !TRACK_MOMENTS.has(moment && moment.kind)
      );
      if (kept.length !== post.moments.length)
        update.moments = kept.length > 0 ? kept : FieldValue.delete();
    }
    tx.update(activityRef, update);
    return "updated";
  });
}

module.exports = {
  runTrackMayHaveChanged,
  reconcileRunLifetimeDistance,
  reconcileRunChallenges,
  syncSharedRunFigures,
  lifetimeMetres,
};
