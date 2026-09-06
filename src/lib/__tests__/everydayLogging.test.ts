// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { flushQueue } from "../offlineQueue";
import { auth, db } from "@/lib/firebase";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
  allPaths,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import {
  applyWaterAction,
  queueWater,
  pendingWater,
  flushWater,
  waterSyncError,
  type WaterAction,
} from "../waterActions";
import {
  saveWeightEntry,
  parseWeightEntry,
  validWeightDate,
} from "../weightEntry";
import { saveQuickMeal, scaleQuickMeal } from "../quickMealEntry";
import { localDateString } from "../dateHelpers";
import { toast } from "../toast";
import type { QuickAddItem } from "../quickAddOrder";
const today = localDateString();
const waterPath = `users/u1/waterLog/${today}`;
const weightPath = `users/u1/bodyweightLogs/${today}`;
const drink = (id: string, delta: number, undoOf?: string): WaterAction => ({
  id,
  delta,
  date: today,
  queuedAt: Date.now(),
  targetMl: 2000,
  ...(undoOf ? { undoOf } : {}),
});
const meal: QuickAddItem = {
  key: "eggs",
  name: "Eggs and toast",
  portionSize: "1 plate",
  cal: 300,
  pro: 20,
  carb: 30,
  fat: 11,
  bundle: {
    foodName: "Eggs and toast",
    items: [
      {
        name: "Eggs",
        portionSize: "2 eggs",
        calories: 160,
        protein: 14,
        carbs: 0,
        fat: 10,
      },
      {
        name: "Toast",
        portionSize: "1 slice",
        calories: 140,
        protein: 6,
        carbs: 30,
        fat: 1,
      },
    ],
  },
};
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.clearAllMocks();
  Object.assign(auth, { currentUser: { uid: "u1" } });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(async () => {
  await flushWater("u1");
  expect(unfiredFailures()).toEqual([]);
  vi.restoreAllMocks();
});
describe("durable water actions", () => {
  it("keeps offline taps and their original day across a remount, then adds to another device's total", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    queueWater("u1", drink("a", 500));
    queueWater("u1", drink("b", 250));
    await flushWater("u1");
    expect(pendingWater("u1")).toHaveLength(2);
    seedFirestore({ [waterPath]: { ml: 1000 } });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await flushWater("u1");
    expect(readDoc(waterPath)?.ml).toBe(1750);
    expect(pendingWater("u1")).toEqual([]);
  });
  it("retries a failed commit without losing the tap or duplicating it", async () => {
    failNextFirestore("commit");
    queueWater("u1", drink("a", 500));
    await flushWater("u1");
    expect(waterSyncError("u1")).toBeTruthy();
    expect(pendingWater("u1")).toHaveLength(1);
    await flushWater("u1");
    queueWater("u1", drink("a", 500));
    await flushWater("u1");
    expect(readDoc(waterPath)?.ml).toBe(500);
  });
  it("undo removes only that drink, even when repeated after later drinks", async () => {
    for (const action of [
      drink("a", 500),
      drink("b", 250),
      drink("undo", -500, "a"),
      drink("undo-again", -500, "a"),
    ])
      queueWater("u1", action);
    await flushWater("u1");
    expect(readDoc(waterPath)?.ml).toBe(250);
  });
  it("rejects a conflicting undo without blocking subsequent drinks", async () => {
    seedFirestore({
      [waterPath]: { ml: 100, waterReceipts: { a: { delta: 500 } } },
    });
    queueWater("u1", drink("undo", -500, "a"));
    queueWater("u1", drink("b", 250));
    await flushWater("u1");
    expect(readDoc(waterPath)?.ml).toBe(350);
    expect(pendingWater("u1")).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Water changed")
    );
  });
  it("does not accept a tap if storage is full or the account changed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(queueWater("u1", drink("a", 250))).toBe(false);
    expect(queueWater("u2", drink("b", 250))).toBe(false);
  });
  it("undo inverts the actual clamped delta", () => {
    const first = applyWaterAction(100, {}, drink("a", -250));
    expect(
      applyWaterAction(first.ml, first.receipts, drink("u", 250, "a")).ml
    ).toBe(100);
  });
});
describe("weight correction", () => {
  it("accepts commas and pounds, rejects malformed or future dates", () => {
    expect(parseWeightEntry("78,4", "kg")).toBe(78.4);
    expect(parseWeightEntry("172.8", "lbs")).toBeCloseTo(78.381);
    expect(parseWeightEntry("78..4", "kg")).toBeNull();
    expect(parseWeightEntry("0", "kg")).toBeNull();
    expect(validWeightDate("2026-02-30", "2026-09-06")).toBe(false);
    expect(validWeightDate("2026-09-07", "2026-09-06")).toBe(false);
  });
  it("saves the row and profile atomically, then restores only this edit", async () => {
    seedFirestore({
      "users/u1": {
        weightKg: 80,
        targetCalories: 2200,
        targetProtein: 176,
        program: { goal: "cut" },
        theme: "dark",
      },
      [weightPath]: { date: today, weight: 80, source: "manual" },
    });
    failNextFirestore("commit");
    await expect(saveWeightEntry("u1", today, 78.412)).rejects.toThrow();
    expect(readDoc(weightPath)?.weight).toBe(80);
    expect(readDoc("users/u1")?.weightKg).toBe(80);
    const undo = await saveWeightEntry("u1", today, 78.412);
    expect(readDoc(weightPath)?.weight).toBe(78.412);
    expect(readDoc("users/u1")?.weightKg).toBe(78.4);
    expect(readDoc("users/u1")?.targetProtein).toBe(172);
    await undo();
    expect(readDoc(weightPath)?.weight).toBe(80);
    expect(readDoc("users/u1")?.theme).toBe("dark");
    expect(readDoc("users/u1")?.weightKg).toBe(80);
  });
  it("backdating never changes the current profile anchor", async () => {
    seedFirestore({ "users/u1": { weightKg: 80 } });
    const undo = await saveWeightEntry("u1", "2025-01-01", 75);
    expect(readDoc("users/u1")?.weightKg).toBe(80);
    await undo();
    expect(readDoc("users/u1/bodyweightLogs/2025-01-01")).toBeUndefined();
  });
  it("cannot undo a newer same-day entry", async () => {
    const undo = await saveWeightEntry("u1", today, 80);
    await saveWeightEntry("u1", today, 81);
    await expect(undo()).rejects.toThrow("newer weight");
    expect(readDoc(weightPath)?.weight).toBe(81);
  });
  it("recovers the original undo when acknowledgement cleanup fails", async () => {
    seedFirestore({
      [weightPath]: { date: today, weight: 80, source: "manual" },
    });
    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("storage");
      });
    await expect(saveWeightEntry("u1", today, 78)).rejects.toThrow(
      "Weight saved"
    );
    remove.mockRestore();
    const undo = await saveWeightEntry("u1", today, 78);
    await undo();
    expect(readDoc(weightPath)?.weight).toBe(80);
  });
});
describe("repeat meal correction", () => {
  it("scales every item without modifying the saved favourite", () => {
    const scaled = scaleQuickMeal(meal, 0.5);
    expect(scaled.cal).toBe(150);
    expect(scaled.bundle?.items[0].protein).toBe(7);
    expect(scaled.bundle?.items[1].carbs).toBe(15);
    expect(meal.cal).toBe(300);
    expect(meal.bundle?.items[0].protein).toBe(14);
  });
  it("reuses a retained retry identity and soft-deletes only its occurrence", async () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("storage"); });
    await saveQuickMeal("u1", meal, today);
    remove.mockRestore();
    const undo = await saveQuickMeal("u1", meal, today);
    await flushQueue(db, "u1");
    expect(allPaths().filter((p) => p.includes("/meals/"))).toHaveLength(1);
    await saveQuickMeal("u1", meal, today);
    await undo();
    await flushQueue(db, "u1");
    const entries = allPaths().filter((p) => p.includes("/meals/")).map((path) => readDoc(path)!);
    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => !entry.deletedAt)).toHaveLength(1);
  });
  it("undo preserves an edited meal in Recently Deleted", async () => {
    const undo = await saveQuickMeal("u1", meal, today);
    await flushQueue(db, "u1");
    const path = allPaths().find((p) => p.includes("/meals/"))!;
    seedFirestore({ [path]: { ...readDoc(path), totalCalories: 500 } });
    await undo();
    await flushQueue(db, "u1");
    expect(readDoc(path)?.totalCalories).toBe(500);
    expect(readDoc(path)?.deletedAt).toBeTruthy();
  });
});
