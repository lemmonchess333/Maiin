import { describe, it, expect } from "vitest";
import { calculateTDEE, type ActivityLevel } from "../tdee";

describe("calculateTDEE", () => {
  it("calculates male BMR correctly (Mifflin-St Jeor)", () => {
    // BMR = 10*80 + 6.25*180 - 5*25 + 5 = 800 + 1125 - 125 + 5 = 1805
    const result = calculateTDEE(80, 180, 25, "sedentary", "recomp", "male");
    expect(result.bmr).toBe(1805);
  });

  it("calculates female BMR correctly", () => {
    // BMR = 10*80 + 6.25*180 - 5*25 - 161 = 800 + 1125 - 125 - 161 = 1639
    const result = calculateTDEE(80, 180, 25, "sedentary", "recomp", "female");
    expect(result.bmr).toBe(1639);
  });

  it("applies activity multipliers correctly", () => {
    const bmr = 1805; // male, 80kg, 180cm, 25yo
    const multipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    } as const;

    for (const [level, mult] of Object.entries(multipliers)) {
      const result = calculateTDEE(
        80,
        180,
        25,
        level as ActivityLevel,
        "recomp",
        "male"
      );
      expect(result.tdee).toBe(Math.round(bmr * mult));
    }
  });

  it("applies cut deficit of -500", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "cut", "male");
    expect(result.deficit).toBe(-500);
    expect(result.targetCalories).toBe(result.tdee - 500);
  });

  it("applies lean bulk surplus of +300", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "lean bulk", "male");
    expect(result.deficit).toBe(300);
    expect(result.targetCalories).toBe(result.tdee + 300);
  });

  it("applies no deficit for recomp", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "recomp", "male");
    expect(result.deficit).toBe(0);
    expect(result.targetCalories).toBe(result.tdee);
  });

  it("distributes macros correctly", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "recomp", "male");
    // Protein: 2.0 * 80 = 160g
    expect(result.protein).toBe(160);
    // Fat: 25% of targetCalories / 9
    const expectedFat = Math.round(
      Math.round(result.targetCalories * 0.25) / 9
    );
    expect(result.fat).toBe(expectedFat);
    // Carbs: remainder / 4
    const proteinCals = 160 * 4;
    const fatCals = Math.round(result.targetCalories * 0.25);
    const expectedCarbs = Math.round(
      Math.max(0, result.targetCalories - proteinCals - fatCals) / 4
    );
    expect(result.carbs).toBe(expectedCarbs);
  });

  it("uses higher protein multiplier for cut (2.2)", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "cut", "male");
    expect(result.protein).toBe(Math.round(2.2 * 80));
  });

  it("uses lower protein multiplier for lean bulk (1.8)", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "lean bulk", "male");
    expect(result.protein).toBe(Math.round(1.8 * 80));
  });

  it("stored macros reconcile to targetCalories — no 50g carb-floor overshoot (NUTR-M3)", () => {
    // Cut with a small carb remainder: the old 50g floor inflated carbs and
    // broke protein*4 + carbs*4 + fat*9 === targetCalories. Carbs are now the
    // balancing macro floored at 0 (matching getAdjustedTargets). The fixture
    // is a heavy sedentary body (high protein grams crowd the remainder) so
    // carbs stay below 50 even with the NUTR-L5 calorie floor applied.
    const result = calculateTDEE(90, 150, 80, "sedentary", "cut", "female");
    const macroCals = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(macroCals - result.targetCalories)).toBeLessThanOrEqual(5);
    expect(result.carbs).toBeLessThan(50); // would have been floored to 50 pre-fix
    expect(result.carbs).toBeGreaterThanOrEqual(0);
  });

  it("NUTR-L5: a deficit never pushes the target below 1200 kcal", () => {
    // Small sedentary female: tdee ≈ 1500. The UI's "Fast" rate (0.75 kg/wk →
    // −830/day) would emit ~670 kcal without the floor.
    const result = calculateTDEE(
      55,
      160,
      40,
      "sedentary",
      "cut",
      "female",
      -830
    );
    expect(result.tdee).toBeGreaterThan(1200);
    expect(result.targetCalories).toBe(1200);
    // The reported deficit is the EFFECTIVE offset after flooring.
    expect(result.deficit).toBe(1200 - result.tdee);
    // Macros still reconcile to the floored target.
    const macroCals = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(macroCals - result.targetCalories)).toBeLessThanOrEqual(5);
  });

  it("NUTR-L5: a body whose maintenance is below 1200 clamps to maintenance, not above it", () => {
    // Tiny/elderly sedentary body: tdee < 1200. The floor must not force a
    // surplus — the deficit is fully absorbed and the target sits at tdee.
    const result = calculateTDEE(40, 145, 80, "sedentary", "cut", "female");
    expect(result.tdee).toBeLessThan(1200);
    expect(result.targetCalories).toBe(result.tdee);
    expect(result.deficit).toBe(0);
  });

  it("NUTR-L5: surpluses are never floored", () => {
    const result = calculateTDEE(
      55,
      160,
      40,
      "sedentary",
      "lean bulk",
      "female",
      330
    );
    expect(result.targetCalories).toBe(result.tdee + 330);
    expect(result.deficit).toBe(330);
  });

  it("reconciles for a standard recomp profile too", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "recomp", "male");
    const macroCals = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(macroCals - result.targetCalories)).toBeLessThanOrEqual(5);
  });
});
