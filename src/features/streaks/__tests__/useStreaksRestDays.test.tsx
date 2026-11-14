/**
 * The plan's rest days through the provider (App1 Q32), with the one
 * Firestore fake (ADR-0009): the profile's week schedule is read from
 * `useAuth`, the programme from `programState/current`, and the save keeps
 * the day the streak is kept through for the readers that read no plan
 * (the evening nudge on the server, and other people's view of the public
 * profile).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";

const h = vi.hoisted(() => ({
  workouts: null as unknown,
  profile: null as unknown,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useUid: () => "lifter",
  useAuth: () => ({ profile: h.profile }),
}));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));
vi.mock("@/lib/notifications", () => ({
  cancelNotification: vi.fn(async () => {}),
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
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const STREAKS = "users/lifter/streaks/data";
const day = (daysAgo: number) =>
  localDateString(addLocalDays(new Date(), -daysAgo));
const weekdayOf = (daysAgo: number) => parseLocalDate(day(daysAgo)).getDay();
const workouts = (daysAgo: number[]) => ({
  items: daysAgo.map((n) =>
    parseSavedWorkout(`w${n}`, savedWorkoutDoc(day(n)))!
  ),
  loading: false,
  answered: true,
  failed: false,
  evidenceReady: false,
  refresh: () => {},
});
/** A two-day lifter whose lifting days are the weekdays of these days. */
const lifterOn = (...daysAgo: number[]) => {
  const lifting = daysAgo.map(weekdayOf);
  return {
    weekSchedule: Array.from({ length: 7 }, (_, d) => ({
      day: d,
      type: lifting.includes(d) ? "lift" : "rest",
    })),
    createdAt: { toMillis: () => Date.now() - 60 * 86_400_000 },
  };
};

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({ [STREAKS]: { badges: [] } });
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

describe("useStreaks — the plan's rest days keep the streak", () => {
  it("a lifter who logs only lifts keeps every day, and saves the day it is kept through", async () => {
    // Lifts today and three days ago, each week; logged for two weeks.
    h.profile = lifterOn(0, 3);
    h.workouts = workouts([0, 3, 7, 10]);
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(11);
    expect(view.result.current.restToday).toBe(false);
    expect(view.result.current.restTomorrow).toBe(true);
    expect(view.result.current.coversRestDays).toBe(true);
    await waitFor(() => expect(readDoc(STREAKS)?.currentStreak).toBe(11));
    // The covered days stay named once the save has landed and the walk
    // stops at the stored pair: the sheet rings them.
    await waitFor(() => expect(readDoc(STREAKS)?.anchorDate).toBe(day(0)));
    expect(view.result.current.restDates).toEqual(
      [1, 2, 4, 5, 6, 8, 9].map(day)
    );
    // Kept through the three rest days ahead, to the day before the next
    // lift: what the server's nudge and the public profile read.
    expect(readDoc(STREAKS)).toMatchObject({
      anchorStreak: 11,
      anchorDate: day(0),
      lastActiveDate: day(0),
      keptThrough: day(-3),
    });
    expect(readDoc("users/lifter/public/profile")).toMatchObject({
      currentStreak: 11,
      lastActiveDate: day(-3),
    });
  });

  it("on a rest day, the day counts and nothing is asked of it", async () => {
    h.profile = lifterOn(1, 4);
    h.workouts = workouts([1, 4, 8, 11]);
    const view = await settle();
    expect(view.result.current.restToday).toBe(true);
    expect(view.result.current.hasLoggedToday).toBe(false);
    expect(view.result.current.currentStreak).toBe(12);
    // The pair ends on the last lift; the rest days after it are the plan's.
    await waitFor(() =>
      expect(readDoc(STREAKS)).toMatchObject({
        currentStreak: 12,
        anchorStreak: 11,
        anchorDate: day(1),
        keptThrough: day(-2),
      })
    );
  });

  it("reads the programme's run days: a run on a pattern rest day asks for it", async () => {
    // The same lifter, with a run moved onto yesterday.
    h.profile = lifterOn(0, 3);
    h.workouts = workouts([0, 3, 7, 10]);
    seedFirestore({
      "users/lifter/programState/current": {
        runDays: [
          {
            id: "moved",
            date: day(1),
            dayIndex: weekdayOf(1),
            templateId: "easy_run",
            type: "easy",
            status: "planned",
          },
        ],
      },
    });
    const view = await settle();
    // Yesterday's run missed is the week's forgiven day.
    expect(view.result.current.bridgedDates).toEqual([day(1)]);
    expect(view.result.current.currentStreak).toBe(11);
  });

  it("with no profile, there is no plan: the lifts alone hold a day", async () => {
    h.profile = null;
    h.workouts = workouts([0, 3, 7, 10]);
    const view = await settle();
    expect(view.result.current.currentStreak).toBe(1);
    expect(view.result.current.coversRestDays).toBe(false);
    expect(view.result.current.restToday).toBe(false);
  });
});
