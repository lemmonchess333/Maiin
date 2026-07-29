import type { RepUnit } from "./programTypes";

/**
 * Exercises currently authored as duration-based holds in programme
 * templates. Kept in one place so migration, manual replacement, session and
 * history surfaces agree on the unit for legacy rows that predate `repUnit`.
 */
const TIMED_EXERCISE_IDS: ReadonlySet<string> = new Set([
  "plank",
  "superman-hold",
  "side-plank",
  "weighted-plank",
]);

export function repUnitForExerciseId(
  exerciseId: string | undefined
): RepUnit | undefined {
  return exerciseId && TIMED_EXERCISE_IDS.has(exerciseId)
    ? "seconds"
    : undefined;
}

export function isTimedExerciseId(exerciseId: string | undefined): boolean {
  return repUnitForExerciseId(exerciseId) === "seconds";
}
