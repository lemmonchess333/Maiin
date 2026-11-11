/**
 * Taking out an exercise added in the session (Mob2 call 11), the inverse
 * of "Add exercise" (`sessionAdd.ts`).
 *
 * Only an exercise added today can go. A planned one keeps Skip: removing
 * it would be a change to the plan, which the session never makes. Added
 * exercises join the end of the session, so the planned ones always hold
 * the first places, in the plan's order, and an exercise is one added
 * today exactly when its place is past them. Removing one moves no planned
 * exercise, so nothing the plan reads by place (its progression baseline,
 * today's swaps) changes its meaning.
 *
 * Much of the session is held by place: each exercise's rows, its note,
 * the sets it set aside when skipped, last time's sets and note, and each
 * new best's set. Everything after the removed place moves up one. A
 * superset is held by its exercises' slots, and loses the one removed: a
 * group left with one exercise is no superset, and the two either side of
 * the removed one stay together, now neighbours.
 */
import type { SessionPrescription } from "./sessionCompletion";
import { supersetsWithout } from "./superset";
import { nextIncompleteSet } from "./sessionCursor";

/** Whether the exercise at `index` was added today, and so can be
 *  removed: its place is past the `planned` exercises the session was set
 *  out with. */
export function isAddedToday(index: number, planned: number): boolean {
  return Number.isInteger(index) && index >= planned;
}

/** A record kept by place, without `index`: the places after it move up
 *  one. */
export function withoutPlace<T>(
  byPlace: Readonly<Record<number, T>>,
  index: number
): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [key, value] of Object.entries(byPlace)) {
    const place = Number(key);
    if (place === index) continue;
    out[place > index ? place - 1 : place] = value;
  }
  return out;
}

/** The session's prescription without the exercise at `index`. */
export function removedFromSession(
  prescription: SessionPrescription,
  index: number
): SessionPrescription {
  const { exercises } = prescription;
  if (index < 0 || index >= exercises.length) return prescription;
  const supersets = supersetsWithout(exercises, prescription.supersets, index);
  const swaps = prescription.swaps
    ?.filter((swap) => swap.index !== index)
    .map((swap) =>
      swap.index > index ? { ...swap, index: swap.index - 1 } : swap
    );
  const { supersets: _old, swaps: _oldSwaps, ...rest } = prescription;
  return {
    ...rest,
    exercises: exercises.filter((_, i) => i !== index),
    ...(swaps ? { swaps } : {}),
    ...(supersets.length > 0 ? { supersets } : {}),
  };
}

type CursorSet = { completed: boolean; type?: string };

/**
 * Where the session's cursor goes once the exercise at `index` is gone,
 * given the rows that are left: it stays on the set it was on, which
 * moves up a place when it came after the removed exercise. On the removed
 * exercise it goes to the next set to do, from the exercise that took its
 * place (round to the first), and with none left to do, to the start of
 * the exercise in its place, or of the last one.
 */
export function cursorAfterRemoval(
  logs: readonly (readonly CursorSet[])[],
  index: number,
  cursor: { exerciseIndex: number; setIndex: number }
): { exerciseIndex: number; setIndex: number } {
  if (cursor.exerciseIndex < index) return cursor;
  if (cursor.exerciseIndex > index)
    return { ...cursor, exerciseIndex: cursor.exerciseIndex - 1 };
  if (logs.length === 0) return { exerciseIndex: 0, setIndex: 0 };
  return (
    nextIncompleteSet(logs, index % logs.length) ?? {
      exerciseIndex: Math.min(index, logs.length - 1),
      setIndex: 0,
    }
  );
}
