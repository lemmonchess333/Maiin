/**
 * The streak's read window and the early-bird days (Streak2), through the
 * provider, the real saved-session readers and the one Firestore fake
 * (ADR-0009).
 *
 * The streak reads STREAK_WINDOW_DAYS back, not the newest few hundred
 * documents of each source. early_bird counts its five early days over all
 * time: the server's award keeps the days it has seen on streaks/data
 * (App1 Q33), and the app reads them with its window's for the ring, and
 * writes none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useUid: () => "early",
  // No profile: no plan, so no rest days (App1 Q32).
  useAuth: () => ({ profile: null }),
}));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));

import { StreaksProvider, STREAK_WINDOW_DAYS, useStreaks } from "../useStreaks";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const STREAKS = "users/early/streaks/data";
const day = (daysAgo: number) =>
  localDateString(addLocalDays(new Date(), -daysAgo));
/** `daysAgo` days back at `hour`:00 local. */
const at = (daysAgo: number, hour: number) => {
  const d = addLocalDays(new Date(), -daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};
/** A meal for `date`, logged at `loggedAt`. */
const meal = (date: string, loggedAt: Date) => ({
  date,
  items: [{ name: "Porridge", calories: 300 }],
  totalCalories: 300,
  createdAt: Timestamp.fromDate(loggedAt),
});
const earned = (id: string) =>
  (
    readDoc(STREAKS)?.badges as
      { id: string; earnedAt: string | null }[] | undefined
  )?.find((b) => b.id === id)?.earnedAt ?? null;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
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

describe("the streak's window", () => {
  it("is as far back as Food lets a meal be added", () => {
    expect(STREAK_WINDOW_DAYS).toBe(90);
  });

  it("reads the window's days, not the newest documents of all time", async () => {
    seedFirestore({
      [STREAKS]: { badges: [], earlyLogDays: [] },
      "users/early/meals/recent": meal(day(1), at(1, 12)),
      "users/early/meals/old": meal(day(120), at(120, 12)),
    });
    const view = await settle();
    expect(view.result.current.totalActiveDays).toBe(1);
  });

  it("reads a meal logged today for a day the diary reaches", async () => {
    seedFirestore({
      [STREAKS]: { badges: [], earlyLogDays: [] },
      "users/early/meals/backfilled": meal(day(80), new Date()),
    });
    const view = await settle();
    expect(view.result.current.totalActiveDays).toBe(1);
  });
});

describe("early_bird's days", () => {
  it("shows the server's kept days with the window's, and writes neither", async () => {
    seedFirestore({
      [STREAKS]: {
        badges: [],
        earlyLogDays: [day(200), day(201), day(202), day(203)],
      },
      "users/early/meals/m1": meal(day(1), at(1, 6)),
      "users/early/meals/m2": meal(day(2), at(2, 9)),
    });
    const view = await settle();
    // POSITIVE anchor: the ring has the window's early day beside the
    // server's four, and not the 09:00 one.
    await waitFor(() =>
      expect(view.result.current.badgeProgressCtx.earlyLogDays).toEqual([
        day(203),
        day(202),
        day(201),
        day(200),
        day(1),
      ])
    );
    // The award is the server's: the record is as it was.
    expect(readDoc(STREAKS)?.earlyLogDays).toEqual([
      day(200),
      day(201),
      day(202),
      day(203),
    ]);
    expect(earned("early_bird")).toBeNull();
  });

  it("reads a record without them as none", async () => {
    seedFirestore({
      [STREAKS]: { badges: [] },
      "users/early/meals/m1": meal(day(120), at(120, 6)),
      "users/early/meals/m2": meal(day(3), at(3, 5)),
    });
    const view = await settle();
    await waitFor(() =>
      expect(view.result.current.badgeProgressCtx.earlyLogDays).toEqual([
        day(3),
      ])
    );
    expect(readDoc(STREAKS)?.earlyLogDays).toBeUndefined();
  });
});
