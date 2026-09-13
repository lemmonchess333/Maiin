"use strict";
const { liftVolumeKgFor } = require("./lifetimeAccrual");
const { workoutChallengeIncrements } = require("./challengeBackfill");
const { markerDocId } = require("./challengeMarkers");
const { resolveTier } = require("./challengeTiers");
const {
  sourceActivityDateKey,
  challengeContainsActivityDate,
} = require("./challengeActivityWindow");
const { FieldValue } = require("firebase-admin/firestore");

/** Reconcile credited amounts against the current source. Marker deltas
 * make duplicate/out-of-order updates harmless. Missing markers can arise from zero-volume originals or a delayed create;
 * current source reads and the same eligibility predicates guard initial credit. */
async function reconcileWorkoutMetrics(db, uid, workoutId) {
  const sourceRef = db.doc(`users/${uid}/workouts/${workoutId}`);
  const totalsRef = db.doc(`users/${uid}/lifetime/totals`);
  const lifetimeMarker = db.doc(
    `users/${uid}/lifetime/applied_lift_${workoutId}`
  );
  await db.runTransaction(async (tx) => {
    const [source, totals, marker] = await Promise.all([
      tx.get(sourceRef),
      tx.get(totalsRef),
      tx.get(lifetimeMarker),
    ]);
    if (!source.exists || (marker.exists && !totals.exists)) return;
    const data = source.data();
    const applied = marker.exists
      ? (marker.data().appliedValue ?? data.sourceVolumeAtFirstCorrection)
      : 0;
    if (!Number.isFinite(applied)) return;
    const value = liftVolumeKgFor(data);
    if (value === applied) return;
    tx.set(
      totalsRef,
      {
        liftVolumeKg: Math.max(
          0,
          (Number(totals.data()?.liftVolumeKg) || 0) + value - applied
        ),
      },
      { merge: true }
    );
    tx.set(
      lifetimeMarker,
      {
        kind: "lift",
        sourceId: workoutId,
        appliedValue: value,
        appliedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  // Feed summaries are server-owned. Read the current link and facts together
  // so a delayed correction cannot overwrite a newer summary or another author.
  await db.runTransaction(async (tx) => {
    const source = await tx.get(sourceRef);
    if (!source.exists || !source.data().sharedActivityId) return;
    const data = source.data();
    const activityRef = db.collection("activities").doc(data.sharedActivityId);
    const activity = await tx.get(activityRef);
    if (!activity.exists || activity.data().authorId !== uid) return;
    const exercises = (data.exercises || []).filter((ex) => ex.sets?.length);
    tx.update(activityRef, {
      totalVolume: liftVolumeKgFor(data),
      duration: (data.durationMinutes || 0) * 60,
      exerciseCount: exercises.length,
      exercises: exercises.map((ex) => ({
        name: ex.exerciseName,
        sets: ex.sets.length,
        reps: ex.sets[0].reps,
        weightKg: ex.sets[0].weightKg,
        setCount: ex.sets.length,
        targetReps: ex.sets[0].reps,
        targetWeightKg: ex.sets[0].weightKg,
        summary:
          ex.repUnit === "seconds"
            ? `${ex.sets.length}×${ex.sets[0].reps} s`
            : `${ex.sets.length}×${ex.sets[0].reps}×${ex.sets[0].weightKg} kg`,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
      })),
    });
  });
  const challenges = await db.collection("challenges").get();
  for (const challenge of challenges.docs) {
    const participantRef = challenge.ref.collection("participants").doc(uid);
    await db.runTransaction(async (tx) => {
      const [source, participant] = await Promise.all([
        tx.get(sourceRef),
        tx.get(participantRef),
      ]);
      if (!source.exists || !participant.exists) return;
      const markerRef = participantRef
        .collection("applied")
        .doc(markerDocId(participant.data().joinedAt, workoutId, "unused"));
      const marker = await tx.get(markerRef);
      const applied = marker.data();
      const metric = applied?.metric ?? challenge.data().metric;
      const activityDateKey = sourceActivityDateKey(source.data());
      if (
        !marker.exists &&
        !challengeContainsActivityDate(challenge.data(), activityDateKey)
      )
        return;
      if (metric !== "total_volume" && metric !== "hybrid_score") return;
      const value =
        workoutChallengeIncrements(source.data()).find(
          (increment) => increment.metric === metric
        )?.value ?? 0;
      const previous = Number(applied?.incrementBy ?? 0);
      if (!Number.isFinite(previous) || previous === value) return;
      const currentValue = Math.max(
        0,
        (Number(participant.data().currentValue) || 0) + value - previous
      );
      tx.update(participantRef, {
        currentValue,
        tierAchieved: resolveTier(currentValue, challenge.data().tiers, metric),
      });
      tx.set(
        markerRef,
        {
          metric,
          incrementBy: value,
          activityDateKey,
          appliedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  }
}
module.exports = { reconcileWorkoutMetrics };
