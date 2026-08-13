"use strict";

/**
 * Timed exercise-id set — server copy of src/features/program/repUnits.ts.
 *
 * Exercises measured in SECONDS rather than reps. The programme command
 * reducer needs this to prescribe a swapped-in exercise correctly
 * (`replaceExercise` re-prescribes 30 for seconds vs 10 for reps) and to
 * keep a hold out of the tonnage tally, where `reps` is a duration and
 * `weightKg × reps` is not a weight moved.
 *
 * It lived inline in programCommands.js as a private four-id set, and had
 * DRIFTED: `l-sit` and `farmers-carry` were added to the client set — with
 * the reasoning that nobody performs "a rep" of an L-sit or a carry — and
 * the server copy was never updated. Both ids exist in both catalogs, so
 * the disagreement was live, not theoretical: this copy would prescribe
 * ten reps of a hold, which is the precise bug the client's own
 * `repUnitsCatalogue.test.ts` header describes having already fixed once.
 *
 * That is the whole argument for extracting it. The client set is pinned
 * to the catalogue by a test; the server set was pinned by nothing, so the
 * fix landed on the copy a test covered and stopped there. Set-equality is
 * now enforced by
 * src/features/program/__tests__/timedExerciseIds.cross.test.ts — the same
 * sanctioned mitigation bodyweightExerciseIds.js uses for a hand-
 * maintained mirror the CommonJS runtime cannot import from the Vite/TS
 * catalogue.
 */

const TIMED_EXERCISE_IDS = Object.freeze([
  "plank",
  "superman-hold",
  "side-plank",
  "weighted-plank",
  // Held for time by definition — nobody performs a rep of an L-sit.
  "l-sit",
  // A loaded carry is prescribed by time or distance; the app has no
  // distance unit for lifting, so seconds is the honest one.
  "farmers-carry",
]);

const TIMED_ID_SET = new Set(TIMED_EXERCISE_IDS);

/** Mirror of repUnits.ts repUnitForExerciseId. */
function repUnitForExerciseId(exerciseId) {
  return exerciseId && TIMED_ID_SET.has(exerciseId) ? "seconds" : undefined;
}

/** Mirror of repUnits.ts isTimedExerciseId. */
function isTimedExerciseId(exerciseId) {
  return repUnitForExerciseId(exerciseId) === "seconds";
}

module.exports = {
  TIMED_EXERCISE_IDS,
  repUnitForExerciseId,
  isTimedExerciseId,
};
