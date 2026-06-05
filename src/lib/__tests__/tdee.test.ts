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
    // Aggressive cut with a small carb remainder: the old 50g floor inflated
    // carbs and broke protein*4 + carbs*4 + fat*9 === targetCalories. Carbs are
    // now the balancing macro floored at 0 (matching getAdjustedTargets).
    const result = calculateTDEE(40, 150, 60, "sedentary", "cut", "female");
    const macroCals = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(macroCals - result.targetCalories)).toBeLessThanOrEqual(5);
    expect(result.carbs).toBeLessThan(50); // would have been floored to 50 pre-fix
    expect(result.carbs).toBeGreaterThanOrEqual(0);
  });

  it("reconciles for a standard recomp profile too", () => {
    const result = calculateTDEE(80, 180, 25, "moderate", "recomp", "male");
    const macroCals = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(macroCals - result.targetCalories)).toBeLessThanOrEqual(5);
  });
});
