import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Meal } from "@/hooks/useMeals";

vi.mock("@/lib/mealEntry", () => ({ createMealEntry: vi.fn() }));

import { createMealEntry } from "@/lib/mealEntry";
import { copySelectedMeals, mealCopyPayload, parseCopyPortion } from "../mealCopy";

const source: Meal = {
  id: "yesterday-oats", date: "2026-09-07", foodName: "Oats and milk",
  meal: "breakfast", confidence: "manual", createdAt: { toDate: () => new Date(2026, 8, 7, 19) },
  items: [{ name: "Oats", portionSize: "80 g", calories: 300, protein: 12, carbs: 50, fat: 6, fiber: 8, sugar: 2, sodium: 2 },
    { name: "Milk", portionSize: "250 ml", calories: 150, protein: 9, carbs: 13, fat: 5, sugar: 13 }],
  totalCalories: 450, totalProtein: 21, totalCarbs: 63, totalFat: 11,
  totalFiber: 8, totalSugar: 15, totalSodium: 100,
  photoUrl: "legacy-photo", deletedAt: "old", revisionCount: 4, userEditedFields: ["totalCalories"],
};

beforeEach(() => vi.resetAllMocks());

describe("copying a logged meal", () => {
  it("preserves the logged portion and explicit slot with multiplier 1", () => {
    const result = mealCopyPayload(source, 1, "2026-09-08");
    expect(result.date).toBe("2026-09-08");
    expect(result.meal).toBe("breakfast");
    expect(result.items).toEqual(source.items);
    expect(result.totalCalories).toBe(450);
    expect(result).not.toHaveProperty("photoUrl");
    expect(result).not.toHaveProperty("deletedAt");
    expect(result).not.toHaveProperty("revisionCount");
    expect(result).not.toHaveProperty("userEditedFields");
  });

  it("scales each ingredient and all diary totals from the previous logged amount", () => {
    const result = mealCopyPayload(source, 0.5, "2026-09-08");
    expect(result.items).toEqual([
      { name: "Oats", portionSize: "0.5 × 80 g", calories: 150, protein: 6, carbs: 25, fat: 3, fiber: 4, sugar: 1, sodium: 1 },
      { name: "Milk", portionSize: "0.5 × 250 ml", calories: 75, protein: 4.5, carbs: 6.5, fat: 2.5, sugar: 6.5 },
    ]);
    expect(result).toMatchObject({ totalCalories: 225, totalProtein: 10.5, totalCarbs: 31.5, totalFat: 5.5, totalFiber: 4, totalSugar: 7.5, totalSodium: 50 });
    expect(source.items[0].portionSize).toBe("80 g");
  });

  it("keeps manually edited totals independent of ingredient totals", () => {
    const result = mealCopyPayload({ ...source, totalCalories: 500 }, 2, "2026-09-08");
    expect(result.totalCalories).toBe(1000);
    expect(result.items.reduce((total, item) => total + item.calories, 0)).toBe(900);
  });

  it("derives a legacy slot from its original timestamp, not today's log time", () => {
    expect(mealCopyPayload({ ...source, meal: undefined }, 1, "2026-09-08").meal).toBe("dinner");
  });

  it.each(["0", "-1", "", "Infinity", "21", "1e2", "1abc"])("does not accept invalid portion %s", (raw) => {
    expect(parseCopyPortion(raw)).toBeNull();
  });

  it.each([["0.5", 0.5], ["0,5", 0.5], [".5", 0.5], ["1.", 1], ["20", 20]])("accepts %s as %s logged portions", (raw, expected) => {
    expect(parseCopyPortion(String(raw))).toBe(expected);
  });

  it("validates all selections before writing any document", async () => {
    const result = await copySelectedMeals("a", "2026-09-08", [
      { source, multiplier: 1, destinationId: "new-a" },
      { source: { ...source, id: "second" }, multiplier: 0, destinationId: "new-b" },
    ]);
    expect(createMealEntry).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("reports exactly the accepted document when a later copy fails", async () => {
    vi.mocked(createMealEntry).mockResolvedValueOnce({ id: "new-a" } as never)
      .mockRejectedValueOnce(new Error("storage full"));
    const result = await copySelectedMeals("a", "2026-09-08", [
      { source, multiplier: 1, destinationId: "new-a" },
      { source: { ...source, id: "second" }, multiplier: 2, destinationId: "new-b" },
      { source: { ...source, id: "third" }, multiplier: 1, destinationId: "new-c" },
    ]);
    expect(result.created).toEqual([{ sourceId: source.id, id: "new-a", slot: "breakfast" }]);
    expect(result.error).toBeInstanceOf(Error);
    expect(createMealEntry).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createMealEntry).mock.calls.map((args) => args[2])).toEqual(["new-a", "new-b"]);
  });
});
