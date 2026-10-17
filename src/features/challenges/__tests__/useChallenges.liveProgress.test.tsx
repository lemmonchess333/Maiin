import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  deferReads,
  failNextFirestore,
  flushSnapshots,
  pendingReads,
  readLog,
  releaseAllReads,
  releaseRead,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useChallenges } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const auth = vi.hoisted(() => ({ uid: "athlete-a" as string | null }));
vi.mock("@/lib/auth", () => ({ useUid: () => auth.uid }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const ID = "featured-monthly-2026-10-01";
const path = (uid: string) => `challenges/${ID}/participants/${uid}`;
const timestamp = (day: string) =>
  Timestamp.fromDate(new Date(`${day}T00:00:00Z`));
const progress = (currentValue: number) => ({
  currentValue,
  tierAchieved: null,
  joinedAt: timestamp("2026-10-01"),
});
const definition = {
  name: "October Training Minutes",
  metric: "training_minutes",
  type: "monthly",
  icon: "clock",
  tiers: { bronze: 120, silver: 300, gold: 600 },
  startDate: timestamp("2026-10-01"),
  endDate: timestamp("2026-11-01"),
  participantCount: 1,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  auth.uid = "athlete-a";
  resetFirestore();
  seedFirestore({
    [`challenges/${ID}`]: definition,
    "users/athlete-a": { displayName: "Athlete" },
  });
});
afterEach(async () => {
  cleanup();
  resumeReads();
  releaseAllReads();
  await flushSnapshots();
  vi.useRealTimers();
});

describe("useChallenges live participation overlay", () => {
  it("shows backfill after joining and updates again after a leave and rejoin", async () => {
    const { result } = renderHook(() => useChallenges());
    await flushSnapshots();
    await act(async () => {
      await result.current.joinChallenge(ID);
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(0);
    await act(async () => {
      seedFirestore({ [path("athlete-a")]: progress(125.5) });
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(125.5);
    await act(async () => {
      await result.current.leaveChallenge(ID);
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID]).toBeUndefined();
    await act(async () => {
      await result.current.joinChallenge(ID);
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(0);
    await act(async () => {
      seedFirestore({ [path("athlete-a")]: progress(200) });
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(200);
  });

  it("a slow one-shot refresh cannot roll back a newer snapshot or restore deleted membership", async () => {
    seedFirestore({ [path("athlete-a")]: progress(0) });
    const { result } = renderHook(() => useChallenges());
    await flushSnapshots();
    deferReads();
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshProgress();
    });
    expect(pendingReads()).toContain(path("athlete-a"));
    await act(async () => {
      seedFirestore({ [path("athlete-a")]: progress(180) });
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(180);
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
      await refreshing;
    });
    expect(result.current.myProgress[ID].currentValue).toBe(180);
    resumeReads();
    releaseAllReads();
    await flushSnapshots();

    deferReads();
    act(() => {
      refreshing = result.current.refreshProgress();
    });
    await act(async () => {
      await result.current.leaveChallenge(ID);
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID]).toBeUndefined();
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
      await refreshing;
    });
    expect(result.current.myProgress[ID]).toBeUndefined();
  });

  it("ignores reads from an old account and clears progress on sign out", async () => {
    seedFirestore({
      [path("athlete-a")]: progress(200),
      [path("athlete-b")]: progress(12),
    });
    const { result, rerender } = renderHook(() => useChallenges());
    await flushSnapshots();
    expect(result.current.myProgress[ID].currentValue).toBe(200);
    deferReads();
    act(() => {
      void result.current.refreshProgress();
    });
    auth.uid = "athlete-b";
    rerender();
    await flushSnapshots();
    expect(result.current.myProgress[ID].currentValue).toBe(12);
    resumeReads();
    releaseAllReads();
    await flushSnapshots();
    expect(result.current.myProgress[ID].currentValue).toBe(12);
    const readsBeforeSignOut = readLog().length;
    auth.uid = null;
    rerender();
    await flushSnapshots();
    expect(result.current.myProgress).toEqual({});
    expect(readLog()).toHaveLength(readsBeforeSignOut);
  });

  it("lets pull-to-refresh replace a terminally failed live listener's old value", async () => {
    seedFirestore({ [path("athlete-a")]: progress(90) });
    const { result } = renderHook(() => useChallenges());
    await flushSnapshots();
    expect(result.current.myProgress[ID].currentValue).toBe(90);
    // Keep automatic one-shot reads suspended so only the explicit refresh
    // can replace the failed listener's value in this interleaving.
    deferReads();
    failNextFirestore("onSnapshot", { path: path("athlete-a") });
    await act(async () => {
      seedFirestore({ [path("athlete-a")]: progress(120) });
      await flushSnapshots();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(90);
    resumeReads();
    await act(async () => {
      await result.current.refreshProgress();
    });
    expect(result.current.myProgress[ID].currentValue).toBe(120);
  });

  it("watches only active and recent-ended participation goals", async () => {
    seedFirestore({
      "challenges/featured-monthly-2026-09-01": {
        ...definition,
        metric: "active_days",
        startDate: timestamp("2026-09-01"),
        endDate: timestamp("2026-10-01"),
      },
      "challenges/featured-monthly-2026-08-01": {
        ...definition,
        metric: "training_minutes",
        startDate: timestamp("2026-08-01"),
        endDate: timestamp("2026-09-01"),
      },
      "challenges/featured-monthly-2026-11-01": {
        ...definition,
        metric: "active_days",
        startDate: timestamp("2026-11-01"),
        endDate: timestamp("2026-12-01"),
      },
      "challenges/monthly-2026-10-01": { ...definition, metric: "total_km" },
    });
    renderHook(() => useChallenges());
    await flushSnapshots();
    expect(
      readLog()
        .filter(
          (r) => r.op === "onSnapshot" && r.path.includes("/participants/")
        )
        .map((r) => r.path)
        .sort()
    ).toEqual(
      [
        "challenges/featured-monthly-2026-09-01/participants/athlete-a",
        path("athlete-a"),
      ].sort()
    );
  });
});
