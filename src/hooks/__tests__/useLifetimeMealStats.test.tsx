/**
 * Lifetime meal totals count everything, not the newest 400, and read no
 * more than they must to do it.
 *
 * The tile derived both figures from `useMeals`, which subscribes to the
 * newest 400 meal docs. So "meals logged" saturated at 400 and "days
 * logged" at however many distinct days those covered, and a long-standing
 * user's lifetime numbers quietly stopped moving. The fix read every meal
 * on every visit to History, which already holds that window: for an
 * account that fits in it, a second copy of the same documents.
 *
 * Driven with the real `useMeals` through the one Firestore fake, as
 * History wires the two, so the window's own "there is more" is what
 * decides whether anything else is read.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { currentUser: { uid: "u1" } },
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: session }));
vi.mock("@/lib/auth", () => ({ useUid: () => session.currentUser.uid }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/activationTracker", () => ({ noteActivitySnapshot: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/foodPhotoStore", () => ({
  deleteFoodPhoto: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useFoodPhotoUrls", () => ({
  invalidateFoodPhotoCache: vi.fn(),
}));

import { Timestamp } from "firebase/firestore";
import { useMeals } from "../useMeals";
import {
  WHOLE_READ_MAX_AGE_MS,
  __resetLifetimeMealReadsForTests,
  useLifetimeMealStats,
} from "../useLifetimeMealStats";
import {
  deferReads,
  failNextFirestore,
  flushSnapshots,
  pendingReads,
  releaseAllReads,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const T0 = 1_700_000_000_000;

/** A stored meal. `at` orders the live window, newest first. */
const meal = (
  date: string,
  at: number,
  over: Record<string, unknown> = {}
) => ({
  date,
  foodName: `Meal ${date}`,
  // A day's eating on its own, so each day here is a food day (`foodDay.ts`).
  totalCalories: 900,
  totalProtein: 20,
  totalCarbs: 40,
  totalFat: 10,
  createdAt: Timestamp.fromMillis(T0 + at),
  ...over,
});

/** `count` meals for `uid`, two a day, so `count / 2` distinct days. */
function manyMeals(uid: string, count: number) {
  const seed: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < count; i += 1) {
    const day = String(Math.floor(i / 2)).padStart(4, "0");
    seed[`users/${uid}/meals/m${String(i).padStart(4, "0")}`] = meal(
      `day-${day}`,
      i
    );
  }
  return seed;
}

/** Every render's account and count, to see what an account change shows. */
let renders: { uid: string; mealCount: number }[] = [];

/** The two hooks as History wires them. */
function useHistoryMeals(options?: { enabled?: boolean }) {
  const live = useMeals();
  const stats = useLifetimeMealStats(
    {
      meals: live.meals,
      deletedMeals: live.deletedMeals,
      hasMore: live.hasMore,
      loading: live.loading,
      error: live.error,
    },
    options
  );
  renders.push({
    uid: session.currentUser.uid,
    mealCount: stats.mealCount,
  });
  return stats;
}

/**
 * Whole-collection reads of meals so far. The fake holds every one-shot
 * read open (`deferReads`), which a live window's snapshots are not, so
 * each read the hook asks for is seen here before it is answered.
 */
let wholeReads: string[] = [];

