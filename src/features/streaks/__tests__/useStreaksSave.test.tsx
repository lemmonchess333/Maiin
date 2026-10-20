/**
 * What the streak save stores, through the provider and the one Firestore
 * fake (ADR-0009).
 *
 * The stored pair is the next walk's anchor. The save wrote the shown count
 * with "today if active, else the stored day": the morning after a rest day
 * the shown count is 0, and the save put that 0 over a 100-day certificate,
 * so the evening's log could see only the window. It now keeps the
 * certificate (anchorStreak / anchorDate) beside the shown count, and the
 * mirrors still carry the shown count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));
const h = vi.hoisted(() => ({
  workouts: null as unknown,
  cancelNotification: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications", () => ({
  cancelNotification: h.cancelNotification,
}));
vi.mock("@/hooks/useSavedRuns", () => ({
  useSavedRuns: () => ({
    runs: [],
    loading: false,
    answered: true,
    failed: false,
    evidenceReady: false,
    refresh: () => {},
  }),
}));
vi.mock("@/hooks/useSavedSessions", () => ({
  useSavedSessions: () => h.workouts,
}));

import { StreaksProvider, useStreaks } from "../useStreaks";
import { parseSavedWorkout } from "@/lib/savedWorkouts";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const STREAKS = "users/runner/streaks/data";
const day = (daysAgo: number) =>
  localDateString(addLocalDays(new Date(), -daysAgo));
const workouts = (daysAgo: number[]) => ({
  items: daysAgo.map(
    (n) => parseSavedWorkout(`w${n}`, savedWorkoutDoc(day(n)))!
  ),
  loading: false,
  answered: true,
  failed: false,
  evidenceReady: false,
  refresh: () => {},
});
/** Active from the day before yesterday back 40 days; yesterday rested. */
const BEFORE_THE_REST_DAY = Array.from({ length: 39 }, (_, i) => i + 2);

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.cancelNotification.mockClear();
  // 100 days through the day before yesterday, saved then.
  seedFirestore({
    [STREAKS]: {
      currentStreak: 100,
      longestStreak: 100,
      lastActiveDate: day(2),
      anchorStreak: 100,
      anchorDate: day(2),
      totalActiveDays: 39,
      badges: [],
    },
  });
  h.workouts = workouts(BEFORE_THE_REST_DAY);
});
afterEach(() => cleanup());

async function settle() {
  const view = renderHook(() => useStreaks(), { wrapper: StreaksProvider });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("useStreaks — the save keeps the certificate", () => {
  it("the morning after a rest day: shows 0, keeps 100 days through the day before", async () => {
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(0);
    expect(view.result.current.savableStreak).toBe(100);
    await waitFor(() => expect(readDoc(STREAKS)?.currentStreak).toBe(0));
    expect(readDoc(STREAKS)).toMatchObject({
      anchorStreak: 100,
      anchorDate: day(2),
      lastActiveDate: day(2),
      longestStreak: 100,
    });
    // The mirrors carry the streak as shown.
    expect(readDoc("users/runner")?.currentStreak).toBe(0);
    expect(readDoc("users/runner/public/profile")?.currentStreak).toBe(0);
    // A write that is not a log leaves this evening's reminder armed.
    expect(h.cancelNotification).not.toHaveBeenCalled();
  });

  it("the evening's log reads 102 from it, and stores that", async () => {
    const view = await settle();
    await waitFor(() => expect(readDoc(STREAKS)?.currentStreak).toBe(0));
    h.workouts = workouts([0, ...BEFORE_THE_REST_DAY]);
    view.rerender();
    await waitFor(() => expect(view.result.current.currentStreak).toBe(102));
    await waitFor(() =>
      expect(readDoc(STREAKS)).toMatchObject({
        currentStreak: 102,
        anchorStreak: 102,
        anchorDate: day(0),
        lastActiveDate: day(0),
        longestStreak: 102,
      })
    );
    await waitFor(() => expect(h.cancelNotification).toHaveBeenCalled());
  });

  it("a backfilled yesterday is stored as the day the streak ends", async () => {
    h.workouts = workouts([1, ...BEFORE_THE_REST_DAY]);
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(101);
    await waitFor(() =>
      expect(readDoc(STREAKS)).toMatchObject({
        currentStreak: 101,
        lastActiveDate: day(1),
        anchorStreak: 101,
        anchorDate: day(1),
      })
    );
  });

  it("a document from before the certificate anchors on its pair, and gains one", async () => {
    seedFirestore({
      [STREAKS]: {
        currentStreak: 100,
        longestStreak: 100,
        lastActiveDate: day(2),
        totalActiveDays: 39,
        badges: [],
      },
    });
    h.workouts = workouts([0, ...BEFORE_THE_REST_DAY]);
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(102);
    await waitFor(() =>
      expect(readDoc(STREAKS)).toMatchObject({
        anchorStreak: 102,
        anchorDate: day(0),
      })
    );
  });
});
