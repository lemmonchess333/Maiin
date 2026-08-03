"use strict";

/**
 * Bodyweight exercise-id set (packet 18) — server copy of the catalog's
 * `equipment: "Bodyweight"` rows in src/lib/exercises.ts.
 *
 * The programme progression engine (progressionEngine.js) needs to know which
 * movements are true bodyweight movements (pull-ups, dips, …) so it progresses
 * them by rep-target rather than load. The exercise catalog is a ~2500-line
 * Vite/TS data module that can't be required from CommonJS Cloud Functions, so
 * this is a deliberate, minimal DATA MIRROR of just the bodyweight ids.
 *
 * Kept in lockstep with the catalog by a set-equality cross-test
 * (src/features/program/__tests__/bodyweightExerciseIds.cross.test.ts) that
 * derives the canonical set from EXERCISES and fails CI if this list drifts —
 * the sanctioned mitigation for a hand-maintained mirror (same pattern as
 * spaceIds.js). Add/remove a bodyweight exercise in the catalog and this list
 * must change in the same commit.
 */

const BODYWEIGHT_EXERCISE_IDS = Object.freeze([
  "bench-dips",
  "bicycle-crunch",
  "bodyweight-lunge",
  "bodyweight-squat",
  "burpees",
  "chin-ups",
  "crunches",
  "dead-bug",
  "decline-sit-up",
  "diamond-push-ups",
  "dips",
  "dragon-flag",
  "glute-bridge",
  "handstand-push-ups",
  "inverted-row",
  "l-sit",
  "leg-raise",
  "mountain-climbers",
  "muscle-ups",
  "nordic-hamstring-curl",
  "pike-push-up",
  "pistol-squat",
  "plank",
  "pull-ups",
  "push-ups",
  "russian-twist",
  "side-plank",
  "single-leg-calf-raise",
  "sissy-squat",
  "superman-hold",
  "toe-touches",
  "tricep-dips",
  "weighted-chest-dip",
  "weighted-plank",
  "weighted-push-ups",
]);

const BODYWEIGHT_ID_SET = new Set(BODYWEIGHT_EXERCISE_IDS);

// Mirror of src/lib/exercises.ts isBodyweightExerciseId.
function isBodyweightExerciseId(exerciseId) {
  if (!exerciseId) return false;
  return BODYWEIGHT_ID_SET.has(exerciseId);
}

module.exports = {
  BODYWEIGHT_EXERCISE_IDS,
  isBodyweightExerciseId,
};
