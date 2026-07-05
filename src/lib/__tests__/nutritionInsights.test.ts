import { describe, it, expect } from "vitest";
import {
  analyzeNutritionPatterns,
  getMacroBalance,
  type MealEntry,
} from "../nutritionInsights";

const targets = { calories: 2500, protein: 180, carbs: 300, fat: 80 };

function makeMeals(days: number, overrides?: Partial<MealEntry>): MealEntry[] {
  const meals: MealEntry[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000)
      .toISOString()
      .split("T")[0];
    meals.push({
      calories: 800,
      protein: 60,
      carbs: 100,
      fat: 25,
      mealType: "breakfast",
      date,
      ...overrides,
    });
    meals.push({
      calories: 900,
      protein: 65,
      carbs: 110,
      fat: 30,
      mealType: "lunch",
      date,
      ...overrides,
    });
    meals.push({
      calories: 800,
      protein: 55,
      carbs: 90,
      fat: 25,
      mealType: "dinner",
      date,
      ...overrides,
    });
  }
  return meals;
}

describe("analyzeNutritionPatterns", () => {
  it("returns empty for no meals", () => {
    expect(analyzeNutritionPatterns([], targets)).toEqual([]);
  });

  it("returns empty for fewer than 3 days", () => {
    const meals = makeMeals(2);
    expect(analyzeNutritionPatterns(meals, targets)).toEqual([]);
  });

  it("detects protein consistency", () => {
    const meals = makeMeals(7);
    const insights = analyzeNutritionPatterns(meals, targets);
    const proteinInsight = insights.find((i) => i.id === "protein-consistent");
    expect(proteinInsight).toBeDefined();
  });

  it("detects low protein intake", () => {
    const meals = makeMeals(7, { protein: 10 });
    const insights = analyzeNutritionPatterns(meals, targets);
    const lowProtein = insights.find((i) => i.id === "protein-low");
    expect(lowProtein).toBeDefined();
    expect(lowProtein!.type).toBe("warning");
  });

  it("detects skipping breakfast", () => {
    const meals: MealEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 86400000)
        .toISOString()
        .split("T")[0];
      meals.push({
        calories: 1000,
        protein: 80,
        carbs: 120,
        fat: 30,
        mealType: "lunch",
        date,
      });
      meals.push({
        calories: 1000,
        protein: 80,
        carbs: 120,
        fat: 30,
        mealType: "dinner",
        date,
      });
    }
    const insights = analyzeNutritionPatterns(meals, targets);
    const breakfast = insights.find((i) => i.id === "skipping-breakfast");
    expect(breakfast).toBeDefined();
  });

  // ── NUTR-L4 (#1107): per-day snapshotted targets ─────────────────────────
  // Each day is judged against the target as it stood ON that day; the flat
  // `targets` argument is only the fallback for days with no snapshot.

  const last7Dates = () =>
    Array.from(
      { length: 7 },
      (_, i) => new Date(Date.now() - i * 86400000).toISOString().split("T")[0]
    );

  it('NUTR-L4: per-day protein targets flip a flat-target "consistent" into an honest low-protein warning', () => {
    // 180g/day intake vs a flat 180g target reads as consistent — but the
    // snapshots say the target on those days was 270g.
    const meals = makeMeals(7);
    const byDate = new Map(
      last7Dates().map((d) => [
        d,
        { calories: 2500, protein: 270, carbs: 300, fat: 80 },
      ])
    );
    const insights = analyzeNutritionPatterns(meals, targets, byDate);
    expect(insights.find((i) => i.id === "protein-consistent")).toBeUndefined();
    const low = insights.find((i) => i.id === "protein-low");
    expect(low).toBeDefined();
    // The warning quotes the (average) per-day target, not the flat fallback.
    expect(low!.message).toContain("270g target");
  });

  it("NUTR-L4: per-day calorie targets judge on-target days against that day's snapshot", () => {
    // 2500 kcal/day intake. Today's target is 3200 (e.g. post-edit), so the
    // flat comparison finds zero on-target days — but the snapshots show the
    // target WAS 2500 on those days.
    const meals = makeMeals(7);
    const todaysTargets = { calories: 3200, protein: 180, carbs: 300, fat: 80 };
    const flatOnly = analyzeNutritionPatterns(meals, todaysTargets);
    expect(flatOnly.find((i) => i.id === "calories-on-target")).toBeUndefined();

    const byDate = new Map(
      last7Dates().map((d) => [
        d,
        { calories: 2500, protein: 180, carbs: 300, fat: 80 },
      ])
    );
    const withSnapshots = analyzeNutritionPatterns(
      meals,
      todaysTargets,
      byDate
    );
    expect(
      withSnapshots.find((i) => i.id === "calories-on-target")
    ).toBeDefined();
  });

  it("NUTR-L4: a snapshot with zero fields falls back to the flat target per field", () => {
    // Legacy/garbage snapshot (all zeros) must not judge every day as an
    // automatic hit or miss — behaviour matches passing no snapshots at all.
    const meals = makeMeals(7);
    const byDate = new Map(
      last7Dates().map((d) => [
        d,
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ])
    );
    const withZeros = analyzeNutritionPatterns(meals, targets, byDate);
    const without = analyzeNutritionPatterns(meals, targets);
    expect(withZeros).toEqual(without);
  });

  it("NUTR-L4: days without a snapshot use the flat fallback", () => {
    // Snapshot only the single oldest day with a huge protein target — the
    // other 6 days still hit via the flat target, so 6/7 >= 80% keeps the
    // positive insight.
    const meals = makeMeals(7);
    const oldest = last7Dates()[6];
    const byDate = new Map([
      [oldest, { calories: 2500, protein: 999, carbs: 300, fat: 80 }],
    ]);
    const insights = analyzeNutritionPatterns(meals, targets, byDate);
    const consistent = insights.find((i) => i.id === "protein-consistent");
    expect(consistent).toBeDefined();
    expect(consistent!.message).toContain("6 of the last 7");
  });

  it("sorts by priority descending", () => {
    const meals = makeMeals(7, { protein: 10 });
    const insights = analyzeNutritionPatterns(meals, targets);
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].priority).toBeGreaterThanOrEqual(
        insights[i].priority
      );
    }
  });
});

describe("getMacroBalance", () => {
  it("returns zero for no macros", () => {
    const result = getMacroBalance(0, 0, 0);
    expect(result.proteinPct).toBe(0);
    expect(result.carbsPct).toBe(0);
    expect(result.fatPct).toBe(0);
  });

  it("calculates correct percentages", () => {
    // 200g protein = 800cal, 250g carbs = 1000cal, 70g fat = 630cal
    // Total = 2430cal
    const result = getMacroBalance(200, 250, 70);
    expect(result.proteinPct).toBe(33); // 800/2430
    expect(result.carbsPct).toBe(41); // 1000/2430
    expect(result.fatPct).toBe(26); // 630/2430
  });

  it("percentages roughly sum to 100", () => {
    const result = getMacroBalance(180, 300, 80);
    const sum = result.proteinPct + result.carbsPct + result.fatPct;
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});
