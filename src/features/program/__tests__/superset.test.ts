/**
 * Supersets in a session (Mob1 call 2): how they are made and unmade, the
 * order the logger takes their sets in, where the rest goes, and how the
 * saved workout numbers them.
 */
import { describe, expect, it } from "vitest";
import {
  canSupersetWithNext,
  leaveSuperset,
  nextInSuperset,
  supersetAt,
  supersetLabel,
  supersetNumbers,
  supersetWithNext,
} from "../superset";

const ex = (...ids: string[]) => ids.map((instanceId) => ({ instanceId }));
const sets = (done: number, of: number) =>
  Array.from({ length: of }, (_, i) => ({
    completed: i < done,
    type: "working",
  }));

describe("making and unmaking a superset", () => {
  const session = ex("a", "b", "c", "d");

  it("puts an exercise with the next one, and a third joins the group", () => {
    const two = supersetWithNext(session, undefined, 0);
    expect(two).toEqual([{ ids: ["a", "b"] }]);
    expect(supersetAt(session, two, 1)).toEqual([0, 1]);
    const three = supersetWithNext(session, two, 1);
    expect(three).toEqual([{ ids: ["a", "b", "c"] }]);
    expect(supersetAt(session, three, 2)).toEqual([0, 1, 2]);
    expect(supersetAt(session, three, 3)).toBeNull();
  });

  it("is not offered for the last exercise, or with one already in a group", () => {
    expect(canSupersetWithNext(session, undefined, 3)).toBe(false);
    const cd = [{ ids: ["c", "d"] }];
    expect(canSupersetWithNext(session, cd, 1)).toBe(false);
    expect(canSupersetWithNext(session, cd, 0)).toBe(true);
    // Asked anyway, nothing changes.
    expect(supersetWithNext(session, cd, 1)).toEqual(cd);
  });

  it("an exercise leaving keeps the rest together where they are still neighbours", () => {
    const abc = [{ ids: ["a", "b", "c"] }];
    expect(leaveSuperset(session, abc, 2)).toEqual([{ ids: ["a", "b"] }]);
    // The middle one out leaves two exercises alone: no superset.
    expect(leaveSuperset(session, abc, 1)).toEqual([]);
    expect(leaveSuperset(session, [{ ids: ["a", "b"] }], 0)).toEqual([]);
  });
});

describe("the order a superset is logged in", () => {
  const members = [0, 1];

  it("goes A1 → B1 → A2 → B2, resting after B each round", () => {
    // A1 done: B1 next, no rest.
    expect(nextInSuperset([sets(1, 2), sets(0, 2)], members, 0)).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
      rest: false,
    });
    // B1 done: back to A2, after the rest.
    expect(nextInSuperset([sets(1, 2), sets(1, 2)], members, 1)).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
      rest: true,
    });
    // A2 done: B2.
    expect(nextInSuperset([sets(2, 2), sets(1, 2)], members, 0)).toEqual({
      exerciseIndex: 1,
      setIndex: 1,
      rest: false,
    });
    // B2 done: the group is finished.
    expect(nextInSuperset([sets(2, 2), sets(2, 2)], members, 1)).toBeNull();
  });

  it("a longer exercise finishes its own sets, resting between them", () => {
    // A has three sets, B two; after B2 the third A is a round of its own.
    expect(nextInSuperset([sets(2, 3), sets(2, 2)], members, 1)).toEqual({
      exerciseIndex: 0,
      setIndex: 2,
      rest: true,
    });
    expect(nextInSuperset([sets(3, 4), sets(2, 2)], members, 0)).toEqual({
      exerciseIndex: 0,
      setIndex: 3,
      rest: true,
    });
  });

  it("keeps a warm-up on its exercise, and turns on working sets only", () => {
    /** Three warm-ups then two working sets, `done` of them ticked. */
    const ramped = (done: number) =>
      [
        ...Array.from({ length: 3 }, () => ({ type: "warmup" })),
        ...Array.from({ length: 2 }, () => ({ type: "working" })),
      ].map((row, i) => ({ ...row, completed: i < done }));
    // The first warm-up done: the next is the second, after a warm-up rest,
    // not the partner's first working set.
    expect(nextInSuperset([ramped(1), sets(0, 2)], members, 0, true)).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
      rest: true,
    });
    // The last warm-up done: this exercise's first working set.
    expect(nextInSuperset([ramped(3), sets(0, 2)], members, 0, true)).toEqual({
      exerciseIndex: 0,
      setIndex: 3,
      rest: true,
    });
    // Its first working set done: now the partner, with no rest between.
    expect(nextInSuperset([ramped(4), sets(0, 2)], members, 0)).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
      rest: false,
    });
  });

  it("passes over an exercise skipped today", () => {
    // B's rows set aside: A goes on alone.
    expect(nextInSuperset([sets(1, 3), []], members, 0)).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
      rest: true,
    });
  });
});

describe("the saved workout's supersets", () => {
  it("numbers each group in session order, and leaves the rest unmarked", () => {
    const session = ex("a", "b", "c", "d", "e");
    expect(
      supersetNumbers(session, [{ ids: ["d", "e"] }, { ids: ["a", "b"] }])
    ).toEqual([1, 1, undefined, 2, 2]);
    expect(supersetNumbers(session, undefined)).toEqual(
      Array(5).fill(undefined)
    );
  });

  it("names a group by letter", () => {
    expect(supersetLabel(1)).toBe("Superset A");
    expect(supersetLabel(2)).toBe("Superset B");
  });
});
