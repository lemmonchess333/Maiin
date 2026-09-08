// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: { uid: "a" } } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
import { auth, db } from "@/lib/firebase";
import { resetFirestore, readDoc } from "@/test/firestoreHarness";
import type { Meal } from "@/hooks/useMeals";
import { copySelectedMeals } from "../mealCopy";
import { undoMealEntries } from "../mealEntry";
import { flushQueue, pendingDocumentWrites } from "../offlineQueue";

beforeEach(() => {
  resetFirestore(); localStorage.clear(); vi.restoreAllMocks();
  Object.assign(auth.currentUser!, { uid: "a" });
});

const meal: Meal = {
  id: "yesterday-oats", date: "2026-09-07", foodName: "Oats", meal: "breakfast",
  items: [{ name: "Oats", portionSize: "80 g", calories: 400, protein: 20, carbs: 60, fat: 10 }],
  totalCalories: 400, totalProtein: 20, totalCarbs: 60, totalFat: 10,
  confidence: "manual", createdAt: new Date(), photoUrl: "legacy-photo",
};

describe("copy meals through the durable queue", () => {
  it("accepts offline selected entries and Undo deletes exactly their new document IDs", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const result = await copySelectedMeals("a", "2026-09-08", [
      { source: meal, multiplier: 0.5, destinationId: "today-oats" },
    ]);
    expect(result.error).toBeNull();
    const queued = pendingDocumentWrites("a", "users/a/meals");
    expect(queued.map((entry) => entry.id)).toEqual(["today-oats"]);
    await undoMealEntries("a", result.created.map((entry) => entry.id));
    online.mockReturnValue(true);
    await flushQueue(db, "a");
    expect(readDoc("users/a/meals/today-oats")).toMatchObject({
      date: "2026-09-08", meal: "breakfast", totalCalories: 200,
      items: [{ name: "Oats", portionSize: "0.5 × 80 g", calories: 200, protein: 10, carbs: 30, fat: 5 }],
    });
    expect(readDoc("users/a/meals/today-oats")?.deletedAt).toBeTruthy();
    expect(readDoc("users/a/meals/today-oats")).not.toHaveProperty("photoUrl");
    expect(readDoc("users/a/meals/yesterday-oats")).toBeUndefined();
  });

  it("does not report an accepted copy when local storage cannot keep it", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const result = await copySelectedMeals("a", "2026-09-08", [
      { source: meal, multiplier: 1, destinationId: "today-oats" },
    ]);
    expect(result.created).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(pendingDocumentWrites("a", "users/a/meals")).toEqual([]);
  });
});
