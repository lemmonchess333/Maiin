/**
 * A chosen period fetches the meals that period needs.
 *
 * Analytics sliced `useMeals`, which subscribes to the newest 400 meal docs
 * by `createdAt`. For anyone logging four to six meals a day that is two to
 * three months, so 3M / 6M / 1Y were averaged over whatever part of the
 * period happened to fit — and an average over 70 days of a 365-day period
 * looks exactly like an average over 365, which is why it went unnoticed.
 *
 * The window here is the WHOLE span the caller needs, comparison period
 * included: Analytics passes `rangeDays * 2`.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { useMealsInRange } from "../useMealsInRange";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const DAY = 24 * 60 * 60 * 1000;
/** Local date key N days back — the same form meal docs store. */
const dayKey = (back: number) =>
  localDateString(new Date(Date.now() - back * DAY));

function meal(dateKey: string, over: Record<string, unknown> = {}) {
  return {
    date: dateKey,
    foodName: `Meal ${dateKey}`,
    items: [],
    totalCalories: 500,
    totalProtein: 30,
    totalCarbs: 50,
    totalFat: 20,
    ...over,
  };
}

beforeEach(() => resetFirestore());
afterEach(() => vi.clearAllMocks());

describe("useMealsInRange", () => {
  it("reaches back further than the newest-400 window ever could", async () => {
    /* 500 meals inside the span, so a hook still capped at 400 would come
       back short. The count is the assertion — this is the truncation the
       old path could not avoid. */
    const seed: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 500; i += 1) {
      seed[`users/u1/meals/m${i}`] = meal(dayKey(i % 300));
    }
    seedFirestore(seed);
    const { result } = renderHook(() => useMealsInRange("u1", 730));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toHaveLength(500);
  });

  it("includes a meal from the far end of a 1Y comparison span", async () => {
    // 1Y compares against the preceding year, so the fetch spans 730 days.
    seedFirestore({
      "users/u1/meals/ancient": meal(dayKey(700), {
        foodName: "Two winters ago",
      }),
      "users/u1/meals/recent": meal(dayKey(2), { foodName: "This week" }),
    });
    const { result } = renderHook(() => useMealsInRange("u1", 730));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals.map((m) => m.foodName).sort()).toEqual([
      "This week",
      "Two winters ago",
    ]);
  });

  it("excludes meals older than the requested span — the counterweight", async () => {
    // Without this, the tests above are satisfied by a hook that fetches
    // the entire collection regardless of what was asked for.
    seedFirestore({
      "users/u1/meals/inside": meal(dayKey(10), { foodName: "Inside" }),
      "users/u1/meals/outside": meal(dayKey(90), { foodName: "Outside" }),
    });
    const { result } = renderHook(() => useMealsInRange("u1", 60));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals.map((m) => m.foodName)).toEqual(["Inside"]);
  });

  it("excludes soft-deleted meals — they are not what you ate", async () => {
    seedFirestore({
      "users/u1/meals/kept": meal(dayKey(3), { foodName: "Eaten" }),
      "users/u1/meals/binned": meal(dayKey(3), {
        foodName: "Mis-scanned",
        deletedAt: { toDate: () => new Date() },
      }),
    });
    const { result } = renderHook(() => useMealsInRange("u1", 60));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals.map((m) => m.foodName)).toEqual(["Eaten"]);
  });

  /* NOT TESTED HERE, deliberately: that a range switch reports `loading`
     until the NEW range's data lands, rather than answering with the old
     window's meals. The hook keys its result to the boundary it was
     fetched for, so in production — where a new `onSnapshot` query costs a
     round trip — the stale frame cannot be drawn. The fake resolves a new
     subscription synchronously inside `rerender`, so the window does not
     exist there, and `deferReads()` cannot hold it: the gate covers
     `getDoc`/`getDocs` via `maybeDefer`, not `onSnapshot`.

     A test written against the fake anyway would pass without the guard
     and read as though it had proved something. Teaching the fake to defer
     a listener's first emission would close this, and is a change to
     shared test infrastructure rather than part of this one. */

  it("is empty and settled with no signed-in user", async () => {
    const { result } = renderHook(() => useMealsInRange(null, 60));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meals).toEqual([]);
  });
});
