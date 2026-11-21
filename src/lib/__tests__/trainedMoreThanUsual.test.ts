/**
 * "You trained more than your usual week" is said only when you did.
 *
 * The band is not evidence of it. `computeLoadBand(pi)` bands the whole
 * score (65% load, 25% recovery, 10% adherence), and a load ratio of 1.0
 * already scores 67, so a week at or under the usual one with recovery and
 * food on track lands in the high band. Measured through the server's own
 * scorer (recomp, 3 lifts and 2 runs, steady weight, 6 days of food on
 * target): 100% of the usual week is PI 79 "high", 90% is 74, 80% is 70,
 * and 75% with a quality run is 71. Each of those read "A strong week. You
 * trained more than your usual week." in the weekly review and "You
 * trained more than your usual week" under Sharpening.
 *
 * The evidence is the week's own figures against the usual week, the
 * engine's ratio inputs (`liftProgression`, `runVolume` are this week's
 * kilos and kilometres over the baseline's): more of at least one, less of
 * neither (`trainedMoreThanUsual`).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  performanceWeekBreakdown,
  trainedMoreThanUsual,
} from "../performanceWeekBreakdown";
import { verdictFor } from "../weeklyReviewViewModel";
import { getLine, getVerbState } from "../performanceLine";
import type {
  Baseline,
  LoadBand,
  PerformanceSignals,
  WeeklyAggregates,
} from "../performanceTypes";

const require = createRequire(import.meta.url);
/* The server's scorer: the weekly rollup persists the score people see. */
const { scorePerformance } = require("../../../functions/lib/perfScoring") as {
  scorePerformance: (
    agg: WeeklyAggregates,
    bl: Baseline & { runQualityCount?: number },
    profile: Record<string, unknown>,
    previousWeekPI: number | null,
    weekBeforePreviousPI: number | null
  ) => {
    performanceIndex: number;
    loadBand: string;
    deloadRecommended: boolean;
    liftProgression: number;
    runVolume: number;
  };
};

const BASELINE: Baseline & { runQualityCount: number } = {
  liftTonnage: 12000,
  liftHardSets: 45,
  runKm: 20,
  runLongKm: 10,
  runQualityCount: 1,
  weeksUsed: 4,
};

const PROFILE = {
  goal: "recomp",
  weeklyWorkoutsTarget: 3,
  weeklyRunsTarget: 2,
  targetCalories: 2500,
  targetProtein: 160,
};

/** 3 lifts and 2 runs at `lift` and `run` times the usual week, with
 *  steady weight and 6 days of food on target. */
function week(lift: number, run: number, qualityRuns = 0): WeeklyAggregates {
  return {
    weekKey: "2026-11-16",
    liftTonnage: BASELINE.liftTonnage * lift,
    liftHardSets: BASELINE.liftHardSets * lift,
    liftSessions: 3,
    runKm: BASELINE.runKm * run,
    runLongKm: BASELINE.runLongKm * run,
    runQualityCount: qualityRuns,
    runSessions: 2,
    mealDaysLogged: 6,
    avgDailyCalories: 2500,
    avgDailyProtein: 160,
    bwCurrent7dAvg: 80,
    bwPrevious7dAvg: 80,
  } as WeeklyAggregates;
}

/** The supporting line's signals as the engine writes them
 *  (`computeSignals`: a ratio counts as ahead above 1.05). */
function signalsFor(scored: {
  liftProgression: number;
  runVolume: number;
}): PerformanceSignals {
  const ahead = (r: number) => (r > 1.05 ? r - 1 : 0);
  return {
    bothLoadsStrong: false,
    liftAheadOfBaseline: ahead(scored.liftProgression),
    runAheadOfBaseline: ahead(scored.runVolume),
    recoveryWeak: false,
    adherenceWeak: false,
    deloadFlag: false,
    lifetimeWeeks: 8,
    daysSinceLastTraining: 1,
  };
}

function read(agg: WeeklyAggregates) {
  const scored = scorePerformance(agg, BASELINE, PROFILE, 70, 70);
  const doc = { aggregates: agg, baseline: BASELINE };
  const trainedMore = trainedMoreThanUsual(doc);
  const state = getVerbState(
    scored.loadBand as LoadBand,
    scored.deloadRecommended
  );
  return {
    pi: scored.performanceIndex,
    band: scored.loadBand,
    trainedMore,
    verdict: verdictFor({
      delta: 0,
      loadBand: scored.loadBand,
      deloadRecommended: scored.deloadRecommended,
      trainedMore,
    }),
    line: getLine(state, signalsFor(scored), { trainedMore }),
  };
}

