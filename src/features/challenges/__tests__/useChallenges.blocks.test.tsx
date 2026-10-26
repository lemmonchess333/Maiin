/**
 * Challenge leaderboards across a block (S4a pin 2, Polish3 call 1):
 * nobody either side of a block with the viewer is on their boards, and
 * the places close up behind whoever is left out. Blocking hides each
 * person from the other, so the person blocked's boards leave out the
 * blocker too, from the server's copy of the block (`blockedBy`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useChallenges } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "board-athlete" }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const DAY = 86_400_000;
const dayFromNow = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};
const progress = (currentValue: number, displayName: string) => ({
  currentValue,
  displayName,
  tierAchieved: null,
  joinedAt: dayFromNow(-2),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  resetFirestore();
  seedFirestore({
    "challenges/open": {
      name: "Training Minutes",
      metric: "training_minutes",
      type: "monthly",
      icon: "clock",
      tiers: { bronze: 120, silver: 300, gold: 600 },
      startDate: dayFromNow(-14),
      endDate: dayFromNow(16),
      participantCount: 4,
    },
    "challenges/open/participants/board-athlete": progress(150, "Me"),
    "challenges/open/participants/blocker": progress(400, "Blocker"),
    "challenges/open/participants/blocked": progress(300, "Blocked"),
    "challenges/open/participants/friend": progress(90, "Friend"),
    // The blocker blocked this athlete (the server's copy); this athlete
    // blocked "blocked".
    "blockedBy/board-athlete/users/blocker": {},
    "blocks/board-athlete/users/blocked": { blockedAt: 1 },
  });
});
afterEach(async () => {
  cleanup();
  await flushSnapshots();
  vi.useRealTimers();
});

describe("useChallenges leaderboards across a block", () => {
  it("leave out whoever blocked you and whoever you blocked, and close up the places", async () => {
    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await flushSnapshots();
      await flushSnapshots();
    });
    // POSITIVE anchor: the board has loaded, with the friend on it.
    await waitFor(() =>
      expect(result.current.leaderboards.open?.map((p) => p.uid)).toContain(
        "friend"
      )
    );
    await waitFor(() =>
      expect(
        result.current.leaderboards.open?.map((p) => [p.uid, p.rank])
      ).toEqual([
        ["board-athlete", 1],
        ["friend", 2],
      ])
    );
  });
});
