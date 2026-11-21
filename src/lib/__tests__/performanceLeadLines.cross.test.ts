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
 * A count of planned sessions is said only where it is the plan's: the
 * week as Home and Train count it (`trainingWeek`) holds the profile's
 * count, and the window is not in a race's last weeks. Race week rests
 * lifts and a free runner's week plans no runs, while the score still
 * divides by the profile's days.
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
  leadPlan,
  plannedForWindow,
  trainedMoreThanUsual,
  type LeadPlan,
} from "../performanceWeekBreakdown";
import { plannedSessionCount } from "../performanceEngine";
import {
  resolveDeloadRecommended,
  resolveLoadBand,
} from "../performanceDocFields";
import { trainingWeek } from "../trainingWeek";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import type { ScheduledRunDay } from "@/features/program/programTypes";
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

/** The window ends today, as the lead shows it ("Last 7 days"). Derived
 *  from the clock: the plan's count is said only of a window that ends
 *  now. */
const TODAY = new Date();
const TODAY_KEY = localDateString(TODAY);
const THIS_WEEK = localWeekKey(TODAY);
const dayIn = (weekKey: string, i: number) =>
  localDateString(addLocalDays(parseLocalDate(weekKey), i));

/** A week the app plans as the profile counts it: 3 lifts and 2 runs this
 *  Monday to Sunday, no race. */
const PLAN: LeadPlan = leadPlan(PROFILE, {
  lifts: { planned: 3 },
  runs: { planned: 2 },
});

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
function aggregates(
  {
    lift = 1,
    run = 1,
    lifts = 3,
    runs = 2,
    calories = 2500,
    protein = 160,
    foodDays = 6,
    longKm,
  }: WeekShape,
  computeKey = TODAY_KEY
): WeeklyAggregates {
  return {
    weekKey: computeKey,
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

/** The document as the server writes it, scored after two steady weeks,
 *  against the profile the server read when it scored. */
function serverDoc(
  shape: WeekShape,
  profile: Record<string, unknown> = PROFILE,
  computeKey = TODAY_KEY
) {
  const agg = aggregates(shape, computeKey);
  const scored = perfScoring.scorePerformance(agg, BASELINE, profile, 70, 70);
  const signals = computeSignals({
    ...scored,
    lifetimeData: { lastWorkoutDateStr: computeKey },
    baselineActiveWeeks: 8,
    computeKey,
  });
  return {
    weekKey: computeKey,
    ...scored,
    aggregates: agg,
    baseline: BASELINE,
    signals,
  };
}

type ServerDoc = ReturnType<typeof serverDoc>;

/** The lead's line for a document, as `PerformanceSection` reads it. */
function lineFor(doc: ServerDoc, plan: LeadPlan | null, today = TODAY) {
  const state = getVerbState(
    resolveLoadBand(doc),
    resolveDeloadRecommended(doc)
  );
  return {
    state,
    line: getLine(state, doc.signals, leadEvidence(doc, plan, today)),
  };
}

/** A week scored against PROFILE and read against a plan that holds it. */
function lead(shape: WeekShape) {
  const doc = serverDoc(shape);
  return { doc, ...lineFor(doc, PLAN) };
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

const COUNT =
  /You did (\d+) (?:of (\d+) planned sessions?|sessions against (\d+) planned) in these 7 days/;

/**
 * Whether a line is true of the week it describes, on the week's own
 * figures. Every claim the lead's lines make about the person is checked:
 * more than the usual week, a count of planned sessions, food off its
 * targets, and none of the retired sentences.
 */
function expectTrueOfItsWeek(
  line: string,
  doc: ServerDoc,
  /** The plan's sessions this week, which a count must name. */
  planned: number
) {
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

  const count = line.match(COUNT);
  if (count) {
    expect(Number(count[1])).toBe(
      agg.liftSessions + agg.runSessions + (agg.circuitSessions ?? 0)
    );
    expect(Number(count[2] ?? count[3])).toBe(planned);
  } else {
    expect(line).not.toMatch(/planned/);
  }

  if (/food well off your targets/.test(line)) {
    // The server counted the food (3 days or more), and it was off.
    expect(agg.mealDaysLogged).toBeGreaterThanOrEqual(3);
    expect(foodAdherence(agg)).toBeLessThan(50);
  } else if (/food/.test(line)) {
    expect(line).toBe("Your sessions or food were well off your plan");
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
      "You did 5 of 5 planned sessions in these 7 days, with food well off your targets"
    );
    expectTrueOfItsWeek(line, doc, 5);
  });

  it("with sessions or food off and no plan to count against: says both, honestly", () => {
    const doc = serverDoc({ calories: 1200, protein: 40 });
    expect(lineFor(doc, null).line).toBe(
      "Your sessions or food were well off your plan"
    );
    expect(lineFor(doc, leadPlan({}, planWeek(0, 0))).line).toBe(
      "Your sessions or food were well off your plan"
    );
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
    expectTrueOfItsWeek(line, doc, 5);
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
    expectTrueOfItsWeek(line, doc, 5);
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
      weekKey: TODAY_KEY,
      ...scored,
      aggregates: agg,
      baseline: RUNNER,
      signals: computeSignals({
        ...scored,
        lifetimeData: { lastWorkoutDateStr: TODAY_KEY },
        baselineActiveWeeks: 8,
        computeKey: TODAY_KEY,
      }),
    };
    expect({ pi: doc.performanceIndex, band: doc.loadBand }).toEqual({
      pi: 60,
      band: "moderate",
    });
    expect(doc.deloadRecommended).toBe(true);
    const { line } = lineFor(doc, leadPlan(profile, planWeek(0, 4)));
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
        "You did 5 of 5 planned sessions in these 7 days, with food well off your targets"
      );
      expectTrueOfItsWeek(line, doc, 5);
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
    expect(line).toBe("You did 3 of 5 planned sessions in these 7 days");
    expectTrueOfItsWeek(line, doc, 5);
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
    expect(line).toBe("You did 2 of 5 planned sessions in these 7 days");
    expectTrueOfItsWeek(line, doc, 5);
  });

  it("every planned session done, food on target: holding a steady rhythm", () => {
    // 70% of the usual week, every session done: moderate. (80% with food
    // on target already scores 70, high.)
    const { doc, state, line } = lead({ lift: 0.7, run: 0.7 });
    expect(state).toBe("cruising");
    expect(doc.signals.adherenceWeak).toBe(false);
    expect(line).toBe("Holding a steady rhythm");
    expectTrueOfItsWeek(line, doc, 5);
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
    expectTrueOfItsWeek(line, doc, 5);
  });

  it("both sports 10% up reads both strong, the engine's own signal", () => {
    const { doc, state, line } = lead({ lift: 1.1, run: 1.1 });
    expect(state).toBe("sharpening");
    expect(doc.signals.bothLoadsStrong).toBe(true);
    expect(trainedMoreThanUsual(doc)).toBe(true);
    expect(line).toBe("Lifting and running both strong");
    expectTrueOfItsWeek(line, doc, 5);
  });
});

