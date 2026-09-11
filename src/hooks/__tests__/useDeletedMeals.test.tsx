/**
 * The archive finds meals by WHEN THEY WERE DELETED.
 *
 * The screen used to filter `useMeals`, which subscribes to the newest 400
 * meals ordered by `createdAt`. So it could only surface meals that were
 * both recently logged and deleted: delete a meal from three months ago and
 * it was nowhere in that window, the archive stayed empty, and the meal
 * could not be recovered through the UI at all.
 *
 * The first test is that case, stated directly — a meal logged long ago and
 * deleted a minute ago.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
import { useDeletedMeals, DELETED_ARCHIVE_WINDOW_MS } from "../useDeletedMeals";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

const NOW = Date.now();
const ago = (ms: number) => Timestamp.fromMillis(NOW - ms);
const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

/** A meal doc as the app writes one. `createdAt` is when it was LOGGED. */
function meal(over: Record<string, unknown>) {
  return {
    date: "2026-01-05",
    foodName: "Porridge",
    items: [],
    totalCalories: 400,
    totalProtein: 12,
    totalCarbs: 60,
    totalFat: 8,
    createdAt: ago(120 * DAY),
    ...over,
  };
}

beforeEach(() => resetFirestore());
afterEach(() => vi.clearAllMocks());

describe("useDeletedMeals", () => {
  it("returns a meal logged MONTHS ago but deleted a minute ago", async () => {
    /* The reported bug. `createdAt` is 120 days old — far outside the
       newest-400 window the screen used to filter — and `deletedAt` is
       today, which is the only thing that should matter here. */
    seedFirestore({
      "users/u1/meals/old-but-just-deleted": meal({
        foodName: "Christmas dinner",
        createdAt: ago(120 * DAY),
        deletedAt: ago(MINUTE),
      }),
    });
    const { result } = renderHook(() => useDeletedMeals("u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals.map((m) => m.foodName)).toEqual([
      "Christmas dinner",
    ]);
  });

  it("excludes a meal that was never deleted — the counterweight", async () => {
    // Without this, "returns the deleted one" is satisfied by a hook that
    // returns every meal it can see.
    seedFirestore({
      "users/u1/meals/live": meal({ foodName: "Still logged" }),
    });
    const { result } = renderHook(() => useDeletedMeals("u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals).toEqual([]);
  });

  it("excludes a RESTORED meal", async () => {
    /* Restoring writes `deletedAt: null`, and the range filter is what
       excludes it: null sorts below every timestamp in Firestore's type
       ordering, and the fake reaches the same verdict via its own
       comparison. Verified by mutation — a client-side re-check on top
       changed nothing, so there isn't one. */
    seedFirestore({
      "users/u1/meals/restored": meal({
        foodName: "Put back",
        deletedAt: null,
      }),
    });
    const { result } = renderHook(() => useDeletedMeals("u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals).toEqual([]);
  });

  it("excludes a deletion older than the archive window", async () => {
    seedFirestore({
      "users/u1/meals/expired": meal({
        foodName: "Long gone",
        deletedAt: ago(DELETED_ARCHIVE_WINDOW_MS + 60 * MINUTE),
      }),
      "users/u1/meals/fresh": meal({
        foodName: "Still here",
        deletedAt: ago(30 * MINUTE),
      }),
    });
    const { result } = renderHook(() => useDeletedMeals("u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals.map((m) => m.foodName)).toEqual([
      "Still here",
    ]);
  });

  it("orders most-recently-deleted first, whatever the log order", async () => {
    // The two orderings disagree here on purpose: the older MEAL was
    // deleted more recently.
    seedFirestore({
      "users/u1/meals/a": meal({
        foodName: "Logged recently, deleted first",
        createdAt: ago(2 * DAY),
        deletedAt: ago(90 * MINUTE),
      }),
      "users/u1/meals/b": meal({
        foodName: "Logged long ago, deleted last",
        createdAt: ago(200 * DAY),
        deletedAt: ago(5 * MINUTE),
      }),
    });
    const { result } = renderHook(() => useDeletedMeals("u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals.map((m) => m.foodName)).toEqual([
      "Logged long ago, deleted last",
      "Logged recently, deleted first",
    ]);
  });

  it("is empty and settled with no signed-in user", async () => {
    const { result } = renderHook(() => useDeletedMeals(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletedMeals).toEqual([]);
  });
});
