/**
 * A streak counted from a read that failed is never saved.
 *
 * The provider settles out of loading when a read fails, so the screen
 * does not hang, and it used to go on to save the streak it counted from
 * what it had. With the streaks document unread, that is the defaults: the
 * save wrote `longestStreak: max(current, 0)` and the last active day over
 * the stored record, and mirrored both to the user document and the
 * public profile. With a session list or the meals unread, it saved a
 * streak counted without them. Now a failed read holds the save off and
 * is reported as `loadFailed`, so the badge page can say so instead of
 * showing zeros.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
  writeLog,
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
import { parseSavedWorkout } from "@/lib/savedWorkouts";
import { localDateString } from "@/lib/dateHelpers";

function reader<T>(
  key: "runs" | "items",
  over: { list?: T[]; failed?: boolean } = {}
) {
  return {
    [key]: over.list ?? [],
    loading: false,
    answered: true,
    failed: over.failed ?? false,
    evidenceReady: false,
    refresh: () => {},
  };
}

const today = localDateString(new Date());
const workoutToday = parseSavedWorkout("w1", savedWorkoutDoc(today))!;
const STREAKS = "users/runner/streaks/data";

/** A long-standing record: what a failed read must not overwrite. */
const EARNED_AT = "2026-01-10T08:00:00.000Z";
const STORED = {
  currentStreak: 0,
  longestStreak: 200,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: [{ id: "three_day", earnedAt: EARNED_AT }],
};

const STREAK_FIELDS = [
  "currentStreak",
  "longestStreak",
  "lastActiveDate",
  "totalActiveDays",
];

/** Writes that carry a streak figure. A badge award may still run: it
 *  reads the stored badges inside its own transaction and only adds. */
const streakWrites = () =>
  writeLog().filter(
    (w) =>
      [STREAKS, "users/runner", "users/runner/public/profile"].includes(
        w.path
      ) &&
      Object.keys((w.data as Record<string, unknown>) ?? {}).some((k) =>
        STREAK_FIELDS.includes(k)
      )
  );

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({ [STREAKS]: STORED });
  // Today's workout makes the counted streak 1, not the stored 0, so the
  // save has something to write.
  h.workouts = reader("items", { list: [workoutToday] });
  h.runs = reader("runs");
});
afterEach(() => cleanup());

async function settle() {
  const view = renderHook(() => useStreaks(), { wrapper: StreaksProvider });
  // POSITIVE anchor: every stream has settled, so the save effect has run.
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("useStreaks — a failed read is not saved over the record", () => {
  it("saves the counted streak when every read succeeds (the anchor)", async () => {
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(1);
    await waitFor(() => expect(readDoc(STREAKS)?.currentStreak).toBe(1));
    expect(readDoc(STREAKS)?.longestStreak).toBe(200);
    expect(view.result.current.loadFailed).toBe(false);
  });

  it("saves nothing when the streaks document could not be read", async () => {
    failNextFirestore("onSnapshot", { path: STREAKS });
    const view = await settle();
    expect(unfiredFailures()).toEqual([]);
    expect(readDoc(STREAKS)?.longestStreak).toBe(200);
    expect(streakWrites()).toEqual([]);
    // The award that did run kept the stored badge's date.
    const badges = readDoc(STREAKS)?.badges as {
      id: string;
      earnedAt: string;
    }[];
    expect(badges.find((b) => b.id === "three_day")?.earnedAt).toBe(EARNED_AT);
    expect(view.result.current.loadFailed).toBe(true);
  });

  it("reads the record on retry after a failed read", async () => {
    failNextFirestore("onSnapshot", { path: STREAKS });
    const view = await settle();
    expect(view.result.current.loadFailed).toBe(true);
    expect(view.result.current.longestStreak).toBe(1);

    act(() => view.result.current.retryLoad());
    await waitFor(() => expect(view.result.current.loadFailed).toBe(false));
    await waitFor(() => expect(view.result.current.longestStreak).toBe(200));
    expect(view.result.current.loading).toBe(false);
  });

  it("saves nothing when the meals could not be read", async () => {
    failNextFirestore("onSnapshot", { path: "users/runner/meals" });
    const view = await settle();
    expect(unfiredFailures()).toEqual([]);
    expect(streakWrites()).toEqual([]);
    expect(view.result.current.loadFailed).toBe(true);
  });

  it("saves nothing when the workouts could not be read", async () => {
    // A failed list with nothing in it, as the reader reports one. The run
    // stands in for the day, so the counted streak still differs.
    h.workouts = reader("items", { failed: true });
    h.runs = reader("runs", {
      list: [
        {
          id: "r1",
          day: today,
          completedAt: null,
          isInvalid: false,
          distance: 5000,
          duration: 1500,
        },
      ],
    });
    const view = await settle();
    expect(streakWrites()).toEqual([]);
    expect(view.result.current.loadFailed).toBe(true);
  });
});
