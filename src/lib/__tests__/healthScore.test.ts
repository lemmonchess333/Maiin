import { describe, it, expect } from "vitest";
import { calculateHealthScore, getScoreColor, getScoreLabel } from "../healthScore";

describe("calculateHealthScore", () => {
  const defaultTargets = {
    calories: 2000,
    protein: 150,
    fiber: 30,
    sugar: 50,
    sodium: 2300,
  };

  it("returns null score when no data at all", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, mealCount: 0 },
      defaultTargets
    );
    expect(result.score).toBeNull();
    expect(result.breakdown.total).toBe(0);
  });

  it("scores perfect nutrition when at target", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, fiber: 30, sugar: 40, sodium: 2000, mealCount: 3 },
      defaultTargets
    );
    // Nutrition = 30/30, only nutrition available, redistributed to 100
    expect(result.breakdown.nutrition).toBe(30);
  });

  it("scores 100 when all categories are perfect", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, fiber: 30, sugar: 40, sodium: 2000, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 1, waterGlasses: 8, waterTarget: 8, steps: 10000, stepsTarget: 10000 }
    );
    expect(result.score).toBe(100);
  });

  it("redistributes when only some categories have data", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, mealCount: 0 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 8, waterTarget: 8, steps: 0, stepsTarget: 10000 }
    );
    // Only water has data: 15/15, redistributed => 100
    expect(result.score).toBe(100);
  });

  it("handles workout-only scenario", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, mealCount: 0 },
      defaultTargets,
      { workoutsToday: 1 }
    );
    expect(result.breakdown.workouts).toBe(35);
    expect(result.score).toBe(100);
  });

  it("returns capped score between 0 and 100", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, fiber: 30, sugar: 40, sodium: 2000, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 1, waterGlasses: 20, waterTarget: 8, steps: 50000, stepsTarget: 10000 }
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("getScoreColor", () => {
  it("returns green for scores >= 80", () => {
    expect(getScoreColor(80)).toBe("#34D399");
    expect(getScoreColor(100)).toBe("#34D399");
  });

  it("returns yellow for scores 60-79", () => {
    expect(getScoreColor(60)).toBe("#FFB547");
    expect(getScoreColor(79)).toBe("#FFB547");
  });

  it("returns orange for scores 40-59", () => {
    expect(getScoreColor(40)).toBe("#f97316");
    expect(getScoreColor(59)).toBe("#f97316");
  });

  it("returns red for scores < 40", () => {
    expect(getScoreColor(39)).toBe("#EF4444");
    expect(getScoreColor(0)).toBe("#EF4444");
  });
});

describe("getScoreLabel", () => {
  it("returns Excellent for >= 80", () => {
    expect(getScoreLabel(80)).toBe("Excellent");
  });

  it("returns Good for 60-79", () => {
    expect(getScoreLabel(60)).toBe("Good");
    expect(getScoreLabel(79)).toBe("Good");
  });

  it("returns Fair for 40-59", () => {
    expect(getScoreLabel(40)).toBe("Fair");
    expect(getScoreLabel(59)).toBe("Fair");
  });

  it("returns Needs Work for < 40", () => {
    expect(getScoreLabel(39)).toBe("Needs Work");
  });
});
