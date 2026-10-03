/**
 * buildLeaderboard's running distance, read through the one saved-run
 * reader against the Firestore fake: each athlete's runs that BELONG to
 * this week (Lift3, the day a run started), eligible runs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import { buildLeaderboard } from "../leaderboard";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

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