/** Let the window land, then count and answer the reads it led to. */
async function landed() {
  await flushSnapshots();
  wholeReads.push(...pendingReads());
  await act(async () => {
    releaseAllReads();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settled(options?: { enabled?: boolean }) {
  const hook = renderHook(() => useHistoryMeals(options));
  await landed();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const mealsOf = (uid: string) => `users/${uid}/meals`;

beforeEach(() => {
  resetFirestore();
  __resetLifetimeMealReadsForTests();
  localStorage.clear();
  session.currentUser.uid = "u1";
  renders = [];
  wholeReads = [];
  deferReads();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useLifetimeMealStats — an account that fits in the live window", () => {
  it("counts from the window and reads nothing else", async () => {
    seedFirestore({
      "users/u1/meals/a": meal("2026-03-01", 1),
      "users/u1/meals/b": meal("2026-03-02", 2),
    });
    const { result } = await settled();
    expect(result.current.mealCount).toBe(2);
    expect(result.current.daysLogged).toBe(2);
    expect(wholeReads).toEqual([]);
  });

  it("counts DISTINCT days, not meals", async () => {
    // Three meals, one day. The two figures are different questions.
    seedFirestore({
      "users/u1/meals/a": meal("2026-03-01", 1),
      "users/u1/meals/b": meal("2026-03-01", 2),
      "users/u1/meals/c": meal("2026-03-01", 3),
    });
    const { result } = await settled();
    expect(result.current.mealCount).toBe(3);
    expect(result.current.daysLogged).toBe(1);
  });

  it("excludes soft-deleted meals: the tile says what you kept", async () => {
    seedFirestore({
      "users/u1/meals/kept": meal("2026-03-01", 1),
      "users/u1/meals/binned": meal("2026-03-02", 2, {
        deletedAt: Timestamp.fromMillis(T0 + 5),
      }),
    });
    const { result } = await settled();
    expect(result.current.mealCount).toBe(1);
    expect(result.current.daysLogged).toBe(1);
  });

  it("moves with the window when a meal is logged", async () => {
    seedFirestore({ "users/u1/meals/a": meal("2026-03-01", 1) });
    const { result } = await settled();
    expect(result.current.daysLogged).toBe(1);

    seedFirestore({ "users/u1/meals/b": meal("2026-03-02", 2) });
    await landed();
    expect(result.current.daysLogged).toBe(2);
    expect(wholeReads).toEqual([]);
  });

  it("is zero, and settled, for an account that has logged nothing", async () => {
    const { result } = await settled();
    expect(result.current).toMatchObject({
      mealCount: 0,
      daysLogged: 0,
      loading: false,
      failed: false,
    });
    expect(wholeReads).toEqual([]);
  });
});

describe("useLifetimeMealStats — an account past the live window", () => {
  it("counts past the 400 the live subscription stops at, with one read", async () => {
    // 900 meals across 450 distinct days: both figures saturated at the window.
    seedFirestore(manyMeals("u1", 900));
    const { result } = await settled();
    expect(result.current.mealCount).toBe(900);
    expect(result.current.daysLogged).toBe(450);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("an account of exactly the window's size is read whole: the window cannot tell it is everything", async () => {
    seedFirestore(manyMeals("u1", 400));
    const { result } = await settled();
    expect(result.current.mealCount).toBe(400);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("reads once a session: a second visit to History reads nothing", async () => {
    seedFirestore(manyMeals("u1", 900));
    const first = await settled();
    first.unmount();

    const second = await settled();
    expect(second.result.current.daysLogged).toBe(450);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("shows a meal logged since the read without reading everything again", async () => {
    seedFirestore(manyMeals("u1", 900));
    const { result } = await settled();

    // Newer than every seeded meal, on a day of its own.
    seedFirestore({ "users/u1/meals/today": meal("day-today", 10_000) });
    await landed();
    expect(result.current.mealCount).toBe(901);
    expect(result.current.daysLogged).toBe(451);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("stops counting a meal binned since the read, and its day with it", async () => {
    const seed = manyMeals("u1", 900);
    // The newest meal, alone on its day.
    seed["users/u1/meals/solo"] = meal("day-solo", 20_000);
    seedFirestore(seed);
    const { result } = await settled();
    expect(result.current.daysLogged).toBe(451);

    seedFirestore({
      "users/u1/meals/solo": meal("day-solo", 20_000, {
        deletedAt: Timestamp.fromMillis(T0 + 30_000),
      }),
    });
    await landed();
    expect(result.current.mealCount).toBe(900);
    expect(result.current.daysLogged).toBe(450);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("takes the read again once it is half an hour old", async () => {
    seedFirestore(manyMeals("u1", 900));
    const first = await settled();
    first.unmount();

    const later = Date.now() + WHOLE_READ_MAX_AGE_MS + 1;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const second = await settled();
    // The older read is shown while the new one is asked for.
    expect(second.result.current.daysLogged).toBe(450);
    expect(wholeReads).toEqual([mealsOf("u1"), mealsOf("u1")]);
  });

  it("a FAILED read is not a user who never logged", async () => {
    /* Zero and "we could not find out" are different states. The run hook
       carries this distinction because zero made History hide a whole
       section with the only evidence in a console the user never sees. */
    seedFirestore(manyMeals("u1", 900));
    failNextFirestore("getDocs", { code: "unavailable" });
    const { result } = await settled();
    expect(result.current.failed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(unfiredFailures()).toEqual([]);
  });
});

describe("useLifetimeMealStats — a window that failed", () => {
  it("says nothing about how many meals there are, so every meal is read", async () => {
    seedFirestore({
      "users/u1/meals/a": meal("2026-03-01", 1),
      "users/u1/meals/b": meal("2026-03-02", 2),
    });
    failNextFirestore("onSnapshot", { code: "unavailable" });
    const { result } = await settled();
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.mealCount).toBe(2);
    expect(result.current.daysLogged).toBe(2);
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });
});

describe("useLifetimeMealStats — whose totals", () => {
  it("does not read at all when disabled", async () => {
    // The cost gate: a whole-collection read is not free, so surfaces that
    // stop needing it stop paying for it.
    seedFirestore(manyMeals("u1", 900));
    const { result } = await settled({ enabled: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.mealCount).toBe(0);
    expect(wholeReads).toEqual([]);
  });

  it("never shows one account's totals to the next", async () => {
    seedFirestore({
      ...manyMeals("u1", 900),
      "users/u2/meals/x": meal("2026-03-01", 1),
    });
    const { result, rerender } = await settled();
    expect(result.current.mealCount).toBe(900);

    session.currentUser.uid = "u2";
    rerender();
    await landed();
    await waitFor(() => expect(result.current.mealCount).toBe(1));
    // Not for one render: every frame drawn for the new account is its own.
    expect(
      renders.filter((r) => r.uid === "u2").map((r) => r.mealCount)
    ).not.toContain(900);
    // And the new account fits in its window, so only the first was read.
    expect(wholeReads).toEqual([mealsOf("u1")]);
  });

  it("keeps one account's session read from another account", async () => {
    seedFirestore({
      ...manyMeals("u1", 900),
      ...manyMeals("u2", 600),
    });
    const first = await settled();
    first.unmount();

    session.currentUser.uid = "u2";
    const second = await settled();
    expect(second.result.current.mealCount).toBe(600);
    expect(wholeReads).toEqual([mealsOf("u1"), mealsOf("u2")]);
  });
});
