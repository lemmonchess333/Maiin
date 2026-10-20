/**
 * The friends board's read against the Firestore fake (Polish2 call 5):
 * one tally per person, `friendsBoard/{uid}`, for you and everyone you
 * follow who shares their week, and each board's order from those.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import { Timestamp } from "firebase/firestore";
import {
  countMyWeekLifts,
  loadBoardWeeks,
  rankBoard,
  type BoardWeek,
} from "../leaderboard";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";

// Wednesday 30 September 2026, noon. The week began on Monday the 28th.
const NOW = new Date(2026, 8, 30, 12);
const WEEK_ENDS = Timestamp.fromDate(new Date(2026, 9, 5));

const tally = (
  fields: Partial<BoardWeek> & { weekKey?: string; weekEndsAt?: Timestamp } = {}
) => ({
  weekKey: "2026-09-28",
  weekEndsAt: WEEK_ENDS,
  sessions: 0,
  lifts: 0,
  runs: 0,
  distanceM: 0,
  volumeKg: 0,
  ...fields,
});

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("loadBoardWeeks", () => {
  it("reads your week and the weeks of the people you follow who share theirs", async () => {
    seedFirestore({
      "following/me/users/maya": { followedAt: 1 },
      "following/me/users/sam": { followedAt: 1 },
      "friendsBoard/me": tally({ sessions: 2, lifts: 2, volumeKg: 1800 }),
      "friendsBoard/maya": tally({ sessions: 3, runs: 3, distanceM: 15400 }),
      // Sam never shared their week, so there is no tally to read.
    });

    const weeks = await loadBoardWeeks("me", NOW.getTime());

    expect(weeks.map((w) => [w.uid, w.sessions])).toEqual([
      ["me", 2],
      ["maya", 3],
    ]);
  });

  it("a week refused (a block, a follow since removed) is left out, not the board", async () => {
    seedFirestore({
      "following/me/users/maya": { followedAt: 1 },
      "following/me/users/sam": { followedAt: 1 },
      "friendsBoard/maya": tally({ sessions: 3 }),
      "friendsBoard/sam": tally({ sessions: 1 }),
    });
    failNextFirestore("getDoc", { path: "friendsBoard/maya" });

    const weeks = await loadBoardWeeks("me", NOW.getTime());

    expect(weeks.map((w) => w.uid)).toEqual(["sam"]);
  });

  it("any other failure fails the board, so it can say so", async () => {
    seedFirestore({ "friendsBoard/me": tally({ sessions: 1 }) });
    failNextFirestore("getDoc", {
      path: "friendsBoard/me",
      code: "unavailable",
    });

    await expect(loadBoardWeeks("me", NOW.getTime())).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("a tally from a week already over is a week with nothing in it yet", async () => {
    seedFirestore({
      "following/me/users/maya": { followedAt: 1 },
      "friendsBoard/maya": tally({
        weekKey: "2026-09-21",
        weekEndsAt: Timestamp.fromDate(new Date(2026, 8, 28)),
        sessions: 5,
        distanceM: 30000,
      }),
    });

    const [maya] = await loadBoardWeeks("me", NOW.getTime());

    expect(maya).toMatchObject({ uid: "maya", sessions: 0, distanceM: 0 });
  });
});

describe("rankBoard", () => {
  const weeks: BoardWeek[] = [
    {
      uid: "me",
      sessions: 2,
      lifts: 2,
      runs: 0,
      distanceM: 0,
      volumeKg: 1849.6,
    },
    {
      uid: "maya",
      sessions: 3,
      lifts: 0,
      runs: 3,
      distanceM: 15449,
      volumeKg: 0,
    },
    { uid: "sam", sessions: 1, lifts: 1, runs: 0, distanceM: 0, volumeKg: 900 },
  ];
  const order = (challenge: Parameters<typeof rankBoard>[1]) =>
    rankBoard(weeks, challenge).map((e) => [e.uid, e.value, e.rank]);

  it("ranks sessions, the one measure a lifter and a runner share", () => {
    expect(order("weekly_sessions")).toEqual([
      ["maya", 3, 1],
      ["me", 2, 2],
      ["sam", 1, 3],
    ]);
  });

  it("distance in km to a tenth, volume in whole kg, lifts by count", () => {
    expect(order("weekly_distance")[0]).toEqual(["maya", 15.4, 1]);
    expect(order("weekly_volume")[0]).toEqual(["me", 1850, 1]);
    expect(order("weekly_workouts").slice(0, 2)).toEqual([
      ["me", 2, 1],
      ["sam", 1, 2],
    ]);
  });
});

describe("countMyWeekLifts", () => {
  it("counts your own lifts that belong to this week", async () => {
    seedFirestore({
      "users/me/workouts/monday": savedWorkoutDoc("2026-09-28"),
      "users/me/workouts/tuesday": savedWorkoutDoc("2026-09-29"),
      // Last week's session does not count.
      "users/me/workouts/old": savedWorkoutDoc("2026-09-27"),
    });

    expect(await countMyWeekLifts("me")).toBe(2);
  });
});
