/**
 * The lead's line under Backing off and Steady says what happened in the 7
 * days, read through the server's own scorer and signals.
 *
 * Two lines said something false for some weeks (#3460's "listed, not
 * changed"):
 *
 *   - Backing off said "You trained more than your usual week" whenever
 *     recovery wasn't weak. The deload flag also fires on adherence
 *     (`shouldRecommendDeload`: 70 or more with adherence under 50), so
 *     a week at exactly the usual one with food far off target is flagged
 *     and read "more".
 *   - Steady said "Fewer sessions than usual" whenever adherence was weak.
 *     Adherence is the sessions against the plan and the food against its
 *     targets, averaged (`computeAdherenceScore`); the usual week's session
 *     count is in neither. Every planned session done with food far off
 *     read "Fewer sessions than usual".
 *
 * Each week here is scored by `functions/lib/perfScoring.js` and given its
 * signals by `functions/performanceEngine.js`'s `computeSignals`, the copy
 * the weekly rollup and the daily refresh write, and every line is checked
 * against the week's own figures.
 */
import { describe, it, expect } from "vitest";
import Module, { createRequire } from "node:module";
import { getLine, getVerbState } from "../performanceLine";
import {
  leadEvidence,
  trainedMoreThanUsual,
} from "../performanceWeekBreakdown";
import { plannedSessionCount } from "../performanceEngine";
import {
  resolveDeloadRecommended,
  resolveLoadBand,
} from "../performanceDocFields";
import type {
  Baseline,
  PerformanceSignals,
  WeeklyAggregates,
} from "../performanceTypes";

const require = createRequire(import.meta.url);

/* The server's scorer: pure, so it loads as it is. */
const perfScoring = require("../../../functions/lib/perfScoring") as {
  scorePerformance: (
    agg: WeeklyAggregates,
    bl: Baseline,
    profile: Record<string, unknown>,
    previousWeekPI: number | null,
    weekBeforePreviousPI: number | null
  ) => {
    performanceIndex: number;
    loadBand: string;
    deloadRecommended: boolean;
    liftLoadScore: number;
    runLoadScore: number;
    recoveryScore: number;
    adherenceScore: number;
    liftProgression: number;
    runVolume: number;
  };
  computeAdherenceScore: (
    agg: WeeklyAggregates,
    targetWorkouts: number,
    targetCalories: number | null,
    targetProtein: number | null,
    goal: string
  ) => number;
  weeklySessionTarget: (profile: Record<string, unknown>) => number;
};

/* `computeSignals` lives in the engine, which calls `admin.firestore()` at
   module load: the specifier stub `performanceBaselineParity.cross.test.ts`
   uses covers that load and nothing `computeSignals` reads. */
type Loader = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const loaderHost = Module as unknown as { _load: Loader };
const realLoad = loaderHost._load;
loaderHost._load = function (request, ...rest) {
  if (request === "./lib/adminSdk") {
    const firestore = () => ({});
    firestore.Timestamp = { fromDate: (d: Date) => d };
    firestore.FieldValue = { serverTimestamp: () => null };
    return { firestore };
  }
  if (request === "firebase-functions/v1" || request === "firebase-functions") {
    return { https: { HttpsError: class extends Error {} }, logger: console };
  }
  return realLoad.call(this, request, ...rest);
};
const serverEngine = require("../../../functions/performanceEngine.js");
loaderHost._load = realLoad;
const computeSignals = serverEngine._internal.computeSignals as (input: {
  liftLoadScore: number;
  runLoadScore: number;
  liftProgression: number;
  runVolume: number;
  recoveryScore: number;
  adherenceScore: number;
  deloadRecommended: boolean;
  lifetimeData: { lastWorkoutDateStr?: string; lastRunCompletedAt?: Date };
  baselineActiveWeeks: number;
  computeKey: string;
}) => PerformanceSignals;

const BASELINE: Baseline = {
  liftTonnage: 12000,
  liftHardSets: 45,
  runKm: 20,
  runLongKm: 10,
  weeksUsed: 4,
};

/** 3 lift days and 2 run days a week, as setup and the schedule editor
 *  write them. */
const PROFILE = {
  goal: "recomp",
  weeklyWorkoutsTarget: 3,
  weeklyRunDaysTarget: 2,
  targetCalories: 2500,
  targetProtein: 160,
};

const COMPUTE_KEY = "2026-11-16";

