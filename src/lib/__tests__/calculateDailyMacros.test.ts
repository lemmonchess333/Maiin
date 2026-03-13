import { describe, it, expect } from "vitest";
import { calculateDailyTotals, type Meal } from "../calculateDailyMacros";

describe("calculateDailyTotals", () => {
  it("returns zeros for empty array", () => {
    const result = calculateDailyTotals([]);
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("returns single meal values unchanged", () => {
    const meal: Meal = { calories: 500, protein: 30, carbs: 60, fat: 15, createdAt: new Date() };
    const result = calculateDailyTotals([meal]);
    expect(result).toEqual({ calories: 500, protein: 30, carbs: 60, fat: 15 });
  });

  it("sums multiple meals correctly", () => {
    const meals: Meal[] = [
      { calories: 500, protein: 30, carbs: 60, fat: 15, createdAt: new Date() },
      { calories: 700, protein: 40, carbs: 80, fat: 20, createdAt: new Date() },
      { calories: 300, protein: 20, carbs: 30, fat: 10, createdAt: new Date() },
    ];
    const result = calculateDailyTotals(meals);
    expect(result).toEqual({ calories: 1500, protein: 90, carbs: 170, fat: 45 });
  });

  it("does not mutate input array", () => {
    const meals: Meal[] = [
      { calories: 500, protein: 30, carbs: 60, fat: 15, createdAt: new Date() },
    ];
    const copy = JSON.stringify(meals);
    calculateDailyTotals(meals);
    expect(JSON.stringify(meals)).toBe(copy);
  });
});
