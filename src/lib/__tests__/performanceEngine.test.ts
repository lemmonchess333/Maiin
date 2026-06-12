import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  getWeekKey,
  weekKeyMinusN,
  computeBaseline,
  computeLiftLoadScore,
  computeRunLoadScore,
  computeRecoveryScore,
  computeAdherenceScore,
  computePerformanceIndex,
  computeLoadBand,
  shouldRecommendDeload,
  generatePlanAdjustments,
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

// ── UTC/local drift pin (regression) ─────────
//
// The vitest runner is pinned to UTC, so an in-process assertion can't
// observe the negative-offset drift these functions previously had
// (local Sunday-rewind + UTC toISOString → previous Saturday key). We
// re-exec a tiny script under TZ=America/New_York (UTC-5) to prove the
// fix: a Sunday 23:30 LOCAL must key to that local Sunday, not the
// UTC-rolled Monday.
describe("getWeekKey / weekKeyMinusN — UTC/local drift", () => {
  it("getWeekKey keys a late-Sunday-night local time to the local Sunday under a negative-offset TZ", () => {
    const tsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
    const enginePath = path.resolve(__dirname, "../performanceEngine.ts");
    // Actually import + call the REAL exported functions under TZ=America/
    // New_York (UTC-5). Sun 2025-01-05 23:30 local NY = 2025-01-06 04:30Z.
    // Pre-fix (local Sunday-rewind + UTC toISOString) this drifted to the
    // previous Saturday 2025-01-04; the fix must return the local Sunday.
    const script = `
      import { getWeekKey, weekKeyMinusN } from ${JSON.stringify(enginePath)};
      const d = new Date(2025, 0, 5, 23, 30, 0); // local Sun 23:30
      process.stdout.write(JSON.stringify({
        weekKey: getWeekKey(d),
        minus1: weekKeyMinusN(getWeekKey(d), 1),
      }));
    `;
    const out = execFileSync(tsx, ["--eval", script], {
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
    });
    const result = JSON.parse(out.trim().split("\n").pop() as string);
    expect(result.weekKey).toBe("2025-01-05"); // local Sunday, not 2025-01-04
    expect(result.minus1).toBe("2024-12-29"); // prior local Sunday, no UTC drift
  });
});

// ── computeBaseline ──────────────────────────