describe("a high week at or under the usual one (the server's scorer)", () => {
  it.each([
    ["75% with a quality run", 0.75, 1, 71],
    ["80%", 0.8, 0, 70],
    ["90%", 0.9, 0, 74],
    ["100%", 1, 0, 79],
  ])(
    "at %s of the usual week: high, and no claim of more",
    (_name, ratio, quality, pi) => {
      const r = read(week(ratio, ratio, quality));
      // The scenario is real: the band the score lands in is high.
      expect({ pi: r.pi, band: r.band }).toEqual({ pi, band: "high" });
      expect(r.trainedMore).toBe(false);
      expect(r.verdict).toBe("A strong week.");
      expect(r.line).toBe("A strong 7 days");
      expect(`${r.verdict} ${r.line}`).not.toMatch(/more than your usual/);
    }
  );

  it("one discipline up and the other down: high, and no claim of more", () => {
    const r = read(week(1.2, 0.8));
    expect(r.band).toBe("high");
    expect(r.trainedMore).toBe(false);
    expect(r.verdict).toBe("A strong week.");
  });

  it("above the usual week: high, and says so", () => {
    const r = read(week(1.1, 1.1));
    expect({ pi: r.pi, band: r.band }).toEqual({ pi: 83, band: "high" });
    expect(r.trainedMore).toBe(true);
    expect(r.verdict).toBe(
      "A strong week. You trained more than your usual week."
    );
    expect(r.line).toBe("You trained more than your usual week");
  });
});

describe("trainedMoreThanUsual: more of one, less of neither", () => {
  const doc = (
    agg: Partial<WeeklyAggregates>,
    base: Partial<Baseline> = BASELINE
  ) => ({ aggregates: agg, baseline: base });

  it.each([
    ["both under", 11000, 19, false],
    ["both at the usual week", 12000, 20, false],
    ["lifting over, running at", 13000, 20, true],
    ["running over, lifting at", 12000, 22, true],
    ["both over", 13000, 22, true],
    ["lifting over, running under", 15000, 19, false],
    ["lifting over, no running against a usual 20 km", 15000, 0, false],
    // The engine's margin (`computeSignals`: ahead above 1.05).
    ["lifting 4% over, running at", 12500, 20, false],
    ["running at exactly 5% over, lifting at", 12000, 21, false],
    ["running 5.5% over, lifting at", 12000, 21.1, true],
  ])("%s", (_name, tonnage, km, expected) => {
    expect(trainedMoreThanUsual(doc({ liftTonnage: tonnage, runKm: km }))).toBe(
      expected
    );
  });

  /* The stored kilometres are rounded to 0.1 (`aggregateWindow`) and the
     usual week is not, so 20.0 km against a usual 19.975 km drew "20.0
     km" beside "20.0 km" and still claimed more. */
  it("does not call a difference the bars can't show more: 20.0 km against a usual 19.975", () => {
    const d = doc(
      { liftTonnage: 12000, runKm: 20 },
      { ...BASELINE, runKm: 19.975 }
    );
    const running = performanceWeekBreakdown(d, {
      distanceUnit: "km",
      liftUnit: "kg",
      establishing: false,
    }).measures.find((m) => m.key === "running")!;
    expect(running.valueText).toBe("20.0 km");
    expect(running.usualText).toBe("20.0 km");
    expect(trainedMoreThanUsual(d)).toBe(false);
    // Nor a few kilos the tonnage figures round away.
    expect(trainedMoreThanUsual(doc({ liftTonnage: 12040, runKm: 20 }))).toBe(
      false
    );
  });

  it("weighs only what you usually do: a new sport neither adds nor takes away", () => {
    const liftOnly = { ...BASELINE, runKm: 0 };
    // Running for the first time beside the usual lifting is not proof.
    expect(
      trainedMoreThanUsual(doc({ liftTonnage: 12000, runKm: 5 }, liftOnly))
    ).toBe(false);
    expect(
      trainedMoreThanUsual(doc({ liftTonnage: 13000, runKm: 0 }, liftOnly))
    ).toBe(true);
  });

  it("says nothing without a usual week the lead would draw", () => {
    // The bars show the usual week from 2 weeks of it (USUAL_WEEK_MIN_WEEKS).
    expect(
      trainedMoreThanUsual(
        doc({ liftTonnage: 20000, runKm: 40 }, { ...BASELINE, weeksUsed: 1 })
      )
    ).toBe(false);
    expect(trainedMoreThanUsual({})).toBe(false);
    expect(trainedMoreThanUsual({ aggregates: null, baseline: null })).toBe(
      false
    );
  });
});
