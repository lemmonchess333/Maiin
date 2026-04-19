import { describe, it, expect } from "vitest";
import {
  EMPTY_DAILY_TOTALS,
  sumMealTotals,
  type MealTotalsInput,
} from "../mealTotals";

describe("sumMealTotals", () => {
  it("returns zeros + mealCount 0 for an empty list", () => {
    expect(sumMealTotals([])).toEqual(EMPTY_DAILY_TOTALS);
  });

  it("sums the prefixed `total*` shape (parsed Meal from useMeals)", () => {
    const meals: MealTotalsInput[] = [
      { totalCalories: 300, totalProtein: 20, totalCarbs: 40, totalFat: 10 },
      { totalCalories: 500, totalProtein: 30, totalCarbs: 60, totalFat: 15 },
    ];
    const t = sumMealTotals(meals);
    expect(t.calories).toBe(800);
    expect(t.protein).toBe(50);
    expect(t.carbs).toBe(100);
    expect(t.fat).toBe(25);
    expect(t.mealCount).toBe(2);
  });

  it("sums the legacy bare shape (old Firestore docs)", () => {
    const meals: MealTotalsInput[] = [
      { calories: 250, protein: 15, carbs: 30, fat: 5 },
      { calories: 400, protein: 25, carbs: 50, fat: 10 },
    ];
    const t = sumMealTotals(meals);
    expect(t.calories).toBe(650);
    expect(t.protein).toBe(40);
    expect(t.carbs).toBe(80);
    expect(t.fat).toBe(15);
  });

  it("mixes shapes in the same array (rolling migration)", () => {
    const meals: MealTotalsInput[] = [
      { totalCalories: 300, totalProtein: 20 },
      { calories: 200, protein: 10 },
    ];
    const t = sumMealTotals(meals);
    expect(t.calories).toBe(500);
    expect(t.protein).toBe(30);
  });

  it("prefers total* over the legacy bare field when both are present", () => {
    // If a doc somehow carries both, the prefixed form is authoritative
    // because that's what the current writer emits.
    const meals: MealTotalsInput[] = [
      { totalCalories: 100, calories: 999 },
    ];
    expect(sumMealTotals(meals).calories).toBe(100);
  });

  it("coerces non-finite values to 0 (NaN, undefined, strings)", () => {
    const meals: MealTotalsInput[] = [
      { totalCalories: NaN, totalProtein: undefined, totalCarbs: 40 },
      { totalCalories: "abc" as unknown as number, totalFat: 5 },
    ];
    const t = sumMealTotals(meals);
    expect(t.calories).toBe(0); // NaN + "abc" both → 0
    expect(t.protein).toBe(0);
    expect(t.carbs).toBe(40);
    expect(t.fat).toBe(5);
  });

  it("sums optional micro fields (fibre / sugar / sodium)", () => {
    const meals: MealTotalsInput[] = [
      { totalFiber: 5, totalSugar: 10, totalSodium: 100 },
      { totalFiber: 3, totalSugar: 8 }, // sodium absent
    ];
    const t = sumMealTotals(meals);
    expect(t.fiber).toBe(8);
    expect(t.sugar).toBe(18);
    expect(t.sodium).toBe(100);
  });

  it("reports mealCount = input length regardless of per-meal content", () => {
    // Empty meal objects still count — the logging event itself matters
    // (e.g. a user logging water or a tracked habit via the meals path).
    const meals: MealTotalsInput[] = [{}, {}, { totalCalories: 100 }];
    expect(sumMealTotals(meals).mealCount).toBe(3);
  });

  it("tolerates extra keys on the input (Firestore docs carry items/createdAt/etc.)", () => {
    // The sum only reads the macro fields; everything else is ignored.
    // Cast-through-unknown mirrors how useHomeData passes raw snapshot
    // payloads (`d.data() as MealTotalsInput`).
    const raw = [
      {
        totalCalories: 150,
        totalProtein: 12,
        items: [{ name: "oats" }],
        confidence: "high",
        createdAt: Date.now(),
      },
    ] as unknown as MealTotalsInput[];
    expect(sumMealTotals(raw)).toMatchObject({
      calories: 150,
      protein: 12,
      mealCount: 1,
    });
  });
});
