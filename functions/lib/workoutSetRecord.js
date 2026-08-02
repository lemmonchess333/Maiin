/**
 * Server mirror of src/features/program/workoutSetRecord.ts.
 *
 * Mirrors `projectWorkoutSets` EXACTLY — same filter, same renumbering, same
 * set-type fallback, same omit-rather-than-write for an absent RPE. Pinned in
 * lockstep by src/features/program/__tests__/workoutSetRecord.cross.test.ts;
 * change the projection on one side and that test fails until both move.
 *
 * Used by the `completeWorkoutDay` command reducer, which builds the saved
 * workout record server-side. That path is currently LATENT — the client only
 * sends applyDeloadWeek / revertDeloadWeek over the command boundary today —
 * but it is in the frozen `CLIENT_COMMAND_KINDS` vocabulary, so leaving it on
 * the old three-field projection would be drift waiting for the day someone
 * routes completion through the boundary. See the client file for why the
 * per-set evidence matters at all and why none of it is backfillable.
 *
 * Pure (no admin SDK) so it is unit-testable like the other lib modules.
 */

const SET_TYPES = new Set(["working", "warmup", "dropset", "failure"]);

function asSetType(t) {
  return SET_TYPES.has(t) ? t : "working";
}

/**
 * @param {Array<{weight:number,reps:number,completed:boolean,type?:string,rpe?:number}>|undefined} logs
 * @param {{sets:number,reps:number,weightKg:number}} planned
 * @returns {Array<object>}
 */
function projectWorkoutSets(logs, planned) {
  if (!logs) {
    return Array.from({ length: planned.sets }, (_, i) => ({
      setNumber: i + 1,
      reps: planned.reps,
      weightKg: planned.weightKg,
      type: "working",
      plannedReps: planned.reps,
      plannedWeightKg: planned.weightKg,
    }));
  }
  return logs
    .filter((l) => l.completed)
    .map((l, i) => {
      const out = {
        setNumber: i + 1,
        reps: l.reps,
        weightKg: l.weight,
        type: asSetType(l.type),
        plannedReps: planned.reps,
        plannedWeightKg: planned.weightKg,
      };
      if (typeof l.rpe === "number") out.rpe = l.rpe;
      return out;
    });
}

module.exports = { projectWorkoutSets };
