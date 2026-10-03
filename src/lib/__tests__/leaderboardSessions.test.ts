/**
 * buildLeaderboard against the Firestore fake, through the saved-session
 * readers: each athlete's sessions that BELONG to this week (Lift3, the day
 * a session started), eligible runs only, and lifting volume by the one
 * tonnage rule (a timed hold lifts nothing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import { buildLeaderboard } from "../leaderboard";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";

// Wednesday 30 September 2026, noon. The week began on Monday the 28th.
const NOW = new Date(2026, 8, 30, 12);

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("buildLeaderboard — running distance", () => {
  it("counts each athlete's runs that belong to this week", async () => {
    seedFirestore({
      "following/me/users/friend": { followedAt: 1 },
      "users/me/runs/monday": savedRunDoc("2026-09-28", { distance: 5000 }),
      "users/friend/runs/tuesday": savedRunDoc("2026-09-29", {
        distance: 8000,
      }),
      // Begun on Sunday night and saved at 00:30 on Monday: last week's run.
      "users/friend/runs/late": savedRunDoc(
        "2026-09-27",
        { distance: 21000 },
        new Date(2026, 8, 28, 0, 30)
      ),
      // A saved-anyway misclick never counts.
      "users/me/runs/bogus": savedRunDoc("2026-09-29", {
        distance: 40000,
        duration: 8,
        isInvalid: true,
        savedAnyway: true,
      }),
    });

    const board = await buildLeaderboard("me", "weekly_distance");

    expect(board.map((e) => [e.uid, e.value])).toEqual([
      ["friend", 8],
      ["me", 5],
    ]);
  });
});

describe("buildLeaderboard — lifting volume", () => {
  it("sums this week's lifting, with a timed hold lifting nothing", async () => {
    seedFirestore({
      "following/me/users/friend": { followedAt: 1 },
      // 80 kg x 5 x 2 = 800 kg.
      "users/me/workouts/bench": savedWorkoutDoc("2026-09-29"),
      // 100 kg x 5 = 500 kg, plus a 20 kg plank held for 60 s.
      "users/friend/workouts/mixed": savedWorkoutDoc("2026-09-28", {
        exercises: [
          {
            exerciseId: "squat",
            exerciseName: "Squat",
            category: "legs",
            sets: [{ setNumber: 1, reps: 5, weightKg: 100 }],
            caloriesBurned: 0,
          },
          {
            exerciseId: "weighted-plank",
            exerciseName: "Weighted Plank",
            category: "core",
            repUnit: "seconds",
            sets: [{ setNumber: 1, reps: 60, weightKg: 20 }],
            caloriesBurned: 0,
          },
        ],
      }),
      // Last week's session does not count.
      "users/friend/workouts/old": savedWorkoutDoc("2026-09-27"),
    });

    const board = await buildLeaderboard("me", "weekly_volume");

    expect(board.map((e) => [e.uid, e.value])).toEqual([
      ["me", 800],
      ["friend", 500],
    ]);
  });
});
