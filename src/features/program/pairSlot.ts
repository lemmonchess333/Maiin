import type { ProgramExercise } from "./programTypes";

/**
 * Whether the lift at `index` is done in a superset with the one after it
 * (Lift22): it names that lift's slot (`supersetWith`), and the two still
 * stand together. Kept apart from the rules that write pairs
 * (`planSupersets.ts`) so the session clock reads it without them.
 */
export function pairedWithNext(
  exercises: ReadonlyArray<
    Pick<ProgramExercise, "instanceId" | "supersetWith">
  >,
  index: number
): boolean {
  const partner = exercises[index]?.supersetWith;
  return !!partner && exercises[index + 1]?.instanceId === partner;
}

/** A day's lifts as Train lists them: each alone, or a pair the plan wrote
 *  together, in the day's order. */
export function pairRuns<
  T extends Pick<ProgramExercise, "instanceId" | "supersetWith">,
>(exercises: readonly T[]): Array<Array<{ ex: T; i: number }>> {
  const runs: Array<Array<{ ex: T; i: number }>> = [];
  for (let i = 0; i < exercises.length; i++) {
    if (pairedWithNext(exercises, i)) {
      runs.push([
        { ex: exercises[i], i },
        { ex: exercises[i + 1], i: i + 1 },
      ]);
      i++;
    } else runs.push([{ ex: exercises[i], i }]);
  }
  return runs;
}