interface WeekShape {
  /** The usual week's kilos and kilometres, times this. */
  lift?: number;
  run?: number;
  lifts?: number;
  runs?: number;
  calories?: number;
  protein?: number;
  foodDays?: number;
  longKm?: number;
}

/** A week at `lift` and `run` times the usual one, steady weight, food on
 *  target on 6 days unless told otherwise. */
function aggregates({
  lift = 1,
  run = 1,
  lifts = 3,
  runs = 2,
  calories = 2500,
  protein = 160,
  foodDays = 6,
  longKm,
}: WeekShape): WeeklyAggregates {
  return {
    weekKey: COMPUTE_KEY,
    liftTonnage: BASELINE.liftTonnage * lift,
    liftHardSets: BASELINE.liftHardSets * lift,
    liftSessions: lifts,
    runKm: Math.round(BASELINE.runKm * run * 10) / 10,
    runLongKm: longKm ?? BASELINE.runLongKm * run,
    runQualityCount: 0,
    runSessions: runs,
    mealDaysLogged: foodDays,
    avgDailyCalories: calories,
    avgDailyProtein: protein,
    bwCurrent7dAvg: 80,
    bwPrevious7dAvg: 80,
  } as WeeklyAggregates;
}

/** The document as the server writes it, scored after two steady weeks. */
function serverDoc(shape: WeekShape) {
  const agg = aggregates(shape);
  const scored = perfScoring.scorePerformance(agg, BASELINE, PROFILE, 70, 70);
  const signals = computeSignals({
    ...scored,
    lifetimeData: { lastWorkoutDateStr: COMPUTE_KEY },
    baselineActiveWeeks: 8,
    computeKey: COMPUTE_KEY,
  });
  return {
    weekKey: COMPUTE_KEY,
    ...scored,
    aggregates: agg,
    baseline: BASELINE,
    signals,
  };
}

/** The lead, as `PerformanceSection` reads it. */
function lead(shape: WeekShape) {
  const doc = serverDoc(shape);
  const state = getVerbState(
    resolveLoadBand(doc),
    resolveDeloadRecommended(doc)
  );
  const line = getLine(
    state,
    doc.signals,
    leadEvidence(doc, plannedSessionCount(PROFILE))
  );
  return { doc, state, line };
}

/** What the server's adherence makes of the food alone: the calorie and
 *  protein factors, with the sessions' factor left out. */
function foodAdherence(agg: WeeklyAggregates): number {
  return perfScoring.computeAdherenceScore(
    agg,
    0,
    PROFILE.targetCalories,
    PROFILE.targetProtein,
    PROFILE.goal
  );
}

/**
 * Whether a line is true of the week it describes, on the week's own
 * figures. Every claim the lead's lines make about the person is checked:
 * more than the usual week, a count of planned sessions, food off its
 * targets, and none of the retired sentences.
 */
function expectTrueOfItsWeek(line: string, doc: ReturnType<typeof serverDoc>) {
  const agg = doc.aggregates;
  expect(line).not.toMatch(/than usual$/);
  expect(line).not.toMatch(/ease off/i);

  if (/more than your usual week/.test(line)) {
    const ratios = [
      agg.liftTonnage / BASELINE.liftTonnage,
      agg.runKm / BASELINE.runKm,
    ];
    expect(ratios.some((r) => r > 1.05)).toBe(true);
    expect(ratios.every((r) => r >= 1)).toBe(true);
  }

  const count = line.match(
    /You did (\d+) (?:of (\d+) planned|sessions against (\d+) planned)/
  );
  if (count) {
    const done = Number(count[1]);
    const planned = Number(count[2] ?? count[3]);
    expect(done).toBe(
      agg.liftSessions + agg.runSessions + (agg.circuitSessions ?? 0)
    );
    // The plan the server scored the week against.
    expect(planned).toBe(perfScoring.weeklySessionTarget(PROFILE));
  }

  if (/food well off your targets/.test(line)) {
    expect(foodAdherence(agg)).toBeLessThan(50);
  } else if (/food/.test(line)) {
    throw new Error(`a line about food the test does not know: ${line}`);
  }
}

