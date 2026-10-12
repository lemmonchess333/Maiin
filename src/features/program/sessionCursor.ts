/**
 * The live session's exercise cursor.
 *
 * `WorkoutSession` holds `currentExIndex` as component STATE, while the
 * exercise list arrives as a PROP. Nothing kept the two in agreement, and the
 * list can shrink under an open session — a re-render with a re-trimmed
 * express/easier plan, a slot removed from the day, a programState snapshot
 * landing from another device. When it does, `day.exercises[currentExIndex]`
 * is `undefined`, and the component renders off it.
 *
 * That is not a cosmetic edge case; it is a crash with a recognisable
 * fingerprint, photographed on 2026-08-04 at 09:16 in two states one minute
 * apart:
 *
 *   1. the session body renders with NO exercise name and "Set 1 of 0 · 0
 *      done" — because the name comes from the undefined exercise, and
 *      `setLogs[currentExIndex] ?? []` supplies the empty set list that makes
 *      the denominator 0;
 *   2. the whole /program route dies with "Something went wrong" — because
 *      the render then reaches an unguarded `currentExercise.name`.
 *
 * A zero-set prescription would still have had a NAME. The missing name is
 * what identifies this as an index desync rather than a bad prescription,
 * and it is why no set-count floor would have fixed it.
 */

/**
 * The largest index that can safely address `length` exercises.
 *
 * Returns 0 for an empty list — the caller must not render a session body in
 * that case, but 0 is the only non-negative answer and it keeps every
 * downstream array read in range instead of producing -1.
 */
export function clampExerciseIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  if (length <= 0) return 0;
  return Math.min(Math.trunc(index), length - 1);
}

type CursorSet = { completed: boolean; type?: string };

/**
 * Whether a set still waits to be done.
 *
 * A warm-up stops waiting once its exercise's sets that count have begun.
 * It is preparation: a lifter who went straight to the first working set
 * skipped it rather than left it for later, and the screen used to send
 * them back to it after every set, and keep the exercise open, until they
 * ticked a ramp they had not done. Warm-ups are dropped when the workout is
 * saved, so one left unticked changes nothing but the screen.
 */
export function isSetOutstanding(
  sets: readonly CursorSet[],
  index: number
): boolean {
  const set = sets[index];
  if (!set || set.completed) return false;
  if (set.type !== "warmup") return true;
  return !sets.some((other) => other.completed && other.type !== "warmup");
}

/** Whether nothing an exercise still needs is left to do. */
export function isExerciseDone(sets: readonly CursorSet[]): boolean {
  return sets.every((_, index) => !isSetOutstanding(sets, index));
}

/** Prefer the current exercise, then wrap to unfinished work elsewhere.
 * Array position is not evidence of completion: users may log out of order.
 * null means no set is outstanding (or there are no sets).
 */
export function nextIncompleteSet(
  logs: readonly (readonly CursorSet[])[],
  preferredExercise = 0
): { exerciseIndex: number; setIndex: number } | null {
  const start = clampExerciseIndex(preferredExercise, logs.length);
  for (let offset = 0; offset < logs.length; offset++) {
    const exerciseIndex = (start + offset) % logs.length;
    const sets = logs[exerciseIndex];
    const setIndex = sets.findIndex((_, index) =>
      isSetOutstanding(sets, index)
    );
    if (setIndex >= 0) return { exerciseIndex, setIndex };
  }
  return null;
}
