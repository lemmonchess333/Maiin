import { describe, expect, it } from "vitest";
import { usualMeal } from "../usualMeal";
import type { Meal } from "@/hooks/useMeals";
const oats = (id: string, date: string, portion = "1 serving", calories = 420): Meal => ({
  id, date, foodName: "Oats", meal: "breakfast", confidence: "manual", createdAt: null,
  totalCalories: calories, totalProtein: 20, totalCarbs: 50, totalFat: 15,
  items: [{ name: "Oats", portionSize: portion, calories, protein: 20, carbs: 50, fat: 15 }],
});
describe("usual meals", () => {
  it("uses the last logged portion with its matching macros", () => {
    const usual = usualMeal([oats("a", "2026-09-03"), oats("b", "2026-09-04"), oats("c", "2026-09-05", "80 g", 500)], "breakfast", "2026-09-06");
    expect(usual?.portionSize).toBe("80 g");
    expect(usual?.cal).toBe(500);
  });
  it("hides after this slot is logged and returns after Undo", () => {
    const history = oats("a", "2026-09-05");
    const today = oats("b", "2026-09-06");
    expect(usualMeal([history, today], "breakfast", today.date)).toBeNull();
    expect(usualMeal([history, { ...today, deletedAt: true }], "breakfast", today.date)?.name).toBe("Oats");
    expect(usualMeal([history], "lunch", today.date)).toBeNull();
  });
  it("has no synthetic usual for a new account", () => {
    expect(usualMeal([], "breakfast", "2026-09-06")).toBeNull();
  });
  it("preserves every item in a multi-food meal", () => {
    const meal = oats("a", "2026-09-05");
    meal.items.push({ ...meal.items[0], name: "Berries", portionSize: "100 g" });
    expect(usualMeal([meal], "breakfast", "2026-09-06")?.bundle?.items).toEqual(meal.items);
  });
});
