import { describe, it, expect } from "vitest";
import {
  getWeekKey,
  weekKeyMinusN,
  computeBaseline,
  computeLiftLoadScore,
  computeRunLoadScore,
  computeRecoveryScore,
  computeLoadBand,
  shouldRecommendDeload,
} from "../performanceEngine";
import type { WeeklyAggregates, Baseline } from "../performanceTypes";

// ── Helpers ──────────────────────────────────

function makeAgg(overrides: Partial<WeeklyAggregates> = {}): WeeklyAggregates {
  return {
    weekKey: "2025-01-05",
    liftTonnage: 10000,
    liftHardSets: 20,
    liftSessions: 3,
    runKm: 25,
    runLongKm: 10,
    runQualityCount: 1,
    runSessions: 3,
    mealDaysLogged: 5,
    avgDailyCalories: 2500,
    avgDailyProtein: 160,
    bwCurrent7dAvg: 80,
    bwPrevious7dAvg: 80,
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
    liftTonnage: 10000,
    liftHardSets: 20,
    runKm: 25,
    runLongKm: 10,
    weeksUsed: 4,
    ...overrides,
  };
}

// ── getWeekKey ────────────────────────────────

describe("getWeekKey", () => {
  it("returns the Sunday of the week for a Sunday", () => {
    // 2025-01-05 is a Sunday
    const result = getWeekKey(new Date("2025-01-05T12:00:00"));
    expect(result).toBe("2025-01-05");
  });

  it("returns the previous Sunday for a Wednesday", () => {
    // 2025-01-08 is a Wednesday → Sunday is 2025-01-05
    const result = getWeekKey(new Date("2025-01-08T12:00:00"));
    expect(result).toBe("2025-01-05");
  });

  it("returns the previous Sunday for a Saturday", () => {
    // 2025-01-11 is a Saturday → Sunday is 2025-01-05
    const result = getWeekKey(new Date("2025-01-11T12:00:00"));
    expect(result).toBe("2025-01-05");
  });

  it("returns the previous Sunday for a Monday", () => {
    // 2025-01-06 is a Monday → Sunday is 2025-01-05
    const result = getWeekKey(new Date("2025-01-06T12:00:00"));
    expect(result).toBe("2025-01-05");
  });

  it("handles year boundaries", () => {
    // 2025-01-01 is a Wednesday → Sunday is 2024-12-29
    const result = getWeekKey(new Date("2025-01-01T12:00:00"));
    expect(result).toBe("2024-12-29");
  });
});

// ── weekKeyMinusN ────────────────────────────

describe("weekKeyMinusN", () => {
  it("subtracts 1 week correctly", () => {
    expect(weekKeyMinusN("2025-01-12", 1)).toBe("2025-01-05");
  });

  it("subtracts 4 weeks correctly", () => {
    expect(weekKeyMinusN("2025-01-26", 4)).toBe("2024-12-29");
  });

  it("subtracts 0 weeks (returns same key)", () => {
    expect(weekKeyMinusN("2025-03-02", 0)).toBe("2025-03-02");
  });

  it("handles crossing year boundaries", () => {
    expect(weekKeyMinusN("2025-01-05", 2)).toBe("2024-12-22");
  });
});

// ── computeBaseline ──────────────────────────

describe("computeBaseline", () => {
  it("averages prior weeks correctly", () => {
    const weeks: WeeklyAggregates[] = [
      makeAgg({ liftTonnage: 8000, liftHardSets: 16, runKm: 20, runLongKm: 8, liftSessions: 3, runSessions: 2 }),
      makeAgg({ liftTonnage: 12000, liftHardSets: 24, runKm: 30, runLongKm: 12, liftSessions: 4, runSessions: 3 }),
    ];
    const bl = computeBaseline(weeks);
    expect(bl.liftTonnage).toBe(10000);
    expect(bl.liftHardSets).toBe(20);
    expect(bl.runKm).toBe(25);
    expect(bl.runLongKm).toBe(10);
    expect(bl.weeksUsed).toBe(2);
  });

  it("filters out weeks with zero sessions", () => {
    const weeks: WeeklyAggregates[] = [
      makeAgg({ liftTonnage: 8000, liftHardSets: 16, runKm: 20, runLongKm: 8 }),
      makeAgg({ liftTonnage: 0, liftHardSets: 0, runKm: 0, runLongKm: 0, liftSessions: 0, runSessions: 0 }),
    ];
    const bl = computeBaseline(weeks);
    expect(bl.liftTonnage).toBe(8000);
    expect(bl.weeksUsed).toBe(1);
  });

  it("returns zeros with weeksUsed=0 when all weeks are empty", () => {
    const weeks: WeeklyAggregates[] = [
      makeAgg({ liftSessions: 0, runSessions: 0 }),
    ];
    const bl = computeBaseline(weeks);
    // n becomes 1 (||1 fallback), all values are 0
    expect(bl.weeksUsed).toBe(0);
    expect(bl.liftTonnage).toBe(0);
  });

  it("handles empty array", () => {
    const bl = computeBaseline([]);
    expect(bl.weeksUsed).toBe(0);
    expect(bl.liftTonnage).toBe(0);
    expect(bl.runKm).toBe(0);
  });
});

