/**
 * A circuit in the performance index (Circ1 (6)): it counts as a session
 * done, for adherence, and for nothing else. A circuit is a saved workout
 * with `format: "circuit"` and no exercises, so read as a lift it would
 * be a lift session with no tonnage and no hard sets: an active week that
 * divides the lift and run baselines, a lift that turns a runner's deload
 * question into the diluted composite, and a session in the recovery and
 * confidence counts.
 *
 * Each case scores the same person with and without the circuit, through
 * the server's own aggregation, baseline and scoring.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// The engine takes its `db` as it loads: initialise first (see
// performanceEngine.test.js for why the project id is not hardcoded).
const admin = require("../lib/adminSdk");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "tropos-unit-test",
  });
}

const { _internal } = require("../performanceEngine");
const perfScoring = require("../lib/perfScoring");

const {
  aggregateWindow,
  baselineWindow,
  computeBaselineFromAgg,
  computeConfidence,
  currentWindow,
  dateKeyMinusN,
  isCircuitWorkout,
} = _internal;

const COMPUTE_KEY = "2026-05-19";
const PROFILE = {
  goal: "recomp",
  weeklyWorkoutsTarget: 3,
  targetCalories: null,
  targetProtein: null,
};

const lift = (date, kg = 100) => ({
  date,
  totalVolume: kg * 5 * 3,
  exercises: [
    {
      category: "Legs",
      sets: [
        { weightKg: kg, reps: 5 },
        { weightKg: kg, reps: 5 },
        { weightKg: kg, reps: 5 },
      ],
    },
  ],
});

/** A bodyweight circuit as the app saves it (Circ1 (B)). */
const circuit = (date) => ({
  date,
  format: "circuit",
  exercises: [],
  totalVolume: 0,
  totalCalories: 160,
  durationMinutes: 20,
  source: "free",
  circuit: {
    circuitId: "builtin-minimal-20-standard",
    name: "20-minute circuit",
    kind: "intervals",
    kit: "minimal",
    minutes: 20,
    lowImpact: false,
    level: 0,
    workSeconds: 40,
    restSeconds: 20,
    rounds: 4,
    moves: [{ exerciseId: "push-ups", name: "Push-Ups", impact: "low" }],
    intervalsDone: 20,
    roundsDone: 4,
    workSecondsDone: 800,
    activeSeconds: 1180,
    finished: true,
  },
});

const run = (date, km) => ({
  runDay: date,
  distance: km * 1000,
  activityType: "easy",
});

const day = (n) => dateKeyMinusN(COMPUTE_KEY, n);

/** The server's whole scoring of one person, as the rollup does it. */
function score({ workouts = [], runs = [] }) {
  const cur = currentWindow(COMPUTE_KEY);
  const base = baselineWindow(COMPUTE_KEY);
  const runDay = (r) => r.runDay;
  const agg = aggregateWindow(
    cur.start,
    cur.end,
    workouts,
    runs,
    [],
    [],
    runDay
  );
  const baselineAgg = aggregateWindow(
    base.start,
    base.end,
    workouts,
    runs,
    [],
    [],
    runDay
  );
  const bl = computeBaselineFromAgg(baselineAgg);
  return {
    agg,
    bl,
    confidence: computeConfidence(agg, bl),
    ...perfScoring.scorePerformance(agg, bl, PROFILE, null, null),
  };
}

// The baseline window is the 28 days before the current 7.
const BASELINE_LIFTS = [lift(day(8)), lift(day(10)), lift(day(22))];
const BASELINE_CIRCUITS = [circuit(day(15)), circuit(day(29))];
const THIS_WEEK_LIFTS = [lift(day(1), 110), lift(day(3), 110)];

