// @vitest-environment jsdom
/**
 * usePerformanceWeeks against production-shaped documents: one per
 * compute DAY, each scoring the seven days ending on it. The hook's
 * callers read `weeks` as weeks and `previousWeek` as last week; with
 * daily documents that is only true if the hook steps back seven days.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
let currentUid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => currentUid }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

import { usePerformanceWeeks } from "@/hooks/usePerformance";
import {
  flushSnapshots,
  failNextFirestore,
  readLog,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const NEWEST = "2026-09-27";
const key = (daysBack: number) =>
  localDateString(addLocalDays(parseLocalDate(NEWEST), -daysBack));

/** A writer-shaped document for the day `daysBack` before the newest. */
function perfDoc(daysBack: number) {
  return {
    weekKey: key(daysBack),
    performanceIndex: 40 + daysBack,
    loadBand: "moderate",
    liftLoadScore: 60,
    runLoadScore: 60,
    recoveryScore: 60,
    adherenceScore: 60,
    signals: { lifetimeWeeks: 4, daysSinceLastTraining: 1 },
  };
}

function seedDaily(days: number) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (let d = 0; d < days; d++) {
    tree[`users/u1/performance/${key(d)}`] = perfDoc(d);
  }
  seedFirestore(tree);
}

describe("usePerformanceWeeks with daily documents", () => {
  beforeEach(() => {
    resetFirestore();
    currentUid = "u1";
  });

  it("returns one score per week, newest last", async () => {
    seedDaily(40);
    const { result } = renderHook(() => usePerformanceWeeks(3));
    await flushSnapshots();
    expect(result.current.loading).toBe(false);
    expect(result.current.weeks.map((w) => w.weekKey)).toEqual([
      key(14),
      key(7),
      key(0),
    ]);
    expect(result.current.currentWeek?.weekKey).toBe(key(0));
  });

  it("gives last week's score as the previous week, not yesterday's", async () => {
    seedDaily(40);
    const { result } = renderHook(() => usePerformanceWeeks(2));
    await flushSnapshots();
    expect(result.current.previousWeek?.weekKey).toBe(key(7));
    expect(result.current.previousWeek?.performanceIndex).toBe(47);
  });

  it("reads a week of daily documents per week asked for, and counts them", async () => {
    seedDaily(40);
    const { result } = renderHook(() => usePerformanceWeeks(2));
    await flushSnapshots();
    // Two weeks: the newest and the seven days before it.
    expect(result.current.docsAvailable).toBe(8);
    expect(
      readLog().filter((r) => r.path.includes("performance")).length
    ).toBeGreaterThan(0);
  });

  it("has no previous week in a user's first week", async () => {
    seedDaily(5);
    const { result } = renderHook(() => usePerformanceWeeks(4));
    await flushSnapshots();
    expect(result.current.weeks).toHaveLength(1);
    expect(result.current.previousWeek).toBeNull();
    expect(result.current.docsAvailable).toBe(5);
  });

  it("is empty, and done, with no documents", async () => {
    const { result } = renderHook(() => usePerformanceWeeks(6));
    await flushSnapshots();
    expect(result.current.loading).toBe(false);
    expect(result.current.weeks).toEqual([]);
    expect(result.current.currentWeek).toBeNull();
    expect(result.current.previousWeek).toBeNull();
  });
});

describe("performance data ownership", () => {
  beforeEach(() => {
    resetFirestore();
    currentUid = "u1";
  });

  it("hides account A's scores on the first render as account B", async () => {
    seedDaily(20);
    seedFirestore({
      "users/u2/performance/2026-09-27": {
        ...perfDoc(0),
        performanceIndex: 81,
      },
    });
    const views: ReturnType<typeof usePerformanceWeeks>[] = [];
    const { result, rerender } = renderHook(() => {
      const value = usePerformanceWeeks(3);
      views.push(value);
      return value;
    });
    await flushSnapshots();
    expect(result.current.currentWeek?.performanceIndex).toBe(40);
    const nextRender = views.length;
    currentUid = "u2";
    rerender();
    expect(views[nextRender]).toMatchObject({
      weeks: [],
      currentWeek: null,
      previousWeek: null,
      docsAvailable: 0,
      loading: true,
    });
    await flushSnapshots();
    expect(result.current.currentWeek?.performanceIndex).toBe(81);
  });

  it("clears scores immediately on sign-out", async () => {
    seedDaily(20);
    const views: ReturnType<typeof usePerformanceWeeks>[] = [];
    const { rerender } = renderHook(() => {
      const value = usePerformanceWeeks(3);
      views.push(value);
      return value;
    });
    await flushSnapshots();
    const nextRender = views.length;
    currentUid = null;
    rerender();
    expect(views[nextRender]).toMatchObject({
      weeks: [],
      currentWeek: null,
      previousWeek: null,
      docsAvailable: 0,
      loading: false,
    });
  });
});

it("reports a failed score read separately from no scores and retries it", async () => {
  resetFirestore();
  currentUid = "u1";
  seedDaily(20);
  failNextFirestore("onSnapshot", { path: "users/u1/performance" });
  const views: ReturnType<typeof usePerformanceWeeks>[] = [];
  const { result } = renderHook(() => {
    const value = usePerformanceWeeks(3);
    views.push(value);
    return value;
  });
  await flushSnapshots();
  expect(result.current.failed).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.currentWeek).toBeNull();
  const retryRender = views.length;
  act(() => result.current.refresh());
  expect(views[retryRender].loading).toBe(true);
  expect(views[retryRender].failed).toBe(false);
  await flushSnapshots();
  expect(result.current.failed).toBe(false);
  expect(result.current.currentWeek?.performanceIndex).toBe(40);
});

it("does not leak a read error across accounts", async () => {
  resetFirestore();
  currentUid = "u1";
  failNextFirestore("onSnapshot", { path: "users/u1/performance" });
  const views: ReturnType<typeof usePerformanceWeeks>[] = [];
  const { result, rerender } = renderHook(() => {
    const value = usePerformanceWeeks(3);
    views.push(value);
    return value;
  });
  await flushSnapshots();
  expect(result.current.failed).toBe(true);
  const nextRender = views.length;
  currentUid = "u2";
  rerender();
  expect(views[nextRender].failed).toBe(false);
  expect(views[nextRender].loading).toBe(true);
  await flushSnapshots();
  expect(result.current.failed).toBe(false);
  expect(result.current.weeks).toEqual([]);
});