/** A week whose plan holds `lifts` and `runs`, as `trainingWeek` counts. */
function planWeek(lifts: number, runs: number) {
  return {
    lifts: { planned: lifts > 0 ? lifts : null },
    runs: { planned: runs > 0 ? runs : null },
  };
}

const runDay = (
  fields: Partial<ScheduledRunDay> & { dayIndex: number }
): ScheduledRunDay => ({ templateId: "easy", type: "easy", ...fields });

const run = (day: string, km: number) => ({
  day,
  distance: km * 1000,
  duration: km * 330,
});

describe("a count is the plan's, or none", () => {
  it("race week: Home and Train count 4 of 4, so the lead says no count of 7", () => {
    /* The second review's case. 3 lifts and 4 runs a week; race week's
       rollover kept one lift and skipped two (`raceWeekSession`), and the
       plan holds 2 runs and the race. All 4 done. The score still divides
       by the profile's 7. */
    const w = (i: number) => dayIn(THIS_WEEK, i);
    const raceDay = w(6);
    const onRaceDay = parseLocalDate(raceDay);
    onRaceDay.setHours(12);
    const profile = {
      ...PROFILE,
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 4,
      raceGoal: { distance: "10k" as const, targetDate: raceDay },
    };
    const week = trainingWeek({
      weekKey: THIS_WEEK,
      profile,
      programState: {
        raceWeek: "race",
        liftWeekKey: THIS_WEEK,
        workouts: [{ completed: true }, { skipped: true }, { skipped: true }],
        runPlan: { mode: "race_prep", raceGoal: profile.raceGoal },
        runDays: [
          runDay({ id: "e1", date: w(1), dayIndex: 2 }),
          runDay({ id: "e2", date: w(3), dayIndex: 4 }),
          runDay({
            id: "race",
            date: raceDay,
            dayIndex: 0,
            templateId: "race",
            type: "race",
          }),
        ],
      },
      workouts: [{ date: w(0) }],
      runs: [run(w(1), 5), run(w(3), 5), run(raceDay, 10)],
      now: onRaceDay,
    });
    // As Home and Train count it.
    expect(week.lifts).toEqual({ done: 1, planned: 1 });
    expect({ done: week.runs.done, planned: week.runs.planned }).toEqual({
      done: 3,
      planned: 3,
    });

    // One lift of the usual three, the usual 20 km with the race in it.
    const doc = serverDoc(
      { lift: 1 / 3, run: 1, lifts: 1, runs: 3, longKm: 10 },
      profile,
      raceDay
    );
    // The score divides by the profile's 7: 4 of 7, food on target, not
    // weak, and Steady.
    expect(perfScoring.weeklySessionTarget(profile)).toBe(7);
    expect(doc.signals.adherenceWeak).toBe(false);
    const plan = leadPlan(profile, week);
    expect(plan).toEqual({ perWeek: 7, thisWeek: 4, raceDate: raceDay });
    expect(plannedForWindow(plan, raceDay, onRaceDay)).toBeNull();

    const { state, line } = lineFor(doc, plan, onRaceDay);
    expect(state).toBe("cruising");
    // Before: "You did 4 of 7 planned sessions", beside Home's 4 of 4.
    expect(line).toBe("Holding a steady rhythm");
  });

  it("a free runner: the week plans the lifts and no runs, so no count of the profile's run days", () => {
    /* A profile written before free running set its run days to 0 still
       holds 2; the plan has no run days, so the week counts runs done
       only (trainingWeek.ts, Run9a). */
    const week = trainingWeek({
      weekKey: THIS_WEEK,
      profile: PROFILE,
      programState: { runDays: [] },
      workouts: [],
      runs: [],
      now: TODAY,
    });
    expect(week.lifts.planned).toBe(3);
    expect(week.runs.planned).toBeNull();

    const doc = serverDoc({
      lift: 2 / 3,
      run: 0.5,
      lifts: 2,
      runs: 1,
      longKm: 10,
    });
    const plan = leadPlan(PROFILE, week);
    expect(plan.thisWeek).toBe(3);
    const { state, line } = lineFor(doc, plan);
    expect(state).toBe("cruising");
    // Before: "You did 3 of 5 planned sessions", of a plan with 3.
    expect(line).toBe("Holding a steady rhythm");
  });

  it("a window that reaches back into a race's last weeks says no count, though this week matches", () => {
    const raceTwoDaysAgo = localDateString(addLocalDays(TODAY, -2));
    const plan: LeadPlan = {
      perWeek: 7,
      thisWeek: 7,
      raceDate: raceTwoDaysAgo,
    };
    expect(plannedForWindow(plan, TODAY_KEY, TODAY)).toBeNull();
    // The two lighter weeks before the race's week count too.
    const in3Weeks = localDateString(addLocalDays(TODAY, 21));
    expect(
      plannedForWindow({ ...plan, raceDate: in3Weeks }, TODAY_KEY, TODAY)
    ).toBeNull();
    // A race well ahead is not in the window.
    const in8Weeks = localDateString(addLocalDays(TODAY, 56));
    expect(
      plannedForWindow({ ...plan, raceDate: in8Weeks }, TODAY_KEY, TODAY)
    ).toBe(7);
  });

  it("says a count only of a window that ends now, of a week that has loaded", () => {
    expect(plannedForWindow(PLAN, TODAY_KEY, TODAY)).toBe(5);
    const yesterday = localDateString(addLocalDays(TODAY, -1));
    expect(plannedForWindow(PLAN, yesterday, TODAY)).toBe(5);
    // An older window was scored against the plan as it was then.
    const threeDaysAgo = localDateString(addLocalDays(TODAY, -3));
    expect(plannedForWindow(PLAN, threeDaysAgo, TODAY)).toBeNull();
    expect(
      plannedForWindow({ ...PLAN, thisWeek: null }, TODAY_KEY, TODAY)
    ).toBeNull();
    expect(plannedForWindow(null, TODAY_KEY, TODAY)).toBeNull();
  });

  it("a plan cut from 6 to 4 after scoring, 2 done, no food logged: the count, never the food", () => {
    /* Scored against 6 (3 lifts, 3 runs), 2 done and no food logged:
       adherence is the sessions alone, 33. The plan is 4 now, so 2 is
       half of it, and the half-the-plan rule alone would say the food was
       off. The server never counted food under 3 days. */
    const doc = serverDoc(
      {
        lift: 2 / 3,
        run: 0.5,
        lifts: 1,
        runs: 1,
        longKm: 10,
        foodDays: 0,
        calories: 0,
        protein: 0,
      },
      { ...PROFILE, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 3 }
    );
    expect(doc.adherenceScore).toBe(33);
    expect(doc.signals.adherenceWeak).toBe(true);
    const now = leadPlan(
      { ...PROFILE, weeklyWorkoutsTarget: 2, weeklyRunDaysTarget: 2 },
      planWeek(2, 2)
    );
    const { state, line } = lineFor(doc, now);
    expect(state).toBe("cruising");
    expect(line).toBe("You did 2 of 4 planned sessions in these 7 days");
    expect(line).not.toMatch(/food/);
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