describe("computeBaseline", () => {
  it("averages prior weeks correctly", () => {
    const weeks: WeeklyAggregates[] = [
      makeAgg({
        liftTonnage: 8000,
        liftHardSets: 16,
        runKm: 20,
        runLongKm: 8,
        liftSessions: 3,
        runSessions: 2,
      }),
      makeAgg({
        liftTonnage: 12000,
        liftHardSets: 24,
        runKm: 30,
        runLongKm: 12,
        liftSessions: 4,
        runSessions: 3,
      }),
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
      makeAgg({
        liftTonnage: 0,
        liftHardSets: 0,
        runKm: 0,
        runLongKm: 0,
        liftSessions: 0,
        runSessions: 0,
      }),
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

  it("handles zero baseline with non-zero current (safeRatio returns 1.0)", () => {
    const agg = makeAgg({
      liftTonnage: 5000,
      liftHardSets: 10,
      liftSessions: 2,
    });
    const bl = makeBaseline({ liftTonnage: 0, liftHardSets: 0 });
    // safeRatio returns 1.0 for both → raw = 1.0 → clamp(1.0*67) = 67
    expect(computeLiftLoadScore(agg, bl)).toBe(67);
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

  it("returns true for sustained overreach (two weeks >= 85)", () => {
    expect(shouldRecommendDeload(85, 60, 60, 85)).toBe(true);
    expect(shouldRecommendDeload(90, 60, 60, 90)).toBe(true);
  });

  it("returns false for sustained high but below 85", () => {
    // PI 75-84 for two weeks should NOT trigger deload anymore (raised threshold)
    expect(shouldRecommendDeload(75, 60, 60, 75)).toBe(false);
    expect(shouldRecommendDeload(80, 60, 60, 80)).toBe(false);
  });

  it("returns false if only current week is high but previous is not", () => {
    expect(shouldRecommendDeload(85, 60, 60, 60)).toBe(false);
  });

  it("returns false if previous week PI is undefined", () => {
    expect(shouldRecommendDeload(85, 60, 60, undefined)).toBe(false);
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

// ── computeAdherenceScore ──────────────────

describe("computeAdherenceScore", () => {
  it("returns 50 when no targets or data available", () => {
    const agg = makeAgg({
      liftSessions: 0,
      runSessions: 0,
      mealDaysLogged: 0,
      avgDailyCalories: 0,
      avgDailyProtein: 0,
    });
    expect(computeAdherenceScore(agg, 0, null, null)).toBe(50);
  });

  it("scores workout adherence when target > 0", () => {
    const agg = makeAgg({ liftSessions: 3, runSessions: 1 });
    const score = computeAdherenceScore(agg, 4, null, null);
    // 4/4 = 1.0 ratio → 100
    expect(score).toBe(100);
  });

  it("caps workout ratio at 1.2", () => {
    const agg = makeAgg({ liftSessions: 5, runSessions: 3 });
    // 8/4 = 2.0, capped to 1.2 → 120, but only workout factor → 100 clamped
    expect(computeAdherenceScore(agg, 4, null, null)).toBe(100);
  });

  it("handles null calorie and protein targets gracefully", () => {
    const agg = makeAgg();
    const score = computeAdherenceScore(agg, 4, null, null);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── computePerformanceIndex ────────────────

describe("computePerformanceIndex", () => {
  it("returns valid doc for all-zero aggregates", () => {
    const zeroAgg = makeAgg({
      liftTonnage: 0,
      liftHardSets: 0,
      liftSessions: 0,
      runKm: 0,
      runLongKm: 0,
      runSessions: 0,
      runQualityCount: 0,
      mealDaysLogged: 0,
      avgDailyCalories: 0,
      avgDailyProtein: 0,
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
    });
    const doc = computePerformanceIndex(zeroAgg, [], {});
    expect(doc.performanceIndex).toBeGreaterThanOrEqual(0);
    expect(doc.performanceIndex).toBeLessThanOrEqual(100);
    expect(doc.confidence).toBe("low");
  });

  it("returns valid doc with no prior weeks", () => {
    const agg = makeAgg();
    const doc = computePerformanceIndex(agg, [], { weeklyWorkoutsTarget: 4 });
    expect(doc.performanceIndex).toBeGreaterThanOrEqual(0);
    expect(doc.insight.title).toBeDefined();
    expect(doc.insight.bullets.length).toBeGreaterThan(0);
  });

  it("does not recommend deload when baseline has <3 weeks (M6)", () => {
    const agg = makeAgg({ liftTonnage: 30000, liftHardSets: 50 }); // very high load
    const priorWeeks = [makeAgg(), makeAgg()]; // only 2 weeks of baseline
    const doc = computePerformanceIndex(
      agg,
      priorWeeks,
      { weeklyWorkoutsTarget: 4 },
      90
    );
    expect(doc.baseline.weeksUsed).toBe(2);
    expect(doc.deloadRecommended).toBe(false); // insufficient baseline
  });

  it("uses goal-dependent lift/run weights (M3)", () => {
    const agg = makeAgg({
      liftTonnage: 15000,
      liftHardSets: 30,
      runKm: 10,
      runLongKm: 5,
      runSessions: 1,
    });
    const priorWeeks = [makeAgg(), makeAgg(), makeAgg()];
    const bulkDoc = computePerformanceIndex(agg, priorWeeks, {
      goal: "lean bulk",
    });
    const recompDoc = computePerformanceIndex(agg, priorWeeks, {
      goal: "recomp",
    });
    // Lean bulk weights lifting higher (0.65 vs 0.5), so with higher lift and lower run,
    // the bulk PI should be higher than recomp PI
    expect(bulkDoc.performanceIndex).toBeGreaterThanOrEqual(
      recompDoc.performanceIndex
    );
  });

  it("uses goal-aware default workout target (L6)", () => {
    const agg = makeAgg({ liftSessions: 3, runSessions: 0 });
    const priorWeeks = [makeAgg(), makeAgg(), makeAgg()];
    // Cut default = 3 sessions, so 3/3 = 100% adherence
    const cutDoc = computePerformanceIndex(agg, priorWeeks, { goal: "cut" });
    // Bulk default = 5 sessions, so 3/5 = 60% adherence
    const bulkDoc = computePerformanceIndex(agg, priorWeeks, {
      goal: "lean bulk",
    });
    expect(cutDoc.adherenceScore).toBeGreaterThan(bulkDoc.adherenceScore);
  });
});

// ── Goal-aware recovery scoring (M2) ────────

describe("computeRecoveryScore — goal-aware", () => {
  it("rewards expected weight loss on a cut", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 79,
      bwPrevious7dAvg: 80, // lost 1kg
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    // Cut: 1kg loss is expected → +20
    expect(computeRecoveryScore(agg, "cut")).toBe(80);
    // Recomp: 1kg delta is moderate → +10
    expect(computeRecoveryScore(agg, "recomp")).toBe(70);
  });

  it("penalizes excessive weight loss even on cut", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 77,
      bwPrevious7dAvg: 80, // lost 3kg — too fast
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg, "cut")).toBe(45); // 60 - 15
  });

  it("rewards expected weight gain on lean bulk", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80.4,
      bwPrevious7dAvg: 80, // gained 0.4kg
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    // Bulk: 0.4kg gain is expected → +20
    expect(computeRecoveryScore(agg, "lean bulk")).toBe(80);
    // Recomp: 0.4kg delta is stable → +20
    expect(computeRecoveryScore(agg, "recomp")).toBe(80);
  });
});

// ── Goal-aware calorie adherence (M5) ───────

describe("computeAdherenceScore — goal-aware calorie tolerance", () => {
  it("uses ±10% for cuts (tighter)", () => {
    const agg = makeAgg({
      liftSessions: 0,
      runSessions: 0,
      mealDaysLogged: 5,
      avgDailyCalories: 2300,
    });
    // 2300/2000 = 1.15 → 15% over target
    // Cut tolerance = 10% → 1.15 is outside [0.9, 1.1] → penalized
    const cutScore = computeAdherenceScore(agg, 0, 2000, null, "cut");
    // Recomp tolerance = 15% → 1.15 is inside [0.85, 1.15] → full marks
    const recompScore = computeAdherenceScore(agg, 0, 2000, null, "recomp");
    expect(recompScore).toBe(100);
    expect(cutScore).toBeLessThan(100);
  });
});

// ── Multi-week integration ────────────────────
// The unit blocks above pin each component score in isolation. These drive
// the whole pipeline (baseline → component scores → PI → load band → deload
// gate) across several weeks, which is where the integration-only logic lives
// — most importantly the baseline-sufficiency gate inside
// computePerformanceIndex (deload is suppressed until weeksUsed >= 3) and the
// sustained-overreach deload trigger.

describe("computePerformanceIndex — multi-week integration", () => {
  const profile = {
    weeklyWorkoutsTarget: 4,
    targetCalories: 2500,
    targetProtein: 160,
    goal: "recomp",
  };

  // n weeks at the makeAgg defaults (tonnage 10000, runKm 25, …) form the
  // baseline the current week is scored against.
  const baselineWeeks = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeAgg({ weekKey: weekKeyMinusN("2025-02-02", i + 1) })
    );

  // ~1.6x the baseline on both load axes with healthy recovery/adherence —
  // lands deep in overreach.
  const strongWeek = makeAgg({
    weekKey: "2025-02-02",
    liftTonnage: 16000,
    runKm: 40,
    runQualityCount: 2,
    liftSessions: 4,
    runSessions: 3,
    mealDaysLogged: 6,
  });

  it("a high-load week reads as high PI in the overreach band", () => {
    const doc = computePerformanceIndex(strongWeek, baselineWeeks(4), profile);
    expect(doc.performanceIndex).toBeGreaterThanOrEqual(85);
    expect(doc.loadBand).toBe("overreach");
    expect(doc.liftProgression).toBeGreaterThan(1);
  });

  it("recommends a deload after two consecutive overreach weeks (baseline sufficient)", () => {
    const doc = computePerformanceIndex(
      strongWeek,
      baselineWeeks(4),
      profile,
      /* previousWeekPI */ 90
    );
    expect(doc.performanceIndex).toBeGreaterThanOrEqual(85);
    expect(doc.deloadRecommended).toBe(true);
    expect(doc.insight.title).toBe("Momentum: High");
  });

  it("suppresses the deload recommendation when the baseline is < 3 weeks", () => {
    // Identical overreach + previousWeekPI, but only 2 prior weeks — the
    // score is statistically unreliable, so the gate forces deload off.
    const doc = computePerformanceIndex(
      strongWeek,
      baselineWeeks(2),
      profile,
      90
    );
    expect(doc.baseline.weeksUsed).toBeLessThan(3);
    expect(doc.deloadRecommended).toBe(false);
  });

  it("a recovery/deload week reads as low momentum without itself triggering a deload", () => {
    const recoveryWeek = makeAgg({
      weekKey: "2025-02-02",
      liftTonnage: 3000,
      liftHardSets: 6,
      liftSessions: 1,
      runKm: 5,
      runLongKm: 3,
      runQualityCount: 0,
      runSessions: 1,
    });
    const strong = computePerformanceIndex(
      strongWeek,
      baselineWeeks(4),
      profile,
      90
    );
    const doc = computePerformanceIndex(
      recoveryWeek,
      baselineWeeks(4),
      profile,
      strong.performanceIndex
    );
    expect(doc.performanceIndex).toBeLessThan(strong.performanceIndex);
    expect(["deload", "low", "moderate"]).toContain(doc.loadBand);
    expect(doc.deloadRecommended).toBe(false);
  });

  it("threads the computed baseline + raw aggregates through to the doc", () => {
    const doc = computePerformanceIndex(strongWeek, baselineWeeks(4), profile);
    expect(doc.baseline.weeksUsed).toBe(4);
    expect(doc.aggregates).toEqual(strongWeek);
    expect(doc.weekKey).toBe(strongWeek.weekKey);
    // 4 signals (lift + run + meals + baseline≥3) → high confidence.
    expect(doc.confidence).toBe("high");
  });
});

// ── generatePlanAdjustments ──────────────────
// Pure mapping of (loadBand, scores, deload flag) → user-facing lift/run advice.
// Previously untested despite driving the Performance tab's coaching copy.

describe("generatePlanAdjustments", () => {
  const base = {
    loadBand: "moderate" as const,
    liftLoadScore: 50,
    runLoadScore: 50,
    recoveryScore: 50,
    deloadRecommended: false,
  };

  it("deload recommendation overrides everything and returns the deload advice", () => {
    // Even with an overreach band, deload takes precedence (early return).
    const adj = generatePlanAdjustments({
      ...base,
      loadBand: "overreach",
      deloadRecommended: true,
    });
    expect(adj.lift).toHaveLength(1);
    expect(adj.lift[0]).toMatch(/reduce working sets/i);
    expect(adj.run[0]).toMatch(/easy pace|active recovery/i);
  });

  it("overreach band (no deload) advises trimming volume, not intensity", () => {
    const adj = generatePlanAdjustments({ ...base, loadBand: "overreach" });
    expect(adj.lift[0]).toMatch(/reducing total volume/i);
    expect(adj.run[0]).toMatch(/drop one mid-week/i);
  });

  it("low band with weak scores nudges progressive overload + aerobic base", () => {
    const adj = generatePlanAdjustments({
      ...base,
      loadBand: "low",
      liftLoadScore: 20,
      runLoadScore: 20,
    });
    expect(adj.lift[0]).toMatch(/progressive overload/i);
    expect(adj.run[0]).toMatch(/aerobic base/i);
  });

  it("low band with healthy scores (>=30) gives no nudges", () => {
    const adj = generatePlanAdjustments({
      ...base,
      loadBand: "low",
      liftLoadScore: 40,
      runLoadScore: 40,
    });
    expect(adj).toEqual({ lift: [], run: [] });
  });

  it("the 'deload' band (distinct from the deload RECOMMENDATION) also nudges weak lifts", () => {
    const adj = generatePlanAdjustments({
      ...base,
      loadBand: "deload",
      liftLoadScore: 10,
      runLoadScore: 50, // healthy run → no run nudge
    });
    expect(adj.lift[0]).toMatch(/progressive overload/i);
    expect(adj.run).toEqual([]);
  });

  it("moderate/high bands with healthy scores produce no advice", () => {
    expect(generatePlanAdjustments({ ...base, loadBand: "moderate" })).toEqual({
      lift: [],
      run: [],
    });
    expect(generatePlanAdjustments({ ...base, loadBand: "high" })).toEqual({
      lift: [],
      run: [],
    });
  });
});
