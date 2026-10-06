/**
 * "Swap for today" in a session (Lift4 (11)): another exercise in a planned
 * lift's place, for this session, and the one question Finish asks about
 * it: keep it in the plan, or not.
 *
 * The swapped exercise keeps the slot (its `instanceId`), so the session's
 * sets stay lined up with the plan's lifts. Its sets say nothing about the
 * lift it stood in for, so a swap Finish doesn't keep leaves that lift as
 * it was; a kept one takes the lift's place, with today's sets as its first
 * session (`applySessionProgression`). A swap a person keeps is their
 * choice, so it is not marked as an equipment or injury swap
 * (`swappedFrom`), and lifting a limitation never undoes it.
 */
import { getExerciseById } from "@/lib/exercises";
import { normalizeExercise, type ProgramExercise } from "./programTypes";
import { repUnitForExerciseId } from "./repUnits";
import {
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "./startingLoads";

/** An exercise swapped in for today, by its place in the session, and what
 *  Finish decided: kept in the plan, not kept, or not asked yet. */
export interface SessionSwap {
  index: number;
  keep?: boolean;
}

/**
 * The exercise done in `planned`'s place today: the planned sets and reps
 * (a hold's 30 seconds or 10 reps where the unit changes, as Train's swap
 * gives), the weight the new movement was last lifted at, or else a start
 * for it from the planned lift's (`weightAfterExerciseSwap`), and none of
 * the planned lift's history.
 */
export function swappedForToday(
  planned: ProgramExercise,
  replacementId: string,
  from: { lastWeight?: number; loadContext?: StartingLoadContext } = {}
): ProgramExercise {
  const repUnit = repUnitForExerciseId(replacementId);
  const unitChanged =
    (planned.repUnit === "seconds") !== (repUnit === "seconds");
  const reps = unitChanged ? (repUnit === "seconds" ? 30 : 10) : planned.reps;
  const seeded = weightAfterExerciseSwap(
    planned,
    replacementId,
    from.loadContext
  );
  return normalizeExercise({
    name: getExerciseById(replacementId)?.name ?? replacementId,
    exerciseId: replacementId,
    instanceId: planned.instanceId,
    sets: planned.sets,
    reps,
    weight:
      from.lastWeight !== undefined && from.lastWeight > 0
        ? from.lastWeight
        : seeded.weight,
    movementCategory: seeded.movementCategory,
    baseReps: unitChanged ? reps : planned.baseReps,
    progressionType: planned.progressionType,
    ...(!unitChanged && planned.repRangeMax !== undefined
      ? { repRangeMax: planned.repRangeMax }
      : {}),
    ...(repUnit !== undefined ? { repUnit } : {}),
    ...(planned.baseSets !== undefined ? { baseSets: planned.baseSets } : {}),
    ...(planned.restSeconds !== undefined
      ? { restSeconds: planned.restSeconds }
      : {}),
    ...(planned.isAccessory !== undefined
      ? { isAccessory: planned.isAccessory }
      : {}),
  });
}

/**
 * The lift a kept swap leaves in the plan, before today's sets move it: the
 * exercise done today, in the planned lift's slot and at the plan's sets
 * (a shortened session's are the session's alone).
 */
export function keptSwap(
  planned: ProgramExercise,
  ranToday: ProgramExercise
): ProgramExercise {
  return normalizeExercise({
    ...ranToday,
    instanceId: planned.instanceId,
    sets: planned.sets,
    ...(planned.baseSets !== undefined ? { baseSets: planned.baseSets } : {}),
    lastSuccessfulWeight: ranToday.weight,
    lastAttemptedWeight: ranToday.weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  });
}
