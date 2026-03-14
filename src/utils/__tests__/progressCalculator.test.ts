import { describe, it, expect } from "vitest";
import { calculateProgress } from "../progressCalculator";

describe("calculateProgress", () => {
  it("returns base 2200 calories for recomp with no weight change", () => {
    const result = calculateProgress({ bodyweightTrend: [], userGoal: "recomp" });
    expect(result.calorieBase).toBe(2200);
    expect(result.weightChange).toBe(0);
  });

  it("adds 200 for lean bulk goal", () => {
    const result = calculateProgress({ bodyweightTrend: [], userGoal: "lean bulk" });
    expect(result.calorieBase).toBe(2400);
  });

  it("subtracts 300 for cut goal", () => {
    const result = calculateProgress({ bodyweightTrend: [], userGoal: "cut" });
    expect(result.calorieBase).toBe(1900);
  });

  it("adjusts calories based on weight change", () => {
    // Weight trend of [0.5, 0.5] = 1.0 total change
    // Base for recomp: 2200 + round((1.0 * 7700) / 7) = 2200 + 1100 = 3300
    const result = calculateProgress({ bodyweightTrend: [0.5, 0.5], userGoal: "recomp" });
    expect(result.weightChange).toBe(1.0);
    expect(result.calorieBase).toBe(3300);
  });

  it("calculates macros as 40/40/20 split", () => {
    const result = calculateProgress({ bodyweightTrend: [], userGoal: "recomp" });
    // 2200 base: protein = 40%/4 = 220g, carbs = 40%/4 = 220g, fat = 20%/9 ≈ 49g
    expect(result.macros.protein).toBe(Math.round((2200 * 0.4) / 4));
    expect(result.macros.carbs).toBe(Math.round((2200 * 0.4) / 4));
    expect(result.macros.fat).toBe(Math.round((2200 * 0.2) / 9));
  });

  it("handles negative weight trend", () => {
    const result = calculateProgress({ bodyweightTrend: [-0.5, -0.5], userGoal: "cut" });
    // cut: 2200 - 300 = 1900, weight change = -1.0, adjust = round((-1.0 * 7700) / 7) = -1100
    expect(result.weightChange).toBe(-1.0);
    expect(result.calorieBase).toBe(800);
  });
});