describe("Backing off says what happened, not more than usual", () => {
  it("at the usual week with food far off target: the deload flag is adherence's, and the line says so", () => {
    // 1,200 kcal and 40 g of protein a day against 2,500 and 160.
    const { doc, state, line } = lead({ calories: 1200, protein: 40 });
    // The week is real: high, flagged by adherence, recovery fine.
    expect(doc.loadBand).toBe("high");
    expect(doc.deloadRecommended).toBe(true);
    expect(doc.signals.recoveryWeak).toBe(false);
    expect(doc.signals.adherenceWeak).toBe(true);
    expect(trainedMoreThanUsual(doc)).toBe(false);
    expect(state).toBe("backing-off");

    expect(line).toBe(
      "You did 5 of 5 planned sessions, with food well off your targets"
    );
    expectTrueOfItsWeek(line, doc);
  });

  it("with sessions or food off and no plan to count against: says both, honestly", () => {
    const doc = serverDoc({ calories: 1200, protein: 40 });
    const line = getLine(
      getVerbState(resolveLoadBand(doc), resolveDeloadRecommended(doc)),
      doc.signals,
      leadEvidence(doc, plannedSessionCount({}))
    );
    expect(line).toBe("Your sessions or food were well off your plan");
  });

  it("over the usual week: says it, the reason the lines have always given", () => {
    // 130% of the usual week with food far off: flagged, and more.
    const { doc, state, line } = lead({
      lift: 1.3,
      run: 1.3,
      calories: 1200,
      protein: 40,
    });
    expect(state).toBe("backing-off");
    expect(doc.signals.recoveryWeak).toBe(false);
    expect(trainedMoreThanUsual(doc)).toBe(true);
    expect(line).toBe("You trained more than your usual week");
    expectTrueOfItsWeek(line, doc);
  });

  it("overreaching on lifting while running less: names the sport that was up", () => {
    // Lifting half again, running at 80%: the score overreaches, but
    // the week was not more than the usual one in both.
    const { doc, state, line } = lead({ lift: 1.5, run: 0.8 });
    expect(doc.loadBand).toBe("overreach");
    expect(doc.signals.adherenceWeak).toBe(false);
    expect(trainedMoreThanUsual(doc)).toBe(false);
    expect(state).toBe("backing-off");
    expect(line).toBe("Lifting volume 50% above your usual week");
    expectTrueOfItsWeek(line, doc);
  });

  it("held at the top two weeks running at about the usual week: the sport line's last word, and no comparison", () => {
    /* The engine's sustained rule: 85 or more this reading and the one
       before, after one under it. On a week of one sport the reading is
       that sport's own (`deloadLoadScore`), so 4 runs at the usual 20 km
       with a quality session reach it while the score itself is 60.
       Before, this read "You trained more than your usual week". */
    const RUNNER = { ...BASELINE, liftTonnage: 0, liftHardSets: 0 };
    const agg = {
      ...aggregates({ lift: 0, lifts: 0, runs: 4 }),
      runQualityCount: 1,
    };
    const profile = {
      ...PROFILE,
      weeklyWorkoutsTarget: 0,
      weeklyRunDaysTarget: 4,
    };
    const scored = perfScoring.scorePerformance(agg, RUNNER, profile, 86, 70);
    const doc = {
      ...scored,
      aggregates: agg,
      baseline: RUNNER,
      signals: computeSignals({
        ...scored,
        lifetimeData: { lastWorkoutDateStr: COMPUTE_KEY },
        baselineActiveWeeks: 8,
        computeKey: COMPUTE_KEY,
      }),
    };
    expect({ pi: doc.performanceIndex, band: doc.loadBand }).toEqual({
      pi: 60,
      band: "moderate",
    });
    expect(doc.deloadRecommended).toBe(true);
    const line = getLine(
      getVerbState(resolveLoadBand(doc), resolveDeloadRecommended(doc)),
      doc.signals,
      leadEvidence(doc, plannedSessionCount(profile))
    );
    expect(line).toBe("A strong 7 days");
    expect(line).not.toMatch(/usual|planned/);
  });
});

