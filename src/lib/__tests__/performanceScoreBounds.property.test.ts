/**
 * Property-based guard for the performance-engine SCORE BOUNDS invariant.
 *
 * Every load/recovery/adherence score and the composite Performance Index must
 * stay within [0, 100] — the semicircle gauge and the load-band labels
 * ("Peak"/"Building"/…) assume it. An unbounded edge (a huge tonnage ratio, a
 * zero baseline, a negative-trending bodyweight) producing >100 or <0 would
 * mis-render the gauge or mislabel the band. Example tests assert a few cases;
 * this fuzzes ~4000 random weeks (including extremes + zero baselines) and
 * asserts the bound holds for ALL of them.
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  computeLiftLoadScore,
  computeRunLoadScore,
  computeRecoveryScore,
  computeAdherenceScore,
  computePerformanceIndex,
} from "../performanceEngine";
import type { WeeklyAggregates, Baseline } from "../performanceTypes";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value in [0, max], with ~10% chance of being exactly 0 (stress the
 *  zero-session / zero-baseline guards). */
const num = (rnd: () => number, max: number) =>
  rnd() < 0.1 ? 0 : Math.round(rnd() * max);

function genAgg(rnd: () => number, weekKey = "2026-01-04"): WeeklyAggregates {
  const bw = 50 + rnd() * 60;
  return {
    weekKey,
    liftTonnage: num(rnd, 60000),
    liftHardSets: num(rnd, 120),
    liftSessions: num(rnd, 7),
    runKm: num(rnd, 200),
    runLongKm: num(rnd, 60),
    runQualityCount: num(rnd, 5),
    runSessions: num(rnd, 7),
    mealDaysLogged: num(rnd, 7),
    avgDailyCalories: num(rnd, 5000),
    avgDailyProtein: num(rnd, 300),
    bwCurrent7dAvg: bw,
    // Sometimes a big swing → stresses the recovery bodyweight-stability proxy.
    bwPrevious7dAvg: bw + (rnd() - 0.5) * 8,
  };
}

function genBaseline(rnd: () => number): Baseline {
  return {
    liftTonnage: num(rnd, 60000),
    liftHardSets: num(rnd, 120),
    runKm: num(rnd, 200),
    runLongKm: num(rnd, 60),
    weeksUsed: 1 + Math.floor(rnd() * 4),
  };
}

const inRange = (x: number) => x >= 0 && x <= 100;

describe("performance score bounds (property-based)", () => {
  it("every individual score stays within [0, 100] for any week × baseline", () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 4000; i++) {
      const agg = genAgg(rnd);
      const bl = genBaseline(rnd);
      const goal = ["cut", "lean bulk", "recomp"][Math.floor(rnd() * 3)];

      expect(inRange(computeLiftLoadScore(agg, bl)), "lift").toBe(true);
      expect(inRange(computeRunLoadScore(agg, bl)), "run").toBe(true);
      expect(inRange(computeRecoveryScore(agg, goal)), "recovery").toBe(true);
      expect(
        inRange(
          computeAdherenceScore(
            agg,
            1 + Math.floor(rnd() * 7),
            rnd() < 0.5 ? null : num(rnd, 4000),
            rnd() < 0.5 ? null : num(rnd, 250),
            goal
          )
        ),
        "adherence"
      ).toBe(true);
    }
  });

  it("the composite Performance Index + its breakdown scores stay within [0, 100]", () => {
    const rnd = mulberry32(8);
    for (let i = 0; i < 2000; i++) {
      const current = genAgg(rnd, "2026-02-01");
      const priors = Array.from({ length: Math.floor(rnd() * 5) }, (_, k) =>
        genAgg(rnd, `2026-01-${String(4 + k).padStart(2, "0")}`)
      );
      const doc = computePerformanceIndex(current, priors, {
        weeklyWorkoutsTarget: 1 + Math.floor(rnd() * 7),
        targetCalories: rnd() < 0.5 ? null : num(rnd, 4000),
        targetProtein: rnd() < 0.5 ? null : num(rnd, 250),
        goal: ["cut", "lean bulk", "recomp"][Math.floor(rnd() * 3)],
      });

      expect(inRange(doc.performanceIndex), "PI").toBe(true);
      expect(inRange(doc.liftLoadScore)).toBe(true);
      expect(inRange(doc.runLoadScore)).toBe(true);
      expect(inRange(doc.recoveryScore)).toBe(true);
      expect(inRange(doc.adherenceScore)).toBe(true);
    }
  });
});
