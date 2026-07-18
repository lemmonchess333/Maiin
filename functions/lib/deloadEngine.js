/**
 * PROGRAM-DELOAD-01 — server mirror of the client deload transform.
 *
 * Mirrors src/features/program/programEngine.ts `applyDeload` EXACTLY:
 * per exercise, one set fewer (floor 2) and working weight ×0.85 rounded
 * to the nearest 2.5 kg (bodyweight/zero stays 0). Reps untouched.
 *
 * The rule is triple-sited by design history (programEngine.applyDeload,
 * easierToday.deloadWeight, and now this server copy) and pinned in
 * lockstep by src/features/program/__tests__/deloadEngine.cross.test.ts —
 * the sanctioned mitigation for the tested-copy-vs-running-copy rule.
 * Change the rule anywhere and that parity test fails until every copy
 * moves together.
 *
 * Pure (no admin SDK) so it is unit-testable like the other lib modules.
 */

/**
 * Apply the deload transform to a full week of workout days.
 *
 * @param {Array<{ exercises: Array<{ sets: number, weight: number }> }>} workouts
 * @returns {Array} a new array — input is never mutated.
 */
function applyDeloadToWorkouts(workouts) {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, ex.sets - 1),
      weight: ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
    })),
  }));
}

module.exports = { applyDeloadToWorkouts };
