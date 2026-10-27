import { describe, it, expect } from "vitest";
import type { Meal } from "@/hooks/useMeals";
import {
  describePortion,
  entryPortion,
  mealPortionCaption,
  readPortion,
  rescaleMealPortion,
  writePortion,
} from "../mealPortion";

function meal(items: Meal["items"], extra: Partial<Meal> = {}): Meal {
  const sum = (k: "calories" | "protein" | "carbs" | "fat") =>
    items.reduce((s, i) => s + i[k], 0);
  return {
    id: "m1",
    date: "2026-10-11",
    foodName: "Meal",
    items,
    totalCalories: sum("calories"),
    totalProtein: sum("protein"),
    totalCarbs: sum("carbs"),
    totalFat: sum("fat"),
    confidence: "barcode",
    createdAt: null,
    ...extra,
  };
}

const item = (portionSize: string, calories = 200, protein = 10) => ({
  name: "Food",
  portionSize,
  calories,
  protein,
  carbs: 20,
  fat: 5,
});

describe("readPortion — the multiplier every scaled log writes", () => {
  it("reads the barcode and search form, the copy form, and nothing", () => {
    expect(readPortion("1.5x 100g")).toEqual({ multiplier: 1.5, base: "100g" });
    expect(readPortion("2 × 1 serving")).toEqual({
      multiplier: 2,
      base: "1 serving",
    });
    expect(readPortion("1 bar (60 g)")).toEqual({
      multiplier: 1,
      base: "1 bar (60 g)",
    });
    expect(readPortion(undefined)).toEqual({ multiplier: 1, base: "" });
  });

  it("multiplies a copy of a scaled entry", () => {
    expect(readPortion("2 × 1.5x 100g")).toEqual({
      multiplier: 3,
      base: "100g",
    });
  });

  it("writes the barcode form, and the bare portion at one", () => {
    expect(writePortion(1.5, "100g")).toBe("1.5x 100g");
    expect(writePortion(1, "100g")).toBe("100g");
    expect(writePortion(2, "")).toBe("2x 1 serving");
  });
});

describe("describePortion — what the diary row says", () => {
  it("turns a scaled gram portion into grams, unspaced", () => {
    expect(describePortion("1.5x 100g")).toBe("150g");
    expect(describePortion("150 g")).toBe("150g");
    expect(describePortion("0.6667x 150g")).toBe("100g");
  });

  it("counts servings and other units", () => {
    expect(describePortion("1.5x 1 serving")).toBe("1.5 servings");
    expect(describePortion("1.5 × 1 serving")).toBe("1.5 servings");
    expect(describePortion("0.5x 2 eggs")).toBe("1 egg");
    expect(describePortion("1.5x 1 bar (60 g)")).toBe("1.5 bars (60 g)");
    expect(describePortion("1 cup")).toBe("1 cup");
  });

  it("says servings for a portion with no number to scale", () => {
    expect(describePortion("2x medium")).toBe("2 servings");
    expect(describePortion("1.5 × logged portion")).toBe("1.5 servings");
    expect(describePortion("medium")).toBe("medium");
  });

  it("says nothing for a blank portion", () => {
    expect(describePortion("")).toBeNull();
    expect(describePortion(undefined)).toBeNull();
  });

  it("names one item's portion, and none for a meal of several", () => {
    expect(mealPortionCaption(meal([item("1.5x 1 serving")]))).toBe(
      "1.5 servings"
    );
    expect(mealPortionCaption(meal([item("200g"), item("150g")]))).toBeNull();
    expect(mealPortionCaption(meal([]))).toBeNull();
  });
});

describe("entryPortion and rescaleMealPortion — fixing a logged portion", () => {
  it("reads a gram entry's base, and a counted one's servings", () => {
    expect(entryPortion(meal([item("1.5x 100g")]))).toEqual({
      multiplier: 1.5,
      baseGrams: 100,
    });
    expect(entryPortion(meal([item("1 bar (60 g)")]))).toEqual({
      multiplier: 1,
      baseGrams: null,
    });
  });

  it("rescales from the logged base, not from the logged amount", () => {
    // 200 g logged at 300 kcal; the person ate 150 g.
    const logged = meal([item("200g", 300, 30)]);
    const fixed = rescaleMealPortion(logged, 0.75);
    expect(fixed.items[0].portionSize).toBe("0.75x 200g");
    expect(fixed.items[0].calories).toBe(225);
    expect(fixed.items[0].protein).toBe(22.5);
    expect(fixed.totalCalories).toBe(225);
    expect(fixed.totalProtein).toBe(22.5);
    expect(describePortion(fixed.items[0].portionSize)).toBe("150g");
  });

  it("goes back to the logged figures when the amount goes back", () => {
    const logged = meal([item("1 serving", 237, 3)]);
    const half = rescaleMealPortion(logged, 0.5);
    const back = rescaleMealPortion({ ...logged, ...half }, 1);
    expect(back.items[0].portionSize).toBe("1 serving");
    expect(back.totalCalories).toBe(237);
    expect(back.totalProtein).toBe(3);
  });

  it("scales every item of a meal whose items were scaled one by one", () => {
    const scan = meal([
      item("1.5x 1 cup pasta", 300),
      item("1 cup sauce", 100),
    ]);
    expect(entryPortion(scan).multiplier).toBe(1);
    const doubled = rescaleMealPortion(scan, 2);
    expect(doubled.items.map((i) => i.portionSize)).toEqual([
      "3x 1 cup pasta",
      "2x 1 cup sauce",
    ]);
    expect(doubled.totalCalories).toBe(800);
  });

  it("refuses an amount of zero", () => {
    expect(() => rescaleMealPortion(meal([item("100g")]), 0)).toThrow();
  });
});
