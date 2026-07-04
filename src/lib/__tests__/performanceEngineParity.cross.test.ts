/**
 * Cross-consistency test for the TS + JS copies of the Performance Index
 * scoring engine.
 *
 * The single conceptual PI engine has two physical copies: the client
 * `src/lib/performanceEngine.ts` (Home/analytics previews) and the server
 * `functions/lib/perfScoring.js` (the authoritative copy — the weekly rollup
 * persists the PI users actually see). They derive their BASELINE differently
 * by design (client from `priorWeeks[]`, server by aggregating a baseline
 * window), so the parity seam is the *post-baseline* scoring: the pure
 * `scorePerformance(agg, bl, profile, prevPI)` both expose.
 *
 * History: the server copy silently lagged the client's goal-awareness — all
 * four goal branches (recovery bodyweight thresholds, adherence calorie
 * tolerance, lift/run load weighting, default workouts target) were goal-blind
 * server-side, recomputing every cut/bulk user's stored PI wrong. This test
 * runs identical fixtures through both copies across every goal and asserts the
 * scored output is byte-identical. Drift fails CI.
 *
 * The one baseline field with a KNOWN, deliberate derivation difference is
 * `runLongKm` (PERF-L, #1107): the client averages each prior week's longest
 * run (`computeBaseline` — mean of weekly maxes), while the server keeps the
 * single longest run observed across its whole baseline window
 * (`computeBaselineFromAgg` — a max does not scale linearly with window
 * length, so it is exempt from the 28d→7d normalisation the other fields
 * get). The server's baseline is therefore ≥ the client's, so client previews
 * can score `longRatio` slightly hotter than the authoritative rollup. Both
 * are defensible readings of "typical long run"; the discrepancy only shifts
 * 40% of one sub-score and washes out for consistent runners. If it's ever
 * reconciled, prefer changing the CLIENT (the server copy is what users' PI
 * is persisted from).
 *
 * `confidence` is deliberately NOT part of the seam — the client's
 * `computeConfidence` has a `Date.now()` recency check tied to its weekly-keyed
 * model that the server's rolling-window model legitimately omits. Each copy
 * assembles confidence around the shared scored core.
 *
 * Same mirror+parity discipline as `scheduledRunCompletion.cross.test.ts` and
 * `runModeResolution`. If a future refactor adopts a single shared CommonJS
 * source, this test can be deleted in favour of importing it directly.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { scorePerformance as scoreTs } from "../performanceEngine";
import type { WeeklyAggregates, Baseline } from "../performanceTypes";

const require = createRequire(import.meta.url);
const js = require("../../../functions/lib/perfScoring");
const scoreJs = js.scorePerformance as typeof scoreTs;

function makeAgg(overrides: Partial<WeeklyAggregates> = {}): WeeklyAggregates {
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

function makeBl(overrides: Partial<Baseline> = {}): Baseline {
  return {
    liftTonnage: 9000,
    liftHardSets: 36,
    runKm: 22,
    runLongKm: 11,
    weeksUsed: 4,
    ...overrides,
  };
}

type Profile = Parameters<typeof scoreTs>[2];

interface Fixture {
  name: string;
  agg: WeeklyAggregates;
  bl: Baseline;
  profile: Profile;
  prevPI?: number;
}

// Each fixture is engineered to exercise at least one of the four goal-aware
// divergences, so a goal-blind server copy would fail the corresponding case.
const fixtures: Fixture[] = [
  {
    name: "cut — expected 1kg loss, 12% over calories, lift-heavy",
    // recovery: cut rewards the 1kg loss (+20) where recomp gives +10
    // adherence: 12% over is outside cut's ±10% but inside recomp's ±15%
    // weighting: cut weights lift 0.6/run 0.4 vs default 0.5/0.5
    // target default: cut → 3 workouts
    agg: makeAgg({
      bwCurrent7dAvg: 79,
      bwPrevious7dAvg: 80,
      avgDailyCalories: 2240,
    }),
    bl: makeBl(),
    profile: { goal: "cut", targetCalories: 2000, targetProtein: 160 },
    prevPI: 50,
  },
  {
    name: "lean bulk — expected 0.4kg gain, target 5, lift-weighted",
    agg: makeAgg({
      bwCurrent7dAvg: 80.4,
      bwPrevious7dAvg: 80,
      liftSessions: 4,
      runSessions: 1,
    }),
    bl: makeBl(),
    profile: { goal: "lean bulk", targetCalories: 2800, targetProtein: 180 },
  },
  {
    name: "recomp — stable weight, default weighting",
    agg: makeAgg(),
    bl: makeBl(),
    profile: { goal: "recomp", targetCalories: 2500, targetProtein: 170 },
  },
  {
    name: "undefined goal — falls through to symmetric branch",
    agg: makeAgg({ bwCurrent7dAvg: 79.6, bwPrevious7dAvg: 80 }),
    bl: makeBl(),
    profile: { targetCalories: 2400, targetProtein: 150 },
  },
  {
    name: "explicit weeklyWorkoutsTarget overrides goal default",
    agg: makeAgg({ liftSessions: 2, runSessions: 0 }),
    bl: makeBl(),
    profile: {
      goal: "cut",
      weeklyWorkoutsTarget: 6,
      targetCalories: 2000,
      targetProtein: 160,
    },
  },
  {
    name: "cold-start — empty agg, zero baseline, deload gated off",
    agg: makeAgg({
      liftTonnage: 0,
      liftHardSets: 0,
      liftSessions: 0,
      runKm: 0,
      runLongKm: 0,
      runQualityCount: 0,
      runSessions: 0,
      mealDaysLogged: 0,
      avgDailyCalories: 0,
      avgDailyProtein: 0,
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
    }),
    bl: makeBl({
      liftTonnage: 0,
      liftHardSets: 0,
      runKm: 0,
      runLongKm: 0,
      weeksUsed: 0,
    }),
    profile: { goal: "cut" },
  },
  {
    name: "overreach — very high load, sustained, deload trigger",
    agg: makeAgg({
      liftTonnage: 40000,
      liftHardSets: 90,
      runKm: 80,
      runLongKm: 30,
      runSessions: 6,
      liftSessions: 5,
    }),
    bl: makeBl(),
    profile: { goal: "lean bulk", targetCalories: 3000, targetProtein: 190 },
    prevPI: 90,
  },
  {
    name: "high load + poor adherence (deload via adherence path)",
    agg: makeAgg({
      liftTonnage: 20000,
      liftHardSets: 60,
      mealDaysLogged: 5,
      avgDailyCalories: 1200,
      liftSessions: 1,
      runSessions: 0,
    }),
    bl: makeBl(),
    profile: { goal: "recomp", targetCalories: 2600, targetProtein: 170 },
  },
];

describe("Performance Index scoring — client (.ts) ↔ server (.js) parity", () => {
  it("exposes scorePerformance on both copies", () => {
    expect(typeof scoreTs).toBe("function");
    expect(typeof scoreJs).toBe("function");
  });

  for (const f of fixtures) {
    it(`produces byte-identical scored output: ${f.name}`, () => {
      const tsOut = scoreTs(f.agg, f.bl, f.profile, f.prevPI);
      const jsOut = scoreJs(f.agg, f.bl, f.profile, f.prevPI);
      expect(jsOut).toEqual(tsOut);
    });
  }

  // The whole point of the fix: with a cut goal the scored PI must differ from
  // a goal-blind (undefined) scoring of the same week. If this ever collapses
  // to equality, the goal-awareness has been lost on one side.
  it("goal materially changes the score (guards against goal-blind regression)", () => {
    const agg = makeAgg({
      bwCurrent7dAvg: 79,
      bwPrevious7dAvg: 80,
      avgDailyCalories: 2240,
    });
    const bl = makeBl();
    const cut = scoreJs(agg, bl, { goal: "cut", targetCalories: 2000 }, 50);
    const blind = scoreJs(agg, bl, { targetCalories: 2000 }, 50);
    expect(cut.performanceIndex).not.toBe(blind.performanceIndex);
  });
});
