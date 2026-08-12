/**
 * `repUnits.ts` holds a hand-maintained set of exercise ids; the exercise
 * catalogue is edited independently. Nothing connected the two, so the set
 * could fall behind silently — and it had.
 *
 * The consequence is not cosmetic. `replaceExercise` reads
 * `repUnitForExerciseId(replacementExerciseId)` and, when the unit changes,
 * re-prescribes from scratch: 30 for seconds, 10 for reps. An id missing
 * from the set therefore turns a swap into "3 × 10" — ten reps of a hold —
 * and `ExerciseHistory` then charts it on the reps axis.
 *
 * These tests tie the set to the catalogue in both directions. Neither
 * direction alone is enough: an over-broad set passes a coverage check, and
 * a set of typos passes an existence check.
 */
import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import {
  repUnitForExerciseId,
  isTimedExerciseId,
  TIMED_EXERCISE_IDS,
} from "../repUnits";

/** Ids the catalogue itself describes as held for time. A partial signal —
 *  `superman-hold` and `weighted-plank` are timed and don't use the phrase —
 *  so it is used as a lower bound on membership, never as the rule. */
const HELD_FOR_TIME = EXERCISES.filter((e) =>
  (e.instructions ?? []).some((line) => /hold for time/i.test(line))
);

describe("timed-exercise membership tracks the catalogue", () => {
  it("finds enough held-for-time exercises for the sweep to mean something", () => {
    // Without this, a catalogue refactor that dropped the phrase would make
    // the coverage test below pass over an empty list.
    expect(HELD_FOR_TIME.length).toBeGreaterThanOrEqual(3);
  });

  it("treats every held-for-time exercise as seconds", () => {
    /* The drift this catches, concretely: L-Sit says "Hold the L-shape…
       Hold for time" in its own instructions and was absent from the set,
       so swapping a plank for it prescribed ten reps. */
    for (const ex of HELD_FOR_TIME) {
      expect(isTimedExerciseId(ex.id), `${ex.id} (${ex.name})`).toBe(true);
    }
  });

  it("names only exercises that exist", () => {
    /* The other direction. A typo'd or renamed id sits in the set matching
       nothing, and the failure is invisible: the exercise just reads as
       reps, exactly as if the entry were absent.

       Enumerates the SET, not a list retyped here. An earlier draft
       iterated a hardcoded copy of the six ids — which is the source
       duplicated into the test, so it agreed with itself and a mutation
       that misspelled `farmers-carry` passed all six tests. */
    const known = new Set(EXERCISES.map((e) => e.id));
    expect(TIMED_EXERCISE_IDS.size).toBeGreaterThan(0);
    for (const id of TIMED_EXERCISE_IDS) {
      expect(known.has(id), `${id} is not in the catalogue`).toBe(true);
    }
    // …and the set is a real subset, not everything.
    const timed = EXERCISES.filter((e) => isTimedExerciseId(e.id));
    expect(timed.length).toBe(TIMED_EXERCISE_IDS.size);
    expect(timed.length).toBeLessThan(EXERCISES.length);
  });

  it("leaves rep-based movements alone", () => {
    /* Guards the guard. "Return seconds for everything" would satisfy the
       coverage test perfectly, and would put every barbell lift on a
       stopwatch. Includes the two the catalogue's Core section makes easy
       to over-match — a decline sit-up and a glute bridge are reps. */
    for (const id of [
      "barbell-squat",
      "bench-press",
      "decline-sit-up",
      "glute-bridge",
      "russian-twist",
    ]) {
      expect(isTimedExerciseId(id), id).toBe(false);
    }
  });
});

describe("repUnitForExerciseId", () => {
  it("returns seconds for a timed id and undefined otherwise", () => {
    /* `undefined` rather than "reps" is load-bearing: `replaceExercise`
       compares `(old.repUnit === "seconds") !== (next === "seconds")` to
       decide whether to re-prescribe, and migration writes the field only
       when it has something to say. */
    expect(repUnitForExerciseId("plank")).toBe("seconds");
    expect(repUnitForExerciseId("l-sit")).toBe("seconds");
    expect(repUnitForExerciseId("bench-press")).toBeUndefined();
  });

  it("handles a missing id without claiming it is timed", () => {
    expect(repUnitForExerciseId(undefined)).toBeUndefined();
    expect(repUnitForExerciseId("")).toBeUndefined();
    expect(isTimedExerciseId(undefined)).toBe(false);
  });
});
