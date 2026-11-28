import { describe, it, expect } from "vitest";
import type { Meal } from "@/hooks/useMeals";
import { buildCopyPreviousDay } from "../copyYesterday";

function makeMeal(
  id: string,
  totalCalories: number,
  overrides: Partial<Meal> = {}
): Meal {
  return {
    id,
    date: "2026-11-24",
    meal: "lunch",
    foodName: `Meal ${id}`,
    items: [],
    totalCalories,
    totalProtein: 30,
    totalCarbs: 40,
    totalFat: 10,
    confidence: "high",
    createdAt: null,
    ...overrides,
  };
}

describe("buildCopyPreviousDay", () => {
  it("returns null when there are no eligible meals", () => {
    expect(buildCopyPreviousDay([], "2026-11-25")).toBeNull();
    expect(
      buildCopyPreviousDay([makeMeal("m1", 400)], "2026-11-25", new Set(["m1"]))
    ).toBeNull();
    expect(
      buildCopyPreviousDay(
        [makeMeal("m1", 400, { deletedAt: "2026-11-24T12:00:00Z" })],
        "2026-11-25"
      )
    ).toBeNull();
  });

  it("builds deterministic MealCopySelection items with multiplier 1 and totals", () => {
    const plan = buildCopyPreviousDay(
      [makeMeal("a", 520.4), makeMeal("b", 680.3), makeMeal("c", 300)],
      "2026-11-25",
      new Set(["c"])
    );
    expect(plan).not.toBeNull();
    expect(plan!.mealCount).toBe(2);
    expect(plan!.totalCalories).toBe(1201);
    expect(plan!.selections.map((s) => s.destinationId)).toEqual([
      "copy-day-2026-11-25-a",
      "copy-day-2026-11-25-b",
    ]);
    expect(plan!.selections.every((s) => s.multiplier === 1)).toBe(true);
  });
});
