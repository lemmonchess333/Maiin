import { describe, it, expect } from "vitest";
import { calculateHealthScore, getScoreColor, getScoreLabel } from "../healthScore";
import { THEME } from "../theme";

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
    // Nutrition = 30/30
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

  it("does not inflate score when only water is logged", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, mealCount: 0 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 8, waterTarget: 8, steps: 0, stepsTarget: 10000 }
    );
    // Water 15/15, workouts 0/35, nutrition 0/30 — all always available
    // Steps not available (0 steps). So 15/80 scaled = 19
    expect(result.breakdown.water).toBe(15);
    expect(result.score).toBe(19);
  });

  it("handles workout-only scenario without inflating", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, mealCount: 0 },
      defaultTargets,
      { workoutsToday: 1 }
    );
    expect(result.breakdown.workouts).toBe(35);
    // Workout 35/35, nutrition 0/30, water 0/15 — all always available
    // Steps not available. So 35/80 scaled = 44
    expect(result.score).toBe(44);
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

  it("handles zero calorie target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 500, protein: 50, fiber: 10, sugar: 20, sodium: 1000, mealCount: 2 },
      { ...defaultTargets, calories: 0 }
    );
    expect(result.score).not.toBeNaN();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero protein target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 100, fiber: 10, sugar: 20, sodium: 1000, mealCount: 2 },
      { ...defaultTargets, protein: 0 }
    );
    expect(result.score).not.toBeNaN();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero water target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, fiber: 30, sugar: 40, sodium: 2000, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 5, waterTarget: 0, steps: 5000, stepsTarget: 10000 }
    );
    expect(result.score).not.toBeNaN();
  });

  it("handles zero steps target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, fiber: 30, sugar: 40, sodium: 2000, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 5, waterTarget: 8, steps: 5000, stepsTarget: 0 }
    );
    expect(result.score).not.toBeNaN();
  });
});

describe("getScoreColor", () => {
  it("returns green for scores >= 80", () => {
    expect(getScoreColor(80)).toBe(THEME.success);
    expect(getScoreColor(100)).toBe(THEME.success);
  });

  it("returns yellow for scores 60-79", () => {
    expect(getScoreColor(60)).toBe(THEME.warning);
    expect(getScoreColor(79)).toBe(THEME.warning);
  });

  it("returns orange for scores 40-59", () => {
    expect(getScoreColor(40)).toBe(THEME.semantic.nutrition);
    expect(getScoreColor(59)).toBe(THEME.semantic.nutrition);
  });

  it("returns red for scores < 40", () => {
    expect(getScoreColor(39)).toBe(THEME.danger);
    expect(getScoreColor(0)).toBe(THEME.danger);
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
