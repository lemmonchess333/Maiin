import { describe, it, expect } from "vitest";
import { linearTrend, calculateAdaptiveTDEE } from "../adaptiveTDEE";

describe("linearTrend", () => {
  it("returns 0 for fewer than 2 data points", () => {
    expect(linearTrend([])).toBe(0);
    expect(linearTrend([{ date: "2026-01-01", weight: 80 }])).toBe(0);
  });

  it("returns 0 for flat weights", () => {
    const weights = [
      { date: "2026-01-01", weight: 80 },
      { date: "2026-01-02", weight: 80 },
      { date: "2026-01-03", weight: 80 },
    ];
    expect(linearTrend(weights)).toBe(0);
  });

  it("returns positive slope for ascending weights", () => {
    const weights = [
      { date: "2026-01-01", weight: 70 },
      { date: "2026-01-02", weight: 71 },
      { date: "2026-01-03", weight: 72 },
    ];
    expect(linearTrend(weights)).toBeCloseTo(1.0, 5);
  });

  it("returns negative slope for descending weights", () => {
    const weights = [
      { date: "2026-01-01", weight: 80 },
      { date: "2026-01-02", weight: 79 },
      { date: "2026-01-03", weight: 78 },
    ];
    expect(linearTrend(weights)).toBeCloseTo(-1.0, 5);
  });
});

describe("calculateAdaptiveTDEE", () => {
  const defaultTargets = { calories: 2500, protein: 160, carbs: 250, fat: 70 };

  it("returns unchanged targets when insufficient weight data", () => {
    const weights = [
      { date: "2026-01-01", weight: 80 },
      { date: "2026-01-02", weight: 80 },
    ]; // only 2, need 4
    const calories = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      calories: 2500,
    }));
    const result = calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80);
    expect(result.confidence).toBe("low");
    expect(result.adjustedCalories).toBe(2500);
  });

  it("returns unchanged targets when insufficient calorie data", () => {
    const weights = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      weight: 80,
    }));
    const calories = [
      { date: "2026-01-01", calories: 2500 },
      { date: "2026-01-02", calories: 2500 },
    ]; // only 2, need 7
    const result = calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80);
    expect(result.confidence).toBe("low");
    expect(result.adjustedCalories).toBe(2500);
  });

  it("calculates TDEE with sufficient data", () => {
    const weights = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      weight: 80, // flat weight
    }));
    const calories = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      calories: 2500,
    }));
    const result = calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80);
    // Flat weight + 2500 cal/day = TDEE ~ 2500
    expect(result.estimatedTDEE).toBe(2500);
    expect(result.confidence).toBe("high");
    expect(result.weeklyWeightChange).toBeCloseTo(0);
  });

  it("returns high confidence with enough data", () => {
    const weights = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      weight: 80,
    }));
    const calories = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      calories: 2500,
    }));
    const result = calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80);
    expect(result.confidence).toBe("high");
  });

  it("returns medium confidence with moderate data", () => {
    const weights = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      weight: 80,
    }));
    const calories = Array.from({ length: 8 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      calories: 2500,
    }));
    const result = calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80);
    expect(result.confidence).toBe("medium");
  });

  it("sets correct target weight change per goal", () => {
    const weights = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      weight: 80,
    }));
    const calories = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      calories: 2500,
    }));

    expect(
      calculateAdaptiveTDEE(weights, calories, "lean bulk", defaultTargets, 80).targetWeightChange
    ).toBe(0.3);
    expect(
      calculateAdaptiveTDEE(weights, calories, "cut", defaultTargets, 80).targetWeightChange
    ).toBe(-0.5);
    expect(
      calculateAdaptiveTDEE(weights, calories, "recomp", defaultTargets, 80).targetWeightChange
    ).toBe(0);
  });
});
