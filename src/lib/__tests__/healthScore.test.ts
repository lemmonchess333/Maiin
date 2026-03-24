import { describe, it, expect } from "vitest";
import { calculateHealthScore, getScoreColor, getScoreLabel } from "../healthScore";
import { THEME } from "../theme";

describe("calculateHealthScore", () => {
  const defaultTargets = {
    calories: 2000,
    protein: 150,
  };

  it("returns null score when no data at all", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, mealCount: 0 },
      defaultTargets
    );
    expect(result.score).toBeNull();
    expect(result.breakdown.total).toBe(0);
  });

  it("scores perfect nutrition when at target", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets
    );
    // Nutrition = 30/30
    expect(result.breakdown.nutrition).toBe(30);
  });

  it("scores 100 when all categories are perfect", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 2, waterGlasses: 8, waterTarget: 8, steps: 10000, stepsTarget: 10000 }
    );
    expect(result.score).toBe(100);
  });

  it("does not inflate score when only water is logged", () => {
    const result = calculateHealthScore(
      { calories: 0, protein: 0, mealCount: 0 },
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
      { calories: 0, protein: 0, mealCount: 0 },
      defaultTargets,
      { workoutsToday: 1 }
    );
    // 1 workout = 25 points (graduated)
    expect(result.breakdown.workouts).toBe(25);
    // Workout 25/35, nutrition 0/30, water 0/15 — all always available
    // Steps not available. So 25/80 scaled = 31
    expect(result.score).toBe(31);
  });

  it("returns capped score between 0 and 100", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 2, waterGlasses: 20, waterTarget: 8, steps: 50000, stepsTarget: 10000 }
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero calorie target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 500, protein: 50, mealCount: 2 },
      { ...defaultTargets, calories: 0 }
    );
    expect(result.score).not.toBeNaN();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero protein target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 100, mealCount: 2 },
      { ...defaultTargets, protein: 0 }
    );
    expect(result.score).not.toBeNaN();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero water target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 5, waterTarget: 0, steps: 5000, stepsTarget: 10000 }
    );
    expect(result.score).not.toBeNaN();
  });

  it("handles zero steps target without division by zero", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, waterGlasses: 5, waterTarget: 8, steps: 5000, stepsTarget: 0 }
    );
    expect(result.score).not.toBeNaN();
  });

  // Graduated workout scoring tests
  it("gives 0 workout points for 0 workouts on non-rest day", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, isRestDay: false }
    );
    expect(result.breakdown.workouts).toBe(0);
  });

  it("gives 25 workout points for 1 workout", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 1 }
    );
    expect(result.breakdown.workouts).toBe(25);
  });

  it("gives 35 workout points for 2+ workouts", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 2 }
    );
    expect(result.breakdown.workouts).toBe(35);

    const result3 = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 3 }
    );
    expect(result3.breakdown.workouts).toBe(35);
  });

  it("gives 35 workout points on rest day regardless of workout count", () => {
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 0, isRestDay: true }
    );
    expect(result.breakdown.workouts).toBe(35);
  });

  it("redistributes weights correctly with graduated workout scoring", () => {
    // 1 workout, no steps tracker → redistributes across 3 available categories
    const result = calculateHealthScore(
      { calories: 2000, protein: 150, mealCount: 3 },
      defaultTargets,
      { workoutsToday: 1, waterGlasses: 8, waterTarget: 8 }
    );
    // workout 25/35 + nutrition 30/30 + water 15/15 = 70/80 → 88
    expect(result.score).toBe(88);
  });
});

describe("getScoreColor", () => {
  it("returns green for scores >= 70", () => {
    expect(getScoreColor(70)).toBe(THEME.semantic.positive);
    expect(getScoreColor(85)).toBe(THEME.semantic.positive);
    expect(getScoreColor(100)).toBe(THEME.semantic.positive);
  });

  it("returns orange for scores 50-69", () => {
    expect(getScoreColor(50)).toBe(THEME.semantic.nutrition);
    expect(getScoreColor(69)).toBe(THEME.semantic.nutrition);
  });

  it("returns coral for scores < 50", () => {
    expect(getScoreColor(49)).toBe(THEME.semantic.vitals);
    expect(getScoreColor(0)).toBe(THEME.semantic.vitals);
  });
});

describe("getScoreLabel", () => {
  it("returns Optimal for >= 85", () => {
    expect(getScoreLabel(85)).toBe("Optimal");
    expect(getScoreLabel(100)).toBe("Optimal");
  });

  it("returns Good for 70-84", () => {
    expect(getScoreLabel(70)).toBe("Good");
    expect(getScoreLabel(84)).toBe("Good");
  });

  it("returns Building Up for 50-69", () => {
    expect(getScoreLabel(50)).toBe("Building Up");
    expect(getScoreLabel(69)).toBe("Building Up");
  });

  it("returns Getting Started for 25-49", () => {
    expect(getScoreLabel(25)).toBe("Getting Started");
    expect(getScoreLabel(49)).toBe("Getting Started");
  });

  it("returns Just Beginning for < 25", () => {
    expect(getScoreLabel(24)).toBe("Just Beginning");
    expect(getScoreLabel(0)).toBe("Just Beginning");
  });
});