// ── computeLiftLoadScore ─────────────────────

describe("computeLiftLoadScore", () => {
  it("returns 0 when no lift sessions", () => {
    const agg = makeAgg({ liftSessions: 0 });
    expect(computeLiftLoadScore(agg, makeBaseline())).toBe(0);
  });

  it("returns ~67 when current matches baseline exactly", () => {
    const agg = makeAgg({ liftTonnage: 10000, liftHardSets: 20 });
    const bl = makeBaseline({ liftTonnage: 10000, liftHardSets: 20 });
    // raw = 1.0*0.7 + 1.0*0.3 = 1.0 → clamp(1.0*67) = 67
    expect(computeLiftLoadScore(agg, bl)).toBe(67);
  });

  it("returns score above 67 when current exceeds baseline", () => {
    const agg = makeAgg({ liftTonnage: 15000, liftHardSets: 30 });
    const bl = makeBaseline({ liftTonnage: 10000, liftHardSets: 20 });
    const score = computeLiftLoadScore(agg, bl);
    expect(score).toBeGreaterThan(67);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns score below 67 when current is below baseline", () => {
    const agg = makeAgg({ liftTonnage: 5000, liftHardSets: 10 });
    const bl = makeBaseline({ liftTonnage: 10000, liftHardSets: 20 });
    const score = computeLiftLoadScore(agg, bl);
    expect(score).toBeLessThan(67);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("caps at 100", () => {
    const agg = makeAgg({ liftTonnage: 30000, liftHardSets: 50 });
    const bl = makeBaseline({ liftTonnage: 10000, liftHardSets: 20 });
    expect(computeLiftLoadScore(agg, bl)).toBe(100);
  });

  it("handles zero baseline with non-zero current (safeRatio returns 1.2)", () => {
    const agg = makeAgg({ liftTonnage: 5000, liftHardSets: 10, liftSessions: 2 });
    const bl = makeBaseline({ liftTonnage: 0, liftHardSets: 0 });
    // safeRatio returns 1.2 for both → raw = 1.2 → clamp(1.2*67) = clamp(80.4) = 80
    expect(computeLiftLoadScore(agg, bl)).toBe(80);
  });
});

// ── computeRunLoadScore ──────────────────────

describe("computeRunLoadScore", () => {
  it("returns 0 when no run sessions", () => {
    const agg = makeAgg({ runSessions: 0 });
    expect(computeRunLoadScore(agg, makeBaseline())).toBe(0);
  });

  it("returns ~67 when current matches baseline with no quality bonus", () => {
    const agg = makeAgg({ runKm: 25, runLongKm: 10, runQualityCount: 0 });
    const bl = makeBaseline({ runKm: 25, runLongKm: 10 });
    // raw = 1.0*0.6 + 1.0*0.4 = 1.0 → clamp(1.0*67 + 0) = 67
    expect(computeRunLoadScore(agg, bl)).toBe(67);
  });

  it("adds 10-point quality bonus when runQualityCount > 0", () => {
    const agg = makeAgg({ runKm: 25, runLongKm: 10, runQualityCount: 2 });
    const bl = makeBaseline({ runKm: 25, runLongKm: 10 });
    // 67 + 10 = 77
    expect(computeRunLoadScore(agg, bl)).toBe(77);
  });

  it("returns score above 67 when volume exceeds baseline", () => {
    const agg = makeAgg({ runKm: 40, runLongKm: 15, runQualityCount: 0 });
    const bl = makeBaseline({ runKm: 25, runLongKm: 10 });
    expect(computeRunLoadScore(agg, bl)).toBeGreaterThan(67);
  });

  it("caps at 100", () => {
    const agg = makeAgg({ runKm: 60, runLongKm: 25, runQualityCount: 3 });
    const bl = makeBaseline({ runKm: 20, runLongKm: 8 });
    expect(computeRunLoadScore(agg, bl)).toBe(100);
  });
});

// ── computeRecoveryScore ─────────────────────

describe("computeRecoveryScore", () => {
  it("starts at 60 with no modifiers", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(60);
  });

  it("adds 20 for stable bodyweight (delta <= 0.5)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80,
      bwPrevious7dAvg: 80.3,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(80); // 60 + 20
  });

  it("adds 10 for moderate bodyweight change (0.5 < delta <= 1.0)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80,
      bwPrevious7dAvg: 80.8,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(70); // 60 + 10
  });

  it("subtracts 15 for large bodyweight change (> 2.0)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80,
      bwPrevious7dAvg: 83,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(45); // 60 - 15
  });

  it("adds 15 for 5+ meal days logged", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      mealDaysLogged: 6,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(75); // 60 + 15
  });

  it("adds 8 for 3-4 meal days logged", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      mealDaysLogged: 3,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(68); // 60 + 8
  });

  it("subtracts 10 for > 8 total sessions (overtraining)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      mealDaysLogged: 0,
      liftSessions: 5,
      runSessions: 5,
    });
    expect(computeRecoveryScore(agg)).toBe(50); // 60 - 10
  });

  it("adds 5 for balanced session count (4-6)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      mealDaysLogged: 0,
      liftSessions: 3,
      runSessions: 2,
    });
    expect(computeRecoveryScore(agg)).toBe(65); // 60 + 5
  });

  it("combines multiple modifiers", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80,
      bwPrevious7dAvg: 80.2,
      mealDaysLogged: 7,
      liftSessions: 3,
      runSessions: 2,
    });
    // 60 + 20 (stable bw) + 15 (meals) + 5 (balanced sessions) = 100
    expect(computeRecoveryScore(agg)).toBe(100);
  });

  it("clamps at 0", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 70,
      bwPrevious7dAvg: 80,
      mealDaysLogged: 0,
      liftSessions: 5,
      runSessions: 5,
    });
    // 60 - 15 (big bw change) - 10 (overtraining) = 35
    expect(computeRecoveryScore(agg)).toBe(35);
  });
});

