/**
 * Goal-aware scoring tests for the SERVER copy (functions/lib/perfScoring.js) —
 * the authoritative PI engine that the weekly rollup persists.
 *
 * The cross-copy parity test (src/lib/__tests__/performanceEngineParity.cross.test.ts)
 * pins this copy equal to the client; these tests pin the goal behaviour on the
 * running copy directly, so the four branches that historically drifted
 * goal-blind here stay covered even independent of the client suite. perfScoring
 * is admin-free, so no admin init is needed.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeRecoveryScore,
  computeAdherenceScore,
  scorePerformance,
} = require("../lib/perfScoring");

function makeAgg(overrides = {}) {
  return {
    weekKey: "2026-05-17",
    liftTonnage: 10000,
    liftHardSets: 40,
    liftSessions: 3,
    runKm: 25,
    runLongKm: 12,
    runQualityCount: 1,
    runSessions: 3,
    mealDaysLogged: 5,
    avgDailyCalories: 2200,
    avgDailyProtein: 160,
    bwCurrent7dAvg: 80,
    bwPrevious7dAvg: 80,
    ...overrides,
  };
}

function makeBl(overrides = {}) {
  return {
    liftTonnage: 9000,
    liftHardSets: 36,
    runKm: 22,
    runLongKm: 11,
    weeksUsed: 4,
    ...overrides,
  };
}

describe("perfScoring.computeRecoveryScore — goal-aware (M2)", () => {
  it("rewards expected weight loss on a cut", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 79,
      bwPrevious7dAvg: 80,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg, "cut")).toBe(80); // expected 1kg loss → +20
    expect(computeRecoveryScore(agg, "recomp")).toBe(70); // 1kg delta → +10 under symmetric
  });

  it("penalizes excessive weight loss even on a cut", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 77,
      bwPrevious7dAvg: 80,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg, "cut")).toBe(45); // 3kg loss → -15
  });

  it("rewards expected weight gain on a lean bulk", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 80.4,
      bwPrevious7dAvg: 80,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg, "lean bulk")).toBe(80); // 0.4kg gain → +20
  });

  it("no goal falls through to the symmetric branch (legacy server behaviour)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 79,
      bwPrevious7dAvg: 80,
      mealDaysLogged: 0,
      liftSessions: 0,
      runSessions: 0,
    });
    expect(computeRecoveryScore(agg)).toBe(70); // 1kg delta → +10, no goal asymmetry
  });
});

describe("perfScoring.computeAdherenceScore — goal-aware calorie tolerance (M5)", () => {
  it("uses tighter ±10% for cuts", () => {
    const agg = makeAgg({
      liftSessions: 0,
      runSessions: 0,
      mealDaysLogged: 5,
      avgDailyCalories: 2300,
    });
    // 2300/2000 = 1.15 → outside cut's ±10%, inside recomp's ±15%
    expect(computeAdherenceScore(agg, 0, 2000, null, "recomp")).toBe(100);
    expect(computeAdherenceScore(agg, 0, 2000, null, "cut")).toBeLessThan(100);
  });

  it("no goal uses the looser ±15% (legacy server behaviour)", () => {
    const agg = makeAgg({
      liftSessions: 0,
      runSessions: 0,
      mealDaysLogged: 5,
      avgDailyCalories: 2300,
    });
    expect(computeAdherenceScore(agg, 0, 2000, null)).toBe(100);
  });
});

describe("perfScoring.scorePerformance — goal-aware composition", () => {
  it("weights lifting higher on a lean bulk than recomp (M3)", () => {
    const agg = makeAgg({
      liftTonnage: 15000,
      liftHardSets: 30,
      runKm: 10,
      runLongKm: 5,
      runSessions: 1,
    });
    const bl = makeBl();
    const bulk = scorePerformance(agg, bl, { goal: "lean bulk" });
    const recomp = scorePerformance(agg, bl, { goal: "recomp" });
    expect(bulk.performanceIndex).toBeGreaterThanOrEqual(
      recomp.performanceIndex
    );
  });

  it("uses goal-aware default workout target (L6): cut=3, bulk=5", () => {
    const agg = makeAgg({ liftSessions: 3, runSessions: 0 });
    const bl = makeBl();
    const cut = scorePerformance(agg, bl, { goal: "cut" }); // 3/3 = 100%
    const bulk = scorePerformance(agg, bl, { goal: "lean bulk" }); // 3/5 = 60%
    expect(cut.adherenceScore).toBeGreaterThan(bulk.adherenceScore);
  });

  it("explicit weeklyWorkoutsTarget overrides the goal default", () => {
    const agg = makeAgg({ liftSessions: 3, runSessions: 0 });
    const bl = makeBl();
    const a = scorePerformance(agg, bl, {
      goal: "cut",
      weeklyWorkoutsTarget: 6,
    });
    const b = scorePerformance(agg, bl, {
      goal: "lean bulk",
      weeklyWorkoutsTarget: 6,
    });
    // Same explicit target → identical adherence regardless of goal default
    expect(a.adherenceScore).toBe(b.adherenceScore);
  });

  it("suppresses deload when baseline has <3 weeks", () => {
    const agg = makeAgg({ liftTonnage: 40000, liftHardSets: 90 });
    const bl = makeBl({ weeksUsed: 2 });
    const doc = scorePerformance(agg, bl, { goal: "recomp" }, 90);
    expect(doc.deloadRecommended).toBe(false);
  });

  it("omits confidence (model-specific, assembled by the caller)", () => {
    const doc = scorePerformance(makeAgg(), makeBl(), { goal: "cut" });
    expect(doc).not.toHaveProperty("confidence");
    expect(doc).toHaveProperty("insight");
    expect(doc).toHaveProperty("planAdjustments");
  });
});
