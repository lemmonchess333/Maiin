/**
 * The streak's read window and the early-bird days (Streak2), through the
 * provider, the real saved-session readers and the one Firestore fake
 * (ADR-0009).
 *
 * The streak reads STREAK_WINDOW_DAYS back, not the newest few hundred
 * documents of each source. early_bird counts its five early days over all
 * time, so the days it has seen are kept on streaks/data and only grow, and
 * a document without them is seeded once from the deeper read.
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
vi.mock("@/lib/auth", () => ({ useUid: () => "early" }));
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
      | { id: string; earnedAt: string | null }[]
      | undefined
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
  it("counts the days kept on the document with the window's", async () => {
    seedFirestore({
      [STREAKS]: {
        badges: [],
        earlyLogDays: [day(200), day(201), day(202), day(203)],
      },
      "users/early/meals/m1": meal(day(1), at(1, 6)),
    });
    await settle();
    await waitFor(() => expect(earned("early_bird")).not.toBeNull());
  });

  it("keeps a new early day beside the stored ones", async () => {
    seedFirestore({
      [STREAKS]: { badges: [], earlyLogDays: [day(200)] },
      "users/early/meals/m1": meal(day(1), at(1, 6)),
      "users/early/meals/m2": meal(day(2), at(2, 9)),
    });
    await settle();
    await waitFor(() =>
      expect(readDoc(STREAKS)?.earlyLogDays).toEqual([day(200), day(1)])
    );
  });

  it("seeds a document without them from the deeper read, once", async () => {
    // An early meal older than the window: only the seed reaches it.
    seedFirestore({
      [STREAKS]: { badges: [] },
      "users/early/meals/m1": meal(day(120), at(120, 6)),
    });
    const view = await settle();
    await waitFor(() =>
      expect(readDoc(STREAKS)?.earlyLogDays).toEqual([day(120)])
    );
    await waitFor(() =>
      expect(view.result.current.badgeProgressCtx.earlyLogDays).toEqual([
        day(120),
      ])
    );
  });

  it("does not seed a document that already has them", async () => {
    seedFirestore({
      [STREAKS]: { badges: [], earlyLogDays: [] },
      "users/early/meals/m1": meal(day(120), at(120, 6)),
    });
    const view = await settle();
    expect(view.result.current.badgeProgressCtx.earlyLogDays).toEqual([]);
    expect(readDoc(STREAKS)?.earlyLogDays).toEqual([]);
  });

  it("stores a counted empty list, so the next load reads only the window", async () => {
    seedFirestore({ [STREAKS]: { badges: [] } });
    await settle();
    await waitFor(() => expect(readDoc(STREAKS)?.earlyLogDays).toEqual([]));
  });
});