describe("Steady says what was off the plan, not fewer sessions than usual", () => {
  it.each([
    ["80%", 0.8],
    ["90%", 0.9],
  ])(
    "every planned session done at %s of the usual week, food far off: food was off, not the sessions",
    (_name, ratio) => {
      const { doc, state, line } = lead({
        lift: ratio,
        run: ratio,
        calories: 1200,
        protein: 40,
      });
      expect(doc.loadBand).toBe("moderate");
      expect(doc.deloadRecommended).toBe(false);
      expect(doc.signals.adherenceWeak).toBe(true);
      expect(state).toBe("cruising");
      expect(line).toBe(
        "You did 5 of 5 planned sessions, with food well off your targets"
      );
      expectTrueOfItsWeek(line, doc);
    }
  );

  it("sessions missed with food on target: says the count, and nothing about food", () => {
    // 2 lifts and 1 run of a planned 3 and 2, each its usual size.
    const { doc, state, line } = lead({
      lift: 2 / 3,
      run: 0.5,
      lifts: 2,
      runs: 1,
      longKm: 10,
    });
    expect(doc.loadBand).toBe("moderate");
    // Food on target holds adherence up: the sessions alone can't make it
    // weak while two food factors score 100.
    expect(doc.signals.adherenceWeak).toBe(false);
    expect(foodAdherence(doc.aggregates)).toBe(100);
    expect(state).toBe("cruising");
    expect(line).toBe("You did 3 of 5 planned sessions");
    expectTrueOfItsWeek(line, doc);
  });

  it("sessions missed with no food logged: adherence is the sessions alone, and the line says the count", () => {
    const { doc, state, line } = lead({
      lift: 1 / 3,
      run: 0.5,
      lifts: 1,
      runs: 1,
      longKm: 10,
      foodDays: 0,
      calories: 0,
      protein: 0,
    });
    expect(doc.signals.adherenceWeak).toBe(true);
    expect(state).toBe("cruising");
    expect(line).toBe("You did 2 of 5 planned sessions");
    expectTrueOfItsWeek(line, doc);
  });

  it("every planned session done, food on target: holding a steady rhythm", () => {
    // 70% of the usual week, every session done: moderate. (80% with food
    // on target already scores 70, high.)
    const { doc, state, line } = lead({ lift: 0.7, run: 0.7 });
    expect(state).toBe("cruising");
    expect(doc.signals.adherenceWeak).toBe(false);
    expect(line).toBe("Holding a steady rhythm");
    expectTrueOfItsWeek(line, doc);
  });
});

describe("a real more-than-usual week", () => {
  it("Sharpening says you trained more than your usual week", () => {
    // Lifting 10% up, running at the usual week: no sport line fires
    // (lifting under 15%, the loads not both strong), so the week's own
    // figures speak.
    const { doc, state, line } = lead({ lift: 1.1, run: 1 });
    expect(doc.loadBand).toBe("high");
    expect(doc.signals.bothLoadsStrong).toBe(false);
    expect(state).toBe("sharpening");
    expect(trainedMoreThanUsual(doc)).toBe(true);
    expect(line).toBe("You trained more than your usual week");
    expectTrueOfItsWeek(line, doc);
  });

  it("both sports 10% up reads both strong, the engine's own signal", () => {
    const { doc, state, line } = lead({ lift: 1.1, run: 1.1 });
    expect(state).toBe("sharpening");
    expect(doc.signals.bothLoadsStrong).toBe(true);
    expect(trainedMoreThanUsual(doc)).toBe(true);
    expect(line).toBe("Lifting and running both strong");
    expectTrueOfItsWeek(line, doc);
  });
});

describe("the plan the lines count against is the server's", () => {
  it.each([
    [{ weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 }, 5],
    [{ weeklyWorkoutsTarget: 4 }, 4],
    [{ weeklyWorkoutsTarget: 0, weeklyRunDaysTarget: 3 }, 3],
    // The run days win over the legacy runs target, a 0 included.
    [
      { weeklyWorkoutsTarget: 2, weeklyRunDaysTarget: 0, weeklyRunsTarget: 3 },
      2,
    ],
    [{ weeklyWorkoutsTarget: 2, weeklyRunsTarget: 3 }, 5],
  ])("%o plans %i, as the server scores it", (profile, planned) => {
    expect(plannedSessionCount(profile)).toBe(planned);
    expect(perfScoring.weeklySessionTarget({ goal: "cut", ...profile })).toBe(
      planned
    );
  });

  it("a profile that plans nothing has no count: the server's stand-in is the goal's, not a plan", () => {
    expect(plannedSessionCount({})).toBe(0);
    expect(plannedSessionCount({ weeklyWorkoutsTarget: 0 })).toBe(0);
    // The server scores such a week against the goal's default, which the
    // person never planned, so no line may call it planned.
    expect(perfScoring.weeklySessionTarget({ goal: "cut" })).toBe(3);
  });
});
