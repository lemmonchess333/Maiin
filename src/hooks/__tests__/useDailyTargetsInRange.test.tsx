/**
 * Each day's target as it stood that day, over the range Analytics shows.
 *
 * The Food page judges a past day against the target that day had (a lift
 * day's is higher than a rest day's), so this reads the per-day snapshots
 * `useDailyNutritionSnapshot` writes. The badge reader already subscribes
 * to them but stops at the newest 60, which would judge a 6M view on two
 * months of it.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { useDailyTargetsInRange } from "../useDailyTargetsInRange";
import {
  failNextFirestore,
  flushSnapshots,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const DAY = 24 * 60 * 60 * 1000;
/** Local date key N days back, the form the snapshot docs are keyed by. */
const dayKey = (back: number) =>
  localDateString(new Date(Date.now() - back * DAY));

const snapshot = (back: number, calories: unknown, protein: unknown = 160) => ({
  [`users/u1/dailyNutrition/${dayKey(back)}`]: {
    date: dayKey(back),
    targetCalories: calories,
    targetProtein: protein,
    targetCarbs: 250,
    targetFat: 70,
  },
});

beforeEach(() => resetFirestore());
afterEach(() => vi.clearAllMocks());

describe("useDailyTargetsInRange", () => {
  it("gives each day the target it had, not one target for all", async () => {
    seedFirestore({
      ...snapshot(3, 2600, 180),
      ...snapshot(4, 2200, 160),
    });
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets.get(dayKey(3))).toEqual({
      calories: 2600,
      protein: 180,
    });
    expect(result.current.targets.get(dayKey(4))).toEqual({
      calories: 2200,
      protein: 160,
    });
  });

  it("reads the whole range, past the badge reader's newest 60", async () => {
    const seed: Record<string, Record<string, unknown>> = {};
    for (let back = 1; back <= 150; back += 1)
      Object.assign(seed, snapshot(back, 2400));
    seedFirestore(seed);
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 180));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets.size).toBe(150);
  });

  it("leaves out days before the range", async () => {
    // The counterweight: without it the test above passes for a hook that
    // reads the whole collection whatever it is asked for.
    seedFirestore({ ...snapshot(10, 2400), ...snapshot(90, 2100) });
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect([...result.current.targets.keys()]).toEqual([dayKey(10)]);
  });

  it("reads only the signed-in account's targets", async () => {
    seedFirestore({
      ...snapshot(3, 2600),
      [`users/u2/dailyNutrition/${dayKey(3)}`]: {
        date: dayKey(3),
        targetCalories: 1800,
        targetProtein: 120,
      },
    });
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets.get(dayKey(3))?.calories).toBe(2600);
    expect(result.current.targets.size).toBe(1);
  });

  it("reads a malformed target as none, not as a number", async () => {
    // foodDays judges nothing against a zero target.
    seedFirestore({ ...snapshot(3, "2600", null) });
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targets.get(dayKey(3))).toEqual({
      calories: 0,
      protein: 0,
    });
  });

  it("settles empty when the read fails, rather than loading for ever", async () => {
    seedFirestore({ ...snapshot(3, 2600) });
    // Let the seed's change notice land first: the fake keeps a listener
    // attached after an error, where Firestore drops it, so a notice still
    // queued would re-fire it into a success and hide the error path.
    await flushSnapshots();
    failNextFirestore("onSnapshot", { path: "users/u1/dailyNutrition" });
    const { result } = renderHook(() => useDailyTargetsInRange("u1", 30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.targets.size).toBe(0);
  });

  it("is empty and settled with no signed-in user", () => {
    const { result } = renderHook(() => useDailyTargetsInRange(null, 30));
    expect(result.current).toEqual({ targets: new Map(), loading: false });
  });
});