describe("a circuit in the performance index (Circ1 (6))", () => {
  it("is read by its marker", () => {
    expect(isCircuitWorkout(circuit(day(1)))).toBe(true);
    expect(isCircuitWorkout(lift(day(1)))).toBe(false);
    expect(isCircuitWorkout({ date: day(1), format: "superset" })).toBe(false);
    expect(isCircuitWorkout(null)).toBe(false);
  });

  it("reads workouts saved before circuits as before, with no circuits", () => {
    // Main's aggregate of these workouts, field for field, plus the count.
    const { start, end } = currentWindow(COMPUTE_KEY);
    const old = [lift(day(1)), lift(day(3), 120)];
    const agg = aggregateWindow(start, end, old, [], [], []);
    expect(agg).toEqual({
      liftTonnage: 1500 + 1800,
      liftHardSets: 2,
      liftSessions: 2,
      circuitSessions: 0,
      runKm: 0,
      runLongKm: 0,
      runLongKmWeeklySum: 0,
      runQualityCount: 0,
      runSessions: 0,
      mealDaysLogged: 0,
      avgDailyCalories: 0,
      avgDailyProtein: 0,
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
      activeWeeks: 1,
      dayCount: 7,
    });
    // Only the exact marker is a circuit: anything else is a lift.
    for (const format of [null, "Circuit", "circuits", ""]) {
      const odd = aggregateWindow(
        start,
        end,
        [{ ...lift(day(2)), format }],
        [],
        [],
        []
      );
      expect(odd.liftSessions, String(format)).toBe(1);
      expect(odd.circuitSessions, String(format)).toBe(0);
    }
  });

  it("is aggregated as a circuit session, not a lift session or an active week", () => {
    const { start, end } = currentWindow(COMPUTE_KEY);
    const agg = aggregateWindow(start, end, [circuit(day(2))], [], [], []);
    expect(agg.circuitSessions).toBe(1);
    expect(agg.liftSessions).toBe(0);
    expect(agg.liftTonnage).toBe(0);
    expect(agg.liftHardSets).toBe(0);
    expect(agg.activeWeeks).toBe(0);
  });

  it("a week with only a circuit scores adherence and lift load as if no lift happened", () => {
    const empty = score({ workouts: BASELINE_LIFTS });
    const circuitWeek = score({
      workouts: [...BASELINE_LIFTS, circuit(day(2))],
    });
    expect(circuitWeek.liftLoadScore).toBe(empty.liftLoadScore);
    expect(circuitWeek.liftLoadScore).toBe(0);
    expect(circuitWeek.liftProgression).toBe(empty.liftProgression);
    // One session of three planned.
    expect(empty.adherenceScore).toBe(0);
    expect(circuitWeek.adherenceScore).toBe(33);
    expect(circuitWeek.adherenceScore).toBeGreaterThan(empty.adherenceScore);
    // Nothing else moves: recovery, the load band's inputs, confidence.
    expect(circuitWeek.recoveryScore).toBe(empty.recoveryScore);
    expect(circuitWeek.confidence).toBe(empty.confidence);
  });

  it("a week of lifts plus a circuit has the lift load of the lifts alone", () => {
    const lifts = score({ workouts: [...BASELINE_LIFTS, ...THIS_WEEK_LIFTS] });
    const withCircuit = score({
      workouts: [...BASELINE_LIFTS, ...THIS_WEEK_LIFTS, circuit(day(2))],
    });
    expect(withCircuit.liftLoadScore).toBe(lifts.liftLoadScore);
    expect(withCircuit.liftProgression).toBe(lifts.liftProgression);
    expect(withCircuit.adherenceScore).toBeGreaterThan(lifts.adherenceScore);
  });

  it("circuit weeks in the baseline neither divide the lift baseline nor change the lift load", () => {
    const lifts = score({ workouts: [...BASELINE_LIFTS, ...THIS_WEEK_LIFTS] });
    const withBaselineCircuits = score({
      workouts: [...BASELINE_LIFTS, ...BASELINE_CIRCUITS, ...THIS_WEEK_LIFTS],
    });
    expect(withBaselineCircuits.bl).toEqual(lifts.bl);
    expect(withBaselineCircuits.liftLoadScore).toBe(lifts.liftLoadScore);
    expect(withBaselineCircuits.performanceIndex).toBe(lifts.performanceIndex);
  });

  it("a runner who adds a circuit keeps their deload question on running", () => {
    const runs = [
      run(day(9), 10),
      run(day(16), 10),
      run(day(23), 10),
      run(day(30), 10),
      run(day(1), 16),
      run(day(3), 16),
      run(day(5), 16),
    ];
    const runner = score({ runs });
    const withCircuit = score({ runs, workouts: [circuit(day(2))] });
    expect(withCircuit.deloadIndex).toBe(runner.deloadIndex);
    expect(withCircuit.runLoadScore).toBe(runner.runLoadScore);
    expect(withCircuit.liftLoadScore).toBe(0);
  });
});
