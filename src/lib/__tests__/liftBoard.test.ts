import { describe, expect, it } from "vitest";
import {
  liftBoardRows,
  ownLiftBest,
  parseLiftBoardEntry,
  type LiftBoardEntry,
} from "../liftBoard";

const entry = (uid: string, weightKg: number, reps = 1): LiftBoardEntry => ({
  uid,
  name: uid.toUpperCase(),
  photoURL: null,
  weightKg,
  reps,
  day: "2026-11-10",
  activityId: `post-${uid}`,
});

describe("your own best", () => {
  it("is your heaviest set across your sessions, the earlier on a tie", () => {
    expect(
      ownLiftBest([
        {
          workoutId: "b",
          date: "2026-11-12",
          sets: [{ weightKg: 100, reps: 3 }],
        },
        {
          workoutId: "a",
          date: "2026-11-01",
          sets: [{ weightKg: 100, reps: 3 }],
        },
        {
          workoutId: "c",
          date: "2026-11-05",
          sets: [{ weightKg: 95, reps: 8 }],
        },
      ])
    ).toEqual({ weightKg: 100, reps: 3, workoutId: "a", day: "2026-11-01" });
  });

  it("is nothing for sessions with no set that counts", () => {
    expect(
      ownLiftBest([
        {
          workoutId: "a",
          date: "2026-11-01",
          sets: [{ weightKg: 0, reps: 10 }],
        },
      ])
    ).toBeNull();
  });
});

describe("the board as the viewer reads it", () => {
  it("puts you among the people you follow, heaviest first, you first on a tie", () => {
    const rows = liftBoardRows(
      [entry("a", 120), entry("b", 100, 5), entry("c", 100, 3)],
      { weightKg: 100, reps: 5, workoutId: "w/1", day: "2026-11-02" },
      "me",
      new Set()
    );
    expect(rows.map((r) => r.uid)).toEqual(["a", "me", "b", "c"]);
    expect(rows[1]).toMatchObject({
      self: true,
      name: "You",
      href: "/workout/w%2F1",
    });
    expect(rows[0].href).toBe("/activity/post-a");
  });

  it("leaves out anyone blocked since it was read, and the viewer's own entry", () => {
    const rows = liftBoardRows(
      [entry("a", 120), entry("me", 200)],
      null,
      "me",
      new Set(["a"])
    );
    expect(rows).toEqual([]);
  });

  it("reads only rows with a weight and reps", () => {
    expect(parseLiftBoardEntry({ uid: "a", weightKg: 0, reps: 1 })).toBeNull();
    expect(parseLiftBoardEntry({ uid: "a", weightKg: 10 })).toBeNull();
    expect(parseLiftBoardEntry({ weightKg: 10, reps: 1 })).toBeNull();
    expect(
      parseLiftBoardEntry({ uid: "a", weightKg: 10, reps: 2, day: "bad" })
    ).toEqual({
      uid: "a",
      name: null,
      photoURL: null,
      weightKg: 10,
      reps: 2,
      day: null,
      activityId: null,
    });
  });
});
