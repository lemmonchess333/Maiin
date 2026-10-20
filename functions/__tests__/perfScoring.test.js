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
  generatePlanAdjustments,
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

  // Adherence counts lifts and runs together, so it is scored against the
  // lift days plus the run days planned. Each expected value is worked by
  // hand: with no calorie or protein target the sessions factor is the only
  // one, so adherence = round(min(done / planned, 1.2) * 100), capped at 100.
  describe("the sessions target is lift days plus run days", () => {
    const onlySessions = (liftSessions, runSessions) =>
      makeAgg({ liftSessions, runSessions, mealDaysLogged: 0 });

    it("a runner who plans no lifts and runs every planned run scores 100", () => {
      // Was 60: weeklyWorkoutsTarget 0 read as "unset" and the bulk default 5 stood in (3/5).
      const doc = scorePerformance(onlySessions(0, 3), makeBl(), {
        goal: "lean bulk",
        weeklyWorkoutsTarget: 0,
        weeklyRunDaysTarget: 3,
      });
      expect(doc.adherenceScore).toBe(100);
    });

    it("a hybrid who skips every lift is scored against the whole week", () => {
      // 4 lifts + 3 runs planned, 4 runs done: 4/7 = 57. Was 100 (4 runs against 4 lifts).
      const doc = scorePerformance(onlySessions(0, 4), makeBl(), {
        goal: "recomp",
        weeklyWorkoutsTarget: 4,
        weeklyRunDaysTarget: 3,
      });
      expect(doc.adherenceScore).toBe(57);
    });

    it("reads the legacy weeklyRunsTarget when the new field is absent", () => {
      // 4 + 2 planned, 3 lifts done: 3/6 = 50.
      const doc = scorePerformance(onlySessions(3, 0), makeBl(), {
        goal: "recomp",
        weeklyWorkoutsTarget: 4,
        weeklyRunsTarget: 2,
      });
      expect(doc.adherenceScore).toBe(50);
    });

    it("an explicit 0 run days wins over the legacy field", () => {
      // 4 + 0 planned, 3 lifts done: 3/4 = 75 (75 too would be the default 4; use a cut, default 3).
      const doc = scorePerformance(onlySessions(3, 0), makeBl(), {
        goal: "cut",
        weeklyWorkoutsTarget: 4,
        weeklyRunDaysTarget: 0,
        weeklyRunsTarget: 3,
      });
      expect(doc.adherenceScore).toBe(75);
    });

    it("falls back to the goal's default only when nothing is planned", () => {
      // Freeform runner, 0 + 0 planned: the cut default 3, 2 runs done = 67.
      const doc = scorePerformance(onlySessions(0, 2), makeBl(), {
        goal: "cut",
        weeklyWorkoutsTarget: 0,
        weeklyRunDaysTarget: 0,
      });
      expect(doc.adherenceScore).toBe(67);
    });

    it("ignores a target that is not a finite number", () => {
      // A string would concatenate ("4" + 3 = "43"); it counts as unplanned.
      const doc = scorePerformance(onlySessions(3, 0), makeBl(), {
        goal: "cut",
        weeklyWorkoutsTarget: "4",
        weeklyRunDaysTarget: Number.NaN,
      });
      expect(doc.adherenceScore).toBe(100);
    });
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

  it("stores no lifting suggestions, and an empty list for older apps", () => {
    // Lift4 (3): no lifting suggestion cards. Older apps read
    // `planAdjustments.lift.length`, so the list stays, empty.
    const weeks = [
      {
        loadBand: "moderate",
        liftLoadScore: 50,
        runLoadScore: 50,
        deloadRecommended: true,
      },
      {
        loadBand: "overreach",
        liftLoadScore: 50,
        runLoadScore: 50,
        deloadRecommended: false,
      },
      {
        loadBand: "low",
        liftLoadScore: 10,
        runLoadScore: 10,
        deloadRecommended: false,
      },
    ];
    for (const week of weeks) {
      const adj = generatePlanAdjustments(week);
      expect(adj.lift).toEqual([]);
      expect(adj.run).toHaveLength(1);
    }
  });
});

describe("perfScoring.generatePlanAdjustments — the run suggestion's words", () => {
  it("asks for an easy run in plain words (Run21 (2): no physiology names)", () => {
    const adj = generatePlanAdjustments({
      loadBand: "low",
      liftLoadScore: 20,
      runLoadScore: 20,
      deloadRecommended: false,
    });
    expect(adj.run).toEqual([
      "Add one easy 20-minute run to build your running back up.",
    ]);
  });
});
