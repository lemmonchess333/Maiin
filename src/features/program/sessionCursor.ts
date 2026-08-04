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
