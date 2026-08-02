/**
 * PROGRAM-DELOAD-01 — server mirror of the client deload transform.
 *
 * Mirrors src/features/program/programEngine.ts `applyDeload` EXACTLY,
 * including its training-age branch (backlog #8 / Helms H4):
 *   - beginner, or no experience known: one set fewer (floor 2) and working
 *     weight ×0.85 rounded to the nearest 2.5 kg (bodyweight/zero stays 0),
 *     reps untouched — the novice recipe, which is what this did for
 *     everyone before #8.
 *   - intermediate / advanced: one set fewer AND two reps off the target
 *     (floor 3), load untouched — roughly half the volume at the same
 *     intensity.
 *
 * The rule is triple-sited by design history (programEngine.applyDeload,
 * easierToday.deloadWeight, and now this server copy) and pinned in
 * lockstep by src/features/program/__tests__/deloadEngine.cross.test.ts —
 * the sanctioned mitigation for the tested-copy-vs-running-copy rule.
 * Change the rule anywhere and that parity test fails until every copy
 * moves together. Note `deloadWeight` is only the WEIGHT rule and stays
 * novice-shaped: it powers the easier-today session lever, which is a
 * "make this session lighter" concession, not a mesocycle step-back.
 *
 * Pure (no admin SDK) so it is unit-testable like the other lib modules.
 */

const DELOAD_REPS_FLOOR = 3;
const HOLD_STEP_SECONDS = 5;

/**
 * Server mirror of `programEngine.prepareForDeload`. Re-anchor sets to
 * `baseSets` and stash each exercise's pre-deload weight and rep target so
 * mesocycle exit can restore them (`applyWeeklyVolumeShape` max()-restores
 * both and deletes the stash).
 *
 * Why the server needs this at all: the client's AUTOMATIC week-4 deload has
 * always run `applyDeload(prepareForDeload(workouts))`, but the user-invoked
 * `applyDeloadWeek` command called `applyDeloadToWorkouts` directly with no
 * stash. So a user who took the app's own advice, trained the week and rolled
 * over found nothing to restore from: the novice recipe's ×0.85 load cut and
 * the post-novice recipe's −2 reps became PERMANENT. Sets recovered (they are
 * re-derived from `baseSets`); load and reps did not.
 *
 * `prepareForDeload`'s own doc comment asserted the manual path was covered
 * "with its undo snapshot" — that belief is why the gap existed. The snapshot
 * guards the UNDO WINDOW only: `deloadSnapshot`'s weekNumber guard makes it
 * inert the moment the week cursor moves, which is exactly when the restore
 * is needed.
 *
 * Both stashes are unconditional w.r.t. the recipe, matching the client: only
 * the post-novice recipe cuts reps and only the novice recipe cuts load, but a
 * user who changes experience level mid-mesocycle must still get back
 * whichever one was cut.
 *
 * @param {Array<{ exercises: Array<object> }>} workouts
 * @returns {Array} a new array — input is never mutated.
 */
function prepareForDeloadWorkouts(workouts) {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets === undefined ? ex.sets : ex.baseSets;
      const out = { ...ex, baseSets: base, sets: base };
      if (out.weight > 0) out.preDeloadWeight = out.weight;
      out.preDeloadReps = out.reps;
      return out;
    }),
  }));
}

/**
 * Apply the deload transform to a full week of workout days.
 *
 * @param {Array<{ exercises: Array<{ sets: number, weight: number }> }>} workouts
 * @param {string} [experience] - "beginner" | "intermediate" | "advanced"
 * @returns {Array} a new array — input is never mutated.
 */
function applyDeloadToWorkouts(workouts, experience) {
  const holdLoad = experience === "intermediate" || experience === "advanced";
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const sets = Math.max(2, ex.sets - 1);
      if (holdLoad) {
        return {
          ...ex,
          sets,
          reps:
            ex.repUnit === "seconds"
              ? Math.max(10, ex.reps - HOLD_STEP_SECONDS)
              : Math.max(DELOAD_REPS_FLOOR, ex.reps - 2),
        };
      }
      return {
        ...ex,
        sets,
        weight: ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
      };
    }),
  }));
}

module.exports = {
  applyDeloadToWorkouts,
  prepareForDeloadWorkouts,
  DELOAD_REPS_FLOOR,
};
