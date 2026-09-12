import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let uid = "audit";
vi.mock("@/lib/auth", () => ({ useUid: () => uid }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));
vi.mock("@/lib/activationTracker", () => ({ noteActivitySnapshot: vi.fn() }));
import { queueDurableWrite } from "@/lib/offlineQueue";
import { useMeals } from "../useMeals";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

beforeEach(() => {
  resetFirestore();
  uid = "audit";
  localStorage.clear();
});
afterEach(cleanup);

describe("Food diary reads and recovery", () => {
  it("loads all five meals on an older selected date even past 400 newer records", async () => {
    const docs: Record<string, Record<string, unknown>> = {};
    let oldDate = "";
    for (let day = 0; day < 90; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const dateKey = localDateString(date);
      if (day === 85) oldDate = dateKey;
      for (let n = 0; n < 5; n++)
        docs[`users/audit/meals/d${day}-${n}`] = {
          date: dateKey,
          createdAt: date.getTime() + n,
          foodName: "Audit meal",
          items: [],
          totalCalories: 300,
          totalProtein: 20,
          totalCarbs: 30,
          totalFat: 10,
        };
    }
    seedFirestore(docs);
    const diary = renderHook(() =>
      useMeals({ from: oldDate, to: localDateString() })
    );
    await waitFor(() => expect(diary.result.current.loading).toBe(false));
    expect(diary.result.current.getMealsForDate(oldDate)).toHaveLength(5);
    expect(diary.result.current.getDailyTotals(oldDate).calories).toBe(1500);
    expect(diary.result.current.hasMore).toBe(false);
  });

  it("reports a failed read and reloads the diary when retried", async () => {
    failNextFirestore("onSnapshot", {
      path: "users/audit/meals",
      code: "permission-denied",
    });
    const { result } = renderHook(() => useMeals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(unfiredFailures()).toHaveLength(0);
    expect(result.current.meals).toHaveLength(0);
    expect(result.current.error).toBeTruthy();
    seedFirestore({
      "users/audit/meals/returned": {
        date: localDateString(),
        createdAt: 1,
        foodName: "Eggs",
        totalCalories: 200,
      },
    });
    await act(async () => {
      void result.current.refresh();
    });
    await waitFor(() =>
      expect(result.current.getDailyTotals(localDateString()).calories).toBe(
        200
      )
    );
    expect(result.current.error).toBeNull();
  });
});

it("keeps cached meals on a failed refresh and resolves the refresh promise", async () => {
  seedFirestore({
    "users/audit/meals/m1": {
      date: "2026-09-01",
      createdAt: 1,
      totalCalories: 200,
    },
  });
  const { result } = renderHook(() => useMeals());
  await waitFor(() => expect(result.current.loading).toBe(false));
  failNextFirestore("onSnapshot", { path: "users/audit/meals" });
  let refreshed!: Promise<void>;
  act(() => {
    refreshed = result.current.refresh();
  });
  await act(async () => {
    await refreshed;
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeTruthy();
  expect(result.current.getDailyTotals("2026-09-01").calories).toBe(200);
  expect(unfiredFailures()).toHaveLength(0);
});

it("scopes queued meals and failed reads to the requested dates and account", async () => {
  const { result, rerender } = renderHook(
    ({ from, to }) => useMeals({ from, to }),
    { initialProps: { from: "2026-09-01", to: "2026-09-02" } }
  );
  await flushSnapshots();
  act(() => {
    queueDurableWrite("audit", "users/audit/meals", "local", {
      date: "2026-09-01",
      totalCalories: 300,
    });
    queueDurableWrite("audit", "users/audit/meals", "outside", {
      date: "2026-08-30",
      totalCalories: 100,
    });
  });
  expect(result.current.meals.map((meal) => meal.id)).toEqual(["local"]);
  failNextFirestore("onSnapshot", { path: "users/audit/meals" });
  rerender({ from: "2026-09-02", to: "2026-09-02" });
  expect(result.current.meals).toEqual([]);
  await flushSnapshots();
  expect(result.current.error).toBeTruthy();
  uid = "other";
  rerender({ from: "2026-09-01", to: "2026-09-02" });
  expect(result.current.meals).toEqual([]);
  expect(result.current.error).toBeNull();
  await flushSnapshots();
  expect(result.current.meals).toEqual([]);
  expect(unfiredFailures()).toHaveLength(0);
});
