/**
 * PROGRAM-DELOAD-01 — server mirror of the client's lighter-week recipe.
 *
 * Mirrors src/features/program/programEngine.ts `applyDeload` EXACTLY
 * (Lift4 (9)): one recipe for everyone, half the working sets, rounded up,
 * at the same weights and reps, from the plan's own sets (`baseSets`), so a
 * lighter week can't compound and the next week's reset puts it back.
 *
 * Pinned in lockstep with the client copy by
 * src/features/program/__tests__/deloadEngine.cross.test.ts, the sanctioned
 * mitigation for the tested-copy-vs-running-copy rule: change the recipe
 * anywhere and that test fails until both copies move together.
 *
 * Pure (no admin SDK) so it is unit-testable like the other lib modules.
 */

/**
 * Apply the lighter-week recipe to a full week of workout days.
 *
 * @param {Array<{ exercises: Array<{ sets: number, baseSets?: number }> }>} workouts
 * @returns {Array} a new array — input is never mutated.
 */
function applyDeloadToWorkouts(workouts) {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets === undefined ? ex.sets : ex.baseSets;
      return { ...ex, baseSets: base, sets: Math.max(1, Math.ceil(base / 2)) };
    }),
  }));
}

module.exports = {
  applyDeloadToWorkouts,
};
