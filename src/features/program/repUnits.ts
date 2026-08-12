import type { RepUnit } from "./programTypes";

/**
 * Exercises measured in seconds rather than reps. Kept in one place so
 * migration, manual replacement, session and history surfaces agree on the
 * unit for legacy rows that predate `repUnit`.
 *
 * The list is hand-maintained and the catalogue is not, which is a drift
 * trap — and it had already drifted. It was scoped to "exercises currently
 * authored as duration-based holds in programme TEMPLATES", which is only
 * two of these four; the other two are here because `replaceExercise` lets
 * the user swap in anything the ExercisePicker offers, and the picker offers
 * the whole catalogue. By that same route L-Sit and Farmer's Carry were
 * reachable and missing, so swapping a plank for either prescribed "3 × 10"
 * — ten reps of a hold, and ten reps of a carry.
 *
 * `repUnitsCatalogue.test.ts` now pins the membership against the catalogue
 * itself, so a timed exercise added later fails a test instead of shipping
 * as reps.
 */
export const TIMED_EXERCISE_IDS: ReadonlySet<string> = new Set([
  "plank",
  "superman-hold",
  "side-plank",
  "weighted-plank",
  // Held for time by definition — nobody performs a rep of an L-sit.
  "l-sit",
  // A loaded carry is prescribed by time or distance; the app has no
  // distance unit for lifting, so seconds is the honest one. "10 reps"
  // does not name anything the user can do.
  "farmers-carry",
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
