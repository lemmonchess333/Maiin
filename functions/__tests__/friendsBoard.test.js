/**
 * The friends board's weekly tally (Polish2 call 5): a person's own week,
 * counted as the challenges count, kept only for someone who said yes.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const board = require("../lib/friendsBoard");

// Wednesday 21 October 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 9, 21, 12);

const lift = (date, extra = {}) => ({
  date,
  exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
  totalVolume: 500,
  ...extra,
});
const run = (date, extra = {}) => ({
  date,
  distance: 5000,
  duration: 1500,
  ...extra,
});

describe("the week", () => {
  it("starts on the Monday of a day", () => {
    expect(board.weekKeyOf("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(board.weekKeyOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(board.weekKeyOf("2026-10-26")).toBe("2026-10-26");
  });

  it("is the person's own: Monday morning in Auckland is still Sunday in UTC", () => {
    // Sunday 25 Oct 2026, 20:00 UTC = Monday 26 Oct, 09:00 in Auckland.
    const now = Date.UTC(2026, 9, 25, 20);
    expect(board.currentWeek("Pacific/Auckland", now).weekKey).toBe(
      "2026-10-26"
    );
    expect(board.currentWeek(null, now).weekKey).toBe("2026-10-19");
  });

  it("ends at midnight where they are, across a clock change", () => {
    // London's clocks go back on Sunday 25 October 2026, so the week
    // ending Monday 26 October ends at 00:00 GMT, not BST.
    const { weekEndsAt } = board.currentWeek("Europe/London", NOW);
    expect(weekEndsAt.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    const ny = board.currentWeek("America/New_York", NOW).weekEndsAt;
    expect(ny.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("falls back to UTC for a timezone Intl does not know", () => {
    expect(board.localMidnightMs("2026-10-26", "Not/AZone")).toBe(
      Date.UTC(2026, 9, 26)
    );
  });
});

describe("tallyWeek", () => {
  it("counts every saved workout and every run the challenges would credit", () => {
    const tally = board.tallyWeek(
      [lift("2026-10-19"), lift("2026-10-20", { totalVolume: undefined })],
      [
        run("2026-10-19"),
        run("2026-10-20", { savedAnyway: true }), // not eligible
        run("2026-10-21", { distance: 30, duration: 20 }), // under the floor
        run("2026-10-21", { distance: 600000, duration: 3600 }), // implausible
      ]
    );
    expect(tally).toEqual({
      sessions: 3,
      lifts: 2,
      runs: 1,
      distanceM: 5000,
      volumeKg: 1000,
    });
  });

  it("a short session counts, as it does in the challenges", () => {
    const tally = board.tallyWeek(
      [lift("2026-10-19", { durationMinutes: 2 })],
      [run("2026-10-19", { distance: 50, duration: 30 })]
    );
    expect(tally.sessions).toBe(2);
  });
});

describe("refreshBoardWeek", () => {
  const seeded = (user, sessions = {}) =>
    memoryFirestore({
      "users/u1": user,
      "users/u1/workouts/w1": lift("2026-10-19"),
      "users/u1/runs/r1": run("2026-10-20"),
      // Last week's: not this week's tally.
      "users/u1/workouts/old": lift("2026-10-12"),
      ...sessions,
    });

  it("stores nothing for someone who never said yes", async () => {
    const firestore = seeded({ timezone: "Europe/London" });
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-19"], {
      now: NOW,
    });
    expect(firestore.data.has("friendsBoard/u1")).toBe(false);
  });

  it("stores nothing for someone who said no", async () => {
    const firestore = seeded({ showWeekOnBoard: false });
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-19"], {
      now: NOW,
    });
    expect(firestore.data.has("friendsBoard/u1")).toBe(false);
  });

  it("recomputes this week from the sessions saved in it", async () => {
    const firestore = seeded({
      showWeekOnBoard: true,
      timezone: "Europe/London",
    });
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-20"], {
      now: NOW,
    });
    expect(firestore.data.get("friendsBoard/u1")).toMatchObject({
      uid: "u1",
      weekKey: "2026-10-19",
      sessions: 2,
      lifts: 1,
      runs: 1,
      distanceM: 5000,
      volumeKg: 500,
    });
    expect(firestore.data.get("friendsBoard/u1").weekEndsAt.toISOString()).toBe(
      "2026-10-26T00:00:00.000Z"
    );
  });

  it("a session deleted from this week comes off it", async () => {
    const firestore = seeded({ showWeekOnBoard: true });
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-20"], {
      now: NOW,
    });
    firestore.data.delete("users/u1/runs/r1");
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-20"], {
      now: NOW,
    });
    expect(firestore.data.get("friendsBoard/u1")).toMatchObject({
      sessions: 1,
      runs: 0,
      distanceM: 0,
    });
  });

  it("a session from a week already over changes nothing", async () => {
    const firestore = seeded({ showWeekOnBoard: true });
    await board.refreshBoardWeek(firestore, "u1", ["2026-10-12"], {
      now: NOW,
    });
    expect(firestore.data.has("friendsBoard/u1")).toBe(false);
  });
});

describe("writeBoardWeek", () => {
  it("writes nothing for someone whose answer turned to no meanwhile", async () => {
    // refreshBoardWeek read yes; setBoardSharing(no) landed before the
    // transaction that writes the tally.
    const firestore = memoryFirestore({
      "users/u1": { showWeekOnBoard: false },
      "users/u1/workouts/w1": lift("2026-10-19"),
    });
    await board.writeBoardWeek(firestore, "u1", board.currentWeek(null, NOW));
    expect(firestore.data.has("friendsBoard/u1")).toBe(false);
  });
});

describe("setBoardSharing", () => {
  it("yes stores the answer and this week at once", async () => {
    const firestore = memoryFirestore({
      "users/u1": { timezone: "Europe/London" },
      "users/u1/workouts/w1": lift("2026-10-19"),
    });
    await board.setBoardSharing(firestore, "u1", true, { now: NOW });
    expect(firestore.data.get("users/u1").showWeekOnBoard).toBe(true);
    expect(firestore.data.get("friendsBoard/u1")).toMatchObject({
      weekKey: "2026-10-19",
      sessions: 1,
    });
  });

  it("no stores the answer and leaves nothing of the week to read", async () => {
    const firestore = memoryFirestore({
      "users/u1": { showWeekOnBoard: true },
      "friendsBoard/u1": { sessions: 4 },
    });
    await board.setBoardSharing(firestore, "u1", false, { now: NOW });
    expect(firestore.data.get("users/u1").showWeekOnBoard).toBe(false);
    expect(firestore.data.has("friendsBoard/u1")).toBe(false);
  });
});
