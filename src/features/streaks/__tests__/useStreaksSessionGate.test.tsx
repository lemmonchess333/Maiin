/**
 * The streak waits for the session lists themselves before it computes or
 * saves.
 *
 * A run or workout saved on this phone and waiting to sync shows
 * everywhere at once (the readers' `loading` goes false for it), but it is
 * not the list: the streak is saved as soon as every stream has loaded,
 * and a streak counted from that one session would be saved over the real
 * one. So the provider gates on `answered`, which only the list itself
 * sets.
 *
 * Both readers are scripted here; their own two signals are pinned in
 * `useSavedSessions.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";

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
  runs: null as unknown,
  workouts: null as unknown,
}));
vi.mock("@/hooks/useSavedRuns", () => ({
  useSavedRuns: () => h.runs,
}));
vi.mock("@/hooks/useSavedSessions", () => ({
  useSavedSessions: () => h.workouts,
}));

import { StreaksProvider, useStreaks } from "../useStreaks";
import { parseSavedRun } from "@/lib/savedRuns";
import { parseSavedWorkout } from "@/lib/savedWorkouts";
import { localDateString } from "@/lib/dateHelpers";

function reader<T>(
  key: "runs" | "items",
  over: { list?: T[]; answered: boolean }
) {
  return {
    [key]: over.list ?? [],
    loading: false,
    answered: over.answered,
    failed: false,
    evidenceReady: false,
    refresh: () => {},
  };
}

const today = localDateString(new Date());
const queuedRun = parseSavedRun("queued-run", savedRunDoc(today))!;
const queuedWorkout = parseSavedWorkout(
  "queued-workout",
  savedWorkoutDoc(today)
)!;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({
    "users/runner/streaks/data": {
      currentStreak: 0,
      longestStreak: 9,
      lastActiveDate: "",
      totalActiveDays: 0,
      badges: [],
    },
  });
});
afterEach(() => cleanup());

function mount() {
  return renderHook(() => useStreaks(), { wrapper: StreaksProvider });
}

describe("useStreaks — the session gates", () => {
  it("stays loading while only a queued run is known, then settles on the list", async () => {
    h.workouts = reader("items", { answered: true });
    // A run waiting to sync: on screen, but the list has not answered.
    h.runs = reader("runs", { list: [queuedRun], answered: false });
    const view = mount();

    // POSITIVE anchor: the saved streak document has loaded, so the
    // provider is past its own reads and waiting only on runs.
    await waitFor(() => expect(view.result.current.longestStreak).toBe(9));
    expect(view.result.current.loading).toBe(true);

    h.runs = reader("runs", { list: [queuedRun], answered: true });
    view.rerender();
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });

  it("stays loading while only a queued workout is known, then settles on the list", async () => {
    h.runs = reader("runs", { answered: true });
    h.workouts = reader("items", { list: [queuedWorkout], answered: false });
    const view = mount();

    await waitFor(() => expect(view.result.current.longestStreak).toBe(9));
    expect(view.result.current.loading).toBe(true);

    h.workouts = reader("items", { list: [queuedWorkout], answered: true });
    view.rerender();
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });
});