// ── computeLoadBand ──────────────────────────

describe("computeLoadBand", () => {
  it("returns 'overreach' for PI >= 85", () => {
    expect(computeLoadBand(85)).toBe("overreach");
    expect(computeLoadBand(100)).toBe("overreach");
  });

  it("returns 'high' for PI 70-84", () => {
    expect(computeLoadBand(70)).toBe("high");
    expect(computeLoadBand(84)).toBe("high");
  });

  it("returns 'moderate' for PI 45-69", () => {
    expect(computeLoadBand(45)).toBe("moderate");
    expect(computeLoadBand(69)).toBe("moderate");
  });

  it("returns 'low' for PI 25-44", () => {
    expect(computeLoadBand(25)).toBe("low");
    expect(computeLoadBand(44)).toBe("low");
  });

  it("returns 'deload' for PI < 25", () => {
    expect(computeLoadBand(0)).toBe("deload");
    expect(computeLoadBand(24)).toBe("deload");
  });
});

// ── shouldRecommendDeload ────────────────────

describe("shouldRecommendDeload", () => {
  it("returns true when PI >= 80 and recovery < 45", () => {
    expect(shouldRecommendDeload(80, 44, 60)).toBe(true);
    expect(shouldRecommendDeload(90, 30, 70)).toBe(true);
  });

  it("returns false when PI >= 80 but recovery >= 45", () => {
    expect(shouldRecommendDeload(80, 45, 60)).toBe(false);
  });

  it("returns true for sustained high load (two weeks >= 75)", () => {
    expect(shouldRecommendDeload(75, 60, 60, 75)).toBe(true);
    expect(shouldRecommendDeload(80, 60, 60, 80)).toBe(true);
  });

  it("returns false if only current week is high but previous is not", () => {
    expect(shouldRecommendDeload(75, 60, 60, 60)).toBe(false);
  });

  it("returns false if previous week PI is undefined", () => {
    expect(shouldRecommendDeload(75, 60, 60, undefined)).toBe(false);
  });

  it("returns true when PI >= 70 and adherence < 50 (burning out)", () => {
    expect(shouldRecommendDeload(70, 60, 49)).toBe(true);
    expect(shouldRecommendDeload(75, 60, 30)).toBe(true);
  });

  it("returns false when PI >= 70 but adherence >= 50", () => {
    expect(shouldRecommendDeload(70, 60, 50)).toBe(false);
  });

  it("returns false when all conditions are fine", () => {
    expect(shouldRecommendDeload(60, 60, 60, 50)).toBe(false);
  });
});
