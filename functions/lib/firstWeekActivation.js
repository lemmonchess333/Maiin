/**
 * Read-only activation reporting predicates. Firestore document createTime is
 * the clock for a saved activity; workout.createdAt and run.completedAt come
 * from the client and are not suitable for the 168-hour cohort measure.
 *
 * Keep workout eligibility in lockstep with src/lib/firstWeek.ts. Runs reuse
 * the server mirror of src/lib/runStatsEligibility.ts:isVolumeEligible.
 */
const { isVolumeEligibleRun } = require("./runEligibility");

const ACTIVATION_WINDOW_MS = 168 * 60 * 60 * 1000;

function isFirstWeekWorkoutEligible(workout) {
  return (
    Array.isArray(workout?.exercises) &&
    workout.exercises.some(
      (exercise) =>
        (Array.isArray(exercise?.sets) &&
          exercise.sets.some(
            (set) => Number.isFinite(Number(set?.reps)) && Number(set.reps) > 0
          )) ||
        (exercise?.repUnit === "seconds" &&
          Number.isFinite(Number(exercise.durationMinutes)) &&
          Number(exercise.durationMinutes) > 0)
    )
  );
}

function activityWithinWindow(createdAtMs, onboardingAtMs) {
  return (
    Number.isFinite(createdAtMs) &&
    Number.isFinite(onboardingAtMs) &&
    createdAtMs >= onboardingAtMs &&
    createdAtMs <= onboardingAtMs + ACTIVATION_WINDOW_MS
  );
}

/** Document entries carry the server createTime in `createdAtMs`. */
function firstValidActivities(onboardingAtMs, workouts, runs) {
  const first = { workoutAtMs: null, runAtMs: null, activityAtMs: null };
  for (const entry of workouts) {
    if (
      !activityWithinWindow(entry.createdAtMs, onboardingAtMs) ||
      !isFirstWeekWorkoutEligible(entry.data)
    )
      continue;
    if (first.workoutAtMs === null || entry.createdAtMs < first.workoutAtMs)
      first.workoutAtMs = entry.createdAtMs;
  }
  for (const entry of runs) {
    if (
      !activityWithinWindow(entry.createdAtMs, onboardingAtMs) ||
      !isVolumeEligibleRun(entry.data)
    )
      continue;
    if (first.runAtMs === null || entry.createdAtMs < first.runAtMs)
      first.runAtMs = entry.createdAtMs;
  }
  first.activityAtMs =
    first.workoutAtMs === null
      ? first.runAtMs
      : first.runAtMs === null
        ? first.workoutAtMs
        : Math.min(first.workoutAtMs, first.runAtMs);
  return first;
}

function activationSport(athleteType) {
  switch (athleteType) {
    case "Runner":
      return "runner";
    case "Lifter":
      return "lifter";
    case "Hybrid":
      return "hybrid";
    default:
      return "other";
  }
}

module.exports = {
  ACTIVATION_WINDOW_MS,
  isFirstWeekWorkoutEligible,
  activityWithinWindow,
  firstValidActivities,
  activationSport,
};
