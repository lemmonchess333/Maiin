import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useChallenges } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "rollover-athlete" }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));

const timestamp = (day: string) =>
  Timestamp.fromDate(new Date(`${day}T00:00:00Z`));
const monthly = (month: string, end: string) => ({
  name: `${month === "2026-10-01" ? "October" : "November"} Mileage`,
  type: "monthly",
  metric: "total_km",
  tiers: { bronze: 10, silver: 25, gold: 50 },
  startDate: timestamp(month),
  endDate: timestamp(end),
  participantCount: 1,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 50));
  resetFirestore();
  seedFirestore({
    "challenges/monthly-2026-10-01": monthly("2026-10-01", "2026-11-01"),
    "challenges/monthly-2026-11-01": monthly("2026-11-01", "2026-12-01"),
    "challenges/seasonal-2026-09-01": {
      ...monthly("2026-10-01", "2026-12-01"),
      name: "Autumn Push",
      type: "seasonal",
      startDate: timestamp("2026-09-01"),
    },
    "challenges/monthly-2026-10-01/participants/rollover-athlete": {
      uid: "rollover-athlete",
      currentValue: 25,
      tierAchieved: "silver",
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("challenge rollover without a server write", () => {
  it("an open app moves to November, keeping Autumn and the October finale", async () => {
    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await flushSnapshots();
    });
    expect(result.current.challenges.map((c) => c.id)).toEqual([
      "monthly-2026-10-01",
      "seasonal-2026-09-01",
    ]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await flushSnapshots();
    });
    expect(result.current.challenges.map((c) => c.id)).toEqual([
      "monthly-2026-11-01",
      "seasonal-2026-09-01",
    ]);
    expect(result.current.myEndedChallenges.map((c) => c.id)).toEqual([
      "monthly-2026-10-01",
    ]);
    expect(result.current.myProgress["monthly-2026-10-01"].currentValue).toBe(
      25
    );
    expect(result.current.myChallenges).toEqual([]);
  });

  it("returning to the app refreshes the period immediately", async () => {
    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await flushSnapshots();
    });
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await flushSnapshots();
    });
    expect(result.current.challenges.map((c) => c.id)).toContain(
      "monthly-2026-11-01"
    );
    expect(result.current.challenges.map((c) => c.id)).not.toContain(
      "monthly-2026-10-01"
    );
  });
});
