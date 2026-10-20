/**
 * What the challenges hook reads, and when. Challenges are never deleted,
 * and every join or leave anywhere rewrites a challenge's
 * `participantCount`, so the listener reaches back only as far as the
 * finale window and the progress and leaderboard reads follow the
 * challenges' ids, not each snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  deferReads,
  flushSnapshots,
  pendingReads,
  readLog,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useChallenges } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "athlete-a" }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const DAY = 86_400_000;
/** A UTC midnight `days` from the pinned clock's day. */
const dayFromNow = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};
const definition = (startDays: number, endDays: number) => ({
  name: "Training Minutes",
  metric: "training_minutes",
  type: "monthly",
  icon: "clock",
  tiers: { bronze: 120, silver: 300, gold: 600 },
  startDate: dayFromNow(startDays),
  endDate: dayFromNow(endDays),
  participantCount: 1,
});
const progress = (currentValue: number) => ({
  currentValue,
  tierAchieved: null,
  joinedAt: dayFromNow(-2),
});

/** The one-shot reads: progress (`getDoc`) and leaderboards (`getDocs`). */
const oneShotReads = () =>
  readLog().filter((r) => r.op === "getDoc" || r.op === "getDocs");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  resetFirestore();
  seedFirestore({
    "challenges/open": definition(-14, 16),
    "challenges/just-ended": definition(-33, -3),
    "challenges/open/participants/athlete-a": progress(150),
    "challenges/open/participants/athlete-b": progress(90),
  });
});
afterEach(async () => {
  cleanup();
  resumeReads();
  releaseAllReads();
  await flushSnapshots();
  vi.useRealTimers();
});

describe("useChallenges reads", () => {
  it("a participant count changing anywhere starts no progress or leaderboard read", async () => {
    const { result } = renderHook(() => useChallenges());
    await flushSnapshots();
    await flushSnapshots();
    expect(result.current.challenges.map((c) => c.id)).toEqual(["open"]);
    expect(result.current.leaderboards.open?.map((p) => p.uid)).toEqual([
      "athlete-a",
      "athlete-b",
    ]);

    // Held reads are the one-shot ones; a listener's re-delivery is not one.
    deferReads();
    await act(async () => {
      seedFirestore({
        "challenges/open": { ...definition(-14, 16), participantCount: 2 },
        "challenges/just-ended": {
          ...definition(-33, -3),
          participantCount: 5,
        },
      });
      await flushSnapshots();
    });

    expect(pendingReads()).toEqual([]);
  });

  it("pull-to-refresh reads the progress and the boards again", async () => {
    const { result } = renderHook(() => useChallenges());
    await flushSnapshots();
    await flushSnapshots();
    const before = oneShotReads();

    await act(async () => {
      await result.current.refreshProgress();
      await flushSnapshots();
    });

    const after = oneShotReads().slice(before.length);
    expect(after.some((r) => r.op === "getDoc")).toBe(true);
    expect(
      after.some(
        (r) => r.op === "getDocs" && r.path === "challenges/open/participants"
      )
    ).toBe(true);
  });

  it("reaches back only as far as the finale window", async () => {
    const undated: Record<string, unknown> = { ...definition(0, 1) };
    delete undated.endDate;
    seedFirestore({
      "challenges/long-ended": definition(-60, -30),
      "challenges/undated": undated,
    });
    renderHook(() => useChallenges());
    await flushSnapshots();
    await flushSnapshots();
    const progressReads = oneShotReads()
      .filter((r) => r.op === "getDoc")
      .map((r) => r.path);
    expect(progressReads).toContain("challenges/open/participants/athlete-a");
    expect(progressReads).toContain(
      "challenges/just-ended/participants/athlete-a"
    );
    expect(progressReads.some((p) => p.includes("long-ended"))).toBe(false);
    expect(progressReads.some((p) => p.includes("undated"))).toBe(false);
  });
});
