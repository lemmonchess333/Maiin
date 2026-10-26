import type { WorkoutDay } from "./programTypes";
import { contraindicatedFor } from "./injurySubstitutions";
import { getExerciseById } from "@/lib/exercises";

export interface InjurySwap {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
}

export interface InjuryChanges {
  /** Each lift a limitation swapped, once per pair, in the plan's order. */
  swaps: InjurySwap[];
  /** Each lift a limitation covers that had no safe swap, so it stays. */
  kept: { id: string; name: string }[];
}

/**
 * What the limitations chosen changed in a plan, for setup to say as the
 * person chooses them (FV3).
 *
 * Read from the plan's own record: a swap is a lift whose `swappedFrom`
 * names a lift the limitations cover, and a lift that stays is one they
 * cover that is still there. Never from the notes' wording, which is
 * written for Train and can change.
 */
export function injuryChanges(
  workouts: readonly WorkoutDay[],
  injuries: readonly string[]
): InjuryChanges {
  const swaps = new Map<string, InjurySwap>();
  const kept = new Map<string, { id: string; name: string }>();
  for (const day of workouts) {
    for (const exercise of day.exercises) {
      const from = exercise.swappedFrom?.exerciseId;
      if (
        from &&
        from !== exercise.exerciseId &&
        contraindicatedFor(from, injuries).length > 0
      ) {
        const key = `${from}>${exercise.exerciseId}`;
        if (!swaps.has(key)) {
          swaps.set(key, {
            fromId: from,
            fromName: getExerciseById(from)?.name ?? from,
            toId: exercise.exerciseId,
            toName: exercise.name,
          });
        }
      } else if (
        contraindicatedFor(exercise.exerciseId, injuries).length > 0 &&
        !kept.has(exercise.exerciseId)
      ) {
        kept.set(exercise.exerciseId, {
          id: exercise.exerciseId,
          name: exercise.name,
        });
      }
    }
  }
  return { swaps: [...swaps.values()], kept: [...kept.values()] };
}
