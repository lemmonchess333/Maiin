/**
 * Removing an exercise added in the session (Mob2 call 11): which can go,
 * how what the session holds by place moves up, how a superset loses the
 * exercise, and where the cursor lands.
 */
import { describe, expect, it } from "vitest";
import {
  cursorAfterRemoval,
  isAddedToday,
  removedFromSession,
  withoutPlace,
} from "../sessionRemove";
import { supersetsWithout } from "../superset";
import type { ProgramExercise } from "../programTypes";
import type { SessionPrescription } from "../sessionCompletion";

const lift = (instanceId: string) =>
  ({
    exerciseId: instanceId,
    name: instanceId,
    instanceId,
    sets: 3,
    reps: 8,
    weight: 20,
  }) as ProgramExercise;

const prescription = (
  ids: string[],
  more: Partial<SessionPrescription> = {}
): SessionPrescription => ({
  dayName: "Push",
  exercises: ids.map(lift),
  progressionBaseline: ids.slice(0, 2).map(lift),
  ...more,
});

const sets = (done: number, of: number) =>
  Array.from({ length: of }, (_, i) => ({
    completed: i < done,
    type: "working",
  }));

describe("which exercise can be removed", () => {
  it("is one added today, past the planned ones", () => {
    expect(isAddedToday(0, 2)).toBe(false);
    expect(isAddedToday(1, 2)).toBe(false);
    expect(isAddedToday(2, 2)).toBe(true);
    // An empty workout's exercises are all added.
    expect(isAddedToday(0, 0)).toBe(true);
  });
});

describe("what the session holds by place", () => {
  it("drops the removed place and moves the ones after it up", () => {
    expect(withoutPlace({ 0: "a", 2: "c", 3: "d" }, 2)).toEqual({
      0: "a",
      2: "d",
    });
    expect(withoutPlace({ 1: "b" }, 3)).toEqual({ 1: "b" });
  });

  it("takes the exercise out of the prescription, keeping the plan's baseline", () => {
    const next = removedFromSession(prescription(["a", "b", "c", "d"]), 2);
    expect(next.exercises.map((ex) => ex.instanceId)).toEqual(["a", "b", "d"]);
    expect(next.progressionBaseline.map((ex) => ex.instanceId)).toEqual([
      "a",
      "b",
    ]);
    expect(next.dayName).toBe("Push");
  });

  it("moves a swap after the removed place up with its exercise", () => {
    const next = removedFromSession(
      prescription(["a", "b", "c", "d"], {
        swaps: [{ index: 1 }, { index: 3, keep: false }],
      }),
      2
    );
    expect(next.swaps).toEqual([{ index: 1 }, { index: 2, keep: false }]);
  });

  it("leaves a place out of range alone", () => {
    const before = prescription(["a", "b"]);
    expect(removedFromSession(before, 5)).toBe(before);
  });
});

describe("a superset losing an exercise", () => {
  const session = ["a", "b", "c", "d"].map((instanceId) => ({ instanceId }));

  it("dissolves a pair", () => {
    expect(supersetsWithout(session, [{ ids: ["c", "d"] }], 3)).toEqual([]);
    const next = removedFromSession(
      prescription(["a", "b", "c", "d"], { supersets: [{ ids: ["c", "d"] }] }),
      3
    );
    expect(next.supersets).toBeUndefined();
  });

  it("shrinks a larger group, whose two sides are neighbours now", () => {
    expect(supersetsWithout(session, [{ ids: ["b", "c", "d"] }], 2)).toEqual([
      { ids: ["b", "d"] },
    ]);
  });

  it("leaves another group as it was", () => {
    expect(
      supersetsWithout(session, [{ ids: ["a", "b"] }, { ids: ["c", "d"] }], 3)
    ).toEqual([{ ids: ["a", "b"] }]);
  });
});

describe("where the cursor goes", () => {
  it("stays on its set before the removed place, and moves up after it", () => {
    const logs = [sets(0, 3), sets(0, 3), sets(0, 3)];
    expect(
      cursorAfterRemoval(logs, 2, { exerciseIndex: 1, setIndex: 2 })
    ).toEqual({ exerciseIndex: 1, setIndex: 2 });
    expect(
      cursorAfterRemoval(logs, 1, { exerciseIndex: 3, setIndex: 1 })
    ).toEqual({ exerciseIndex: 2, setIndex: 1 });
  });

  it("on the removed exercise, goes to the next set to do from its place", () => {
    const logs = [sets(3, 3), sets(1, 3), sets(3, 3)];
    expect(
      cursorAfterRemoval(logs, 1, { exerciseIndex: 1, setIndex: 0 })
    ).toEqual({ exerciseIndex: 1, setIndex: 1 });
    // The last exercise removed: round to the first with a set left.
    expect(
      cursorAfterRemoval([sets(1, 3), sets(3, 3)], 2, {
        exerciseIndex: 2,
        setIndex: 0,
      })
    ).toEqual({ exerciseIndex: 0, setIndex: 1 });
  });

  it("with nothing left to do, goes to the exercise in its place, or the last", () => {
    const logs = [sets(3, 3), sets(3, 3)];
    expect(
      cursorAfterRemoval(logs, 1, { exerciseIndex: 1, setIndex: 2 })
    ).toEqual({ exerciseIndex: 1, setIndex: 0 });
    expect(
      cursorAfterRemoval(logs, 2, { exerciseIndex: 2, setIndex: 2 })
    ).toEqual({ exerciseIndex: 1, setIndex: 0 });
    expect(
      cursorAfterRemoval([], 0, { exerciseIndex: 0, setIndex: 1 })
    ).toEqual({ exerciseIndex: 0, setIndex: 0 });
  });
});
