/**
 * The session cursor clamp — pinned because its failure was a route crash
 * with a recognisable fingerprint.
 *
 * `WorkoutSession` holds `currentExIndex` as component state while the
 * exercise list is a prop that can shrink under an open session. Two device
 * screenshots one minute apart on 2026-08-04 caught both halves: first the
 * session body rendering with NO exercise name and "Set 1 of 0 · 0 done",
 * then the whole /program route dying with "Something went wrong".
 *
 * The missing NAME is what identifies this. A zero-set prescription would
 * still have had one — so no set-count floor would have fixed it, which is
 * the fix I was about to build before re-reading the screenshot.
 */
import { describe, it, expect } from "vitest";

import { clampExerciseIndex, nextIncompleteSet } from "../sessionCursor";

describe("clampExerciseIndex", () => {
  it("leaves an in-range cursor alone", () => {
    expect(clampExerciseIndex(0, 4)).toBe(0);
    expect(clampExerciseIndex(2, 4)).toBe(2);
    expect(clampExerciseIndex(3, 4)).toBe(3);
  });

  it("pulls a cursor back when the list shrinks under it", () => {
    // The production case: a 4-exercise session re-trimmed to 3 while the
    // cursor sat on the 4th. Pre-fix this indexed past the end.
    expect(clampExerciseIndex(3, 3)).toBe(2);
    expect(clampExerciseIndex(9, 3)).toBe(2);
  });

  it("never returns a negative index for an empty list", () => {
    // length - 1 would be -1 here, which reads as undefined everywhere and
    // reintroduces the same crash by a different route.
    expect(clampExerciseIndex(0, 0)).toBe(0);
    expect(clampExerciseIndex(5, 0)).toBe(0);
  });

  it("floors a negative or non-finite cursor at 0", () => {
    expect(clampExerciseIndex(-1, 4)).toBe(0);
    expect(clampExerciseIndex(Number.NaN, 4)).toBe(0);
  });

  it("truncates a fractional cursor rather than producing a hole", () => {
    expect(clampExerciseIndex(1.9, 4)).toBe(1);
  });
});

describe("nextIncompleteSet", () => {
  const done = { completed: true };
  const pending = { completed: false };
  it("resumes after completed warm-ups and skips out-of-order logged sets", () => {
    expect(nextIncompleteSet([[done, pending, pending, done]], 0)).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
    });
  });
  it("wraps from the final exercise to an unfinished earlier exercise", () => {
    expect(nextIncompleteSet([[done], [pending, done], [done]], 2)).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
    });
  });
  it("keeps the current exercise if it has unfinished work", () => {
    expect(nextIncompleteSet([[pending], [done, pending]], 1)).toEqual({
      exerciseIndex: 1,
      setIndex: 1,
    });
  });
  it("only signals completion once all sets are done", () => {
    expect(nextIncompleteSet([[done], [done]], 1)).toBeNull();
    expect(nextIncompleteSet([])).toBeNull();
  });
  it("handles an invalid saved exercise index and empty exercises", () => {
    expect(nextIncompleteSet([[], [pending]], 99)).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
    });
  });
});
