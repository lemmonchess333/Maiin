/**
 * PI1a — Unit tests for performanceEngine pure helpers.
 *
 * The Firestore-backed paths (computeAndWritePerformanceForUser,
 * acquireCooldownLock, releaseLock, fetchWindowData, fetchLifetimeData)
 * are emulator-tested separately. This file covers the pure logic:
 * window math, aggregation, scoring, signals.
 *
 * Vitest requires ESM `import` for its own module, but performanceEngine.js
 * is CommonJS — we use createRequire to import it cleanly (mirrors the
 * pattern in helpers.test.js).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Initialise admin BEFORE requiring performanceEngine — the module
// calls admin.firestore() at top level. We DON'T hardcode a project
// ID: in CI's emulator-tests workflow, vitest runs all test files
// in a single process so admin.apps is shared across files. If we
// initialised with a hardcoded "tropos-unit-test" project, the
// emulator-backed integration tests (configurePlan, auditLog, etc.)
// would inherit that admin client and write to the wrong project —
// causing every integration test to silently fail against an empty
// project. Prefer the emulator's GCLOUD_PROJECT (set to demo-tropos
// by the workflow) and fall back to a unit-test project name only
// for isolated local runs without the emulator.
const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "tropos-unit-test",
  });
}

const {
  getComputeKey,
  getWeekKey,
  isInRollingWindow,
  _internal,
} = require("../performanceEngine");

const {
  dateKeyMinusN,
  currentWindow,
  baselineWindow,
  aggregateWindow,
  computeBaselineFromAgg,
  computeLiftLoadScore,
  computeRunLoadScore,
  computeLoadBand,
  computeSignals,
  safeRatio,
  shouldRecommendDeload,
  WINDOW_DAYS,
  BASELINE_DAYS,
} = _internal;

describe("getComputeKey / getWeekKey alias", () => {
  it("returns YYYY-MM-DD UTC for a Date", () => {
    const d = new Date("2026-05-19T15:30:00Z");
    expect(getComputeKey(d)).toBe("2026-05-19");
  });

  it("getWeekKey is the same function (PI1a backwards-compat alias)", () => {
    expect(getWeekKey).toBe(getComputeKey);
  });

  it("no Sunday alignment — returns the date as-is", () => {
    // 2026-05-19 is a Tuesday
    expect(getComputeKey(new Date("2026-05-19T00:00:00Z"))).toBe("2026-05-19");
    // 2026-05-17 is a Sunday
    expect(getComputeKey(new Date("2026-05-17T00:00:00Z"))).toBe("2026-05-17");
  });
});

describe("dateKeyMinusN", () => {
  it("subtracts days correctly", () => {
    expect(dateKeyMinusN("2026-05-19", 0)).toBe("2026-05-19");
    expect(dateKeyMinusN("2026-05-19", 1)).toBe("2026-05-18");
    expect(dateKeyMinusN("2026-05-19", 7)).toBe("2026-05-12");
    expect(dateKeyMinusN("2026-05-19", 28)).toBe("2026-04-21");
  });

  it("handles month boundaries", () => {
    expect(dateKeyMinusN("2026-05-01", 1)).toBe("2026-04-30");
    expect(dateKeyMinusN("2026-03-01", 1)).toBe("2026-02-28"); // 2026 not a leap year
  });

  it("handles year boundary", () => {
    expect(dateKeyMinusN("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("negative n moves forward (used by currentWindow for exclusive end)", () => {
    expect(dateKeyMinusN("2026-05-19", -1)).toBe("2026-05-20");
  });
});

describe("currentWindow", () => {
  it("returns 7-day inclusive window ending at compute key", () => {
    const { start, end } = currentWindow("2026-05-19");
    expect(start.toISOString().split("T")[0]).toBe("2026-05-13");
    // end is exclusive (start of next day)
    expect(end.toISOString().split("T")[0]).toBe("2026-05-20");
  });

  it("window length matches WINDOW_DAYS constant (7)", () => {
    const { start, end } = currentWindow("2026-05-19");
    const days = (end.getTime() - start.getTime()) / 86400000;
    expect(days).toBe(WINDOW_DAYS);
  });
});

describe("baselineWindow", () => {
  it("returns 28-day window immediately preceding the current window", () => {
    const { start, end } = baselineWindow("2026-05-19");
    // Current window is [2026-05-13, 2026-05-19] (inclusive)
    // Baseline ends day before current window starts → 2026-05-12
    // Baseline starts 28 days before that → 2026-04-15
    expect(start.toISOString().split("T")[0]).toBe("2026-04-15");
    expect(end.toISOString().split("T")[0]).toBe("2026-05-13"); // exclusive
  });

  it("baseline length matches BASELINE_DAYS constant (28)", () => {
    const { start, end } = baselineWindow("2026-05-19");
    const days = (end.getTime() - start.getTime()) / 86400000;
    expect(days).toBe(BASELINE_DAYS);
  });
});

describe("isInRollingWindow", () => {
  it("returns true for dates within the 7-day window ending at computeKey", () => {
    expect(isInRollingWindow("2026-05-19", "2026-05-19")).toBe(true); // same day
    expect(isInRollingWindow("2026-05-13", "2026-05-19")).toBe(true); // window start
    expect(isInRollingWindow("2026-05-15", "2026-05-19")).toBe(true); // mid window
  });

  it("returns false for dates outside the window", () => {
    expect(isInRollingWindow("2026-05-12", "2026-05-19")).toBe(false); // day before window
    expect(isInRollingWindow("2026-05-20", "2026-05-19")).toBe(false); // future
    expect(isInRollingWindow("2026-04-01", "2026-05-19")).toBe(false); // way before
  });

  it("returns false for missing dateStr", () => {
    expect(isInRollingWindow("", "2026-05-19")).toBe(false);
    expect(isInRollingWindow(null, "2026-05-19")).toBe(false);
    expect(isInRollingWindow(undefined, "2026-05-19")).toBe(false);
  });
});

describe("aggregateWindow", () => {
  const start = new Date("2026-05-13T00:00:00Z");
  const end = new Date("2026-05-20T00:00:00Z"); // exclusive

  it("returns zero aggregate for empty data", () => {
    const agg = aggregateWindow(start, end, [], [], [], []);
    expect(agg.liftSessions).toBe(0);
    expect(agg.runSessions).toBe(0);
    expect(agg.mealDaysLogged).toBe(0);
    expect(agg.dayCount).toBe(7);
    expect(agg.activeWeeks).toBe(0); // PERF-M: no activity → 0 active weeks
  });

  it("counts distinct active weeks across the window (PERF-M)", () => {
    const wStart = new Date("2026-05-01T00:00:00Z");
    const wEnd = new Date("2026-05-29T00:00:00Z"); // 28-day baseline window
    const lift = (date) => ({
      date,
      exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
    });
    const workouts = [
      lift("2026-05-02"), // week 0
      lift("2026-05-05"), // week 0 (same week — counts once)
      lift("2026-05-16"), // week 2
      // weeks 1 (May 8-14) and 3 (May 22-28): no activity
    ];
    const agg = aggregateWindow(wStart, wEnd, workouts, [], [], []);
    expect(agg.liftSessions).toBe(3);
    expect(agg.activeWeeks).toBe(2); // weeks 0 & 2 only — NOT floor(28/7)=4
  });

  it("aggregates lift tonnage within window", () => {
    const workouts = [
      {
        date: "2026-05-15",
        exercises: [
          {
            category: "lift",
            sets: [
              { weightKg: 100, reps: 5 },
              { weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
    ];
    const agg = aggregateWindow(start, end, workouts, [], [], []);
    expect(agg.liftSessions).toBe(1);
    expect(agg.liftTonnage).toBe(1000);
    expect(agg.liftHardSets).toBe(1); // last non-cardio set
  });

  it("excludes workouts outside the window", () => {
    const workouts = [
      {
        date: "2026-05-10", // before window
        exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
      },
      {
        date: "2026-05-15", // in window
        exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
      },
    ];
    const agg = aggregateWindow(start, end, workouts, [], [], []);
    expect(agg.liftSessions).toBe(1);
    expect(agg.liftTonnage).toBe(500);
  });

  it("aggregates run distance + tracks longest run", () => {
    const runs = [
      {
        completedAt: { toDate: () => new Date("2026-05-14T08:00:00Z") },
        distance: 5000,
      },
      {
        completedAt: { toDate: () => new Date("2026-05-16T18:00:00Z") },
        distance: 12000,
      },
    ];
    const agg = aggregateWindow(start, end, [], runs, [], []);
    expect(agg.runSessions).toBe(2);
    expect(agg.runKm).toBeCloseTo(17.0);
    expect(agg.runLongKm).toBeCloseTo(12.0);
  });

  it("counts distinct meal days, not total meals", () => {
    const meals = [
      { date: "2026-05-13", totalCalories: 500, totalProtein: 30 },
      { date: "2026-05-13", totalCalories: 700, totalProtein: 40 }, // same day
      { date: "2026-05-14", totalCalories: 800, totalProtein: 50 },
    ];
    const agg = aggregateWindow(start, end, [], [], meals, []);
    expect(agg.mealDaysLogged).toBe(2);
    expect(agg.avgDailyCalories).toBe(Math.round((500 + 700 + 800) / 2)); // 1000
  });
});

describe("computeBaselineFromAgg", () => {
  it("scales baseline aggregate to a 7-day-equivalent", () => {
    const baselineAgg = {
      liftTonnage: 4000,
      liftHardSets: 40,
      runKm: 20,
      runLongKm: 12,
      dayCount: 28,
    };
    const bl = computeBaselineFromAgg(baselineAgg);
    expect(bl.liftTonnage).toBe(1000); // 4000 * (7/28)
    expect(bl.liftHardSets).toBe(10); // 40 * (7/28)
    expect(bl.runKm).toBe(5); // 20 * (7/28)
    expect(bl.runLongKm).toBe(12); // unchanged (max not averaged)
    expect(bl.weeksUsed).toBe(4); // 28 / 7
  });

  it("handles missing dayCount with BASELINE_DAYS default", () => {
    const baselineAgg = {
      liftTonnage: 4000,
      liftHardSets: 40,
      runKm: 20,
      runLongKm: 12,
    };
    const bl = computeBaselineFromAgg(baselineAgg);
    expect(bl.liftTonnage).toBe(1000); // still 4000 * (7/28)
  });

  it("weeksUsed reflects activeWeeks, not calendar weeks (PERF-M)", () => {
    // Zero-activity full window → 0 (deload-suppression gate stays closed for a
    // gap-returning user), not floor(28/7)=4.
    expect(
      computeBaselineFromAgg({
        liftTonnage: 0,
        liftHardSets: 0,
        runKm: 0,
        runLongKm: 0,
        activeWeeks: 0,
        dayCount: 28,
      }).weeksUsed
    ).toBe(0);
    // Partial activity → the real active-week count.
    expect(
      computeBaselineFromAgg({
        liftTonnage: 2000,
        liftHardSets: 20,
        runKm: 10,
        runLongKm: 6,
        activeWeeks: 2,
        dayCount: 28,
      }).weeksUsed
    ).toBe(2);
  });
});

describe("computeLoadBand thresholds", () => {
  it("maps PI to load bands per PI1 spec", () => {
    expect(computeLoadBand(95)).toBe("overreach");
    expect(computeLoadBand(85)).toBe("overreach");
    expect(computeLoadBand(84)).toBe("high");
    expect(computeLoadBand(70)).toBe("high");
    expect(computeLoadBand(69)).toBe("moderate");
    expect(computeLoadBand(45)).toBe("moderate");
    expect(computeLoadBand(44)).toBe("low");
    expect(computeLoadBand(25)).toBe("low");
    expect(computeLoadBand(24)).toBe("deload");
    expect(computeLoadBand(0)).toBe("deload");
  });
});

describe("computeLiftLoadScore", () => {
  it("returns 0 when no lift sessions", () => {
    const agg = { liftSessions: 0, liftTonnage: 0, liftHardSets: 0 };
    const bl = { liftTonnage: 1000, liftHardSets: 10 };
    expect(computeLiftLoadScore(agg, bl)).toBe(0);
  });

  it("score near 67 when current matches baseline (ratio 1.0)", () => {
    const agg = { liftSessions: 4, liftTonnage: 1000, liftHardSets: 10 };
    const bl = { liftTonnage: 1000, liftHardSets: 10 };
    expect(computeLiftLoadScore(agg, bl)).toBe(67); // (1.0 * 0.7 + 1.0 * 0.3) * 67
  });
});

describe("computeRunLoadScore", () => {
  it("returns 0 when no run sessions", () => {
    const agg = { runSessions: 0, runKm: 0, runLongKm: 0, runQualityCount: 0 };
    const bl = { runKm: 20, runLongKm: 12 };
    expect(computeRunLoadScore(agg, bl)).toBe(0);
  });

  it("adds 10pt quality bonus when interval/tempo run present", () => {
    const aggWithQuality = {
      runSessions: 3,
      runKm: 20,
      runLongKm: 12,
      runQualityCount: 1,
    };
    const aggWithoutQuality = {
      runSessions: 3,
      runKm: 20,
      runLongKm: 12,
      runQualityCount: 0,
    };
    const bl = { runKm: 20, runLongKm: 12 };
    expect(
      computeRunLoadScore(aggWithQuality, bl) -
        computeRunLoadScore(aggWithoutQuality, bl)
    ).toBe(10);
  });
});

describe("computeSignals", () => {
  const baseInput = {
    liftLoadScore: 50,
    runLoadScore: 50,
    liftProgression: 1.0,
    runVolume: 1.0,
    recoveryScore: 60,
    adherenceScore: 70,
    deloadRecommended: false,
    lifetimeData: {
      lifetimeWorkoutCount: 50,
      lifetimeRunCount: 30,
      lastWorkoutDateStr: "2026-05-18",
      lastRunCompletedAt: new Date("2026-05-17T10:00:00Z"),
    },
    baselineDayCount: 28,
    computeKey: "2026-05-19",
  };

  it("bothLoadsStrong fires when both scores >= 70", () => {
    expect(
      computeSignals({ ...baseInput, liftLoadScore: 75, runLoadScore: 75 })
        .bothLoadsStrong
    ).toBe(true);
    expect(
      computeSignals({ ...baseInput, liftLoadScore: 75, runLoadScore: 65 })
        .bothLoadsStrong
    ).toBe(false);
  });

  it("liftAheadOfBaseline only fires above 5% threshold", () => {
    expect(
      computeSignals({ ...baseInput, liftProgression: 1.04 })
        .liftAheadOfBaseline
    ).toBe(0);
    expect(
      computeSignals({ ...baseInput, liftProgression: 1.18 })
        .liftAheadOfBaseline
    ).toBeCloseTo(0.18);
  });

  it("runAheadOfBaseline only fires above 5% threshold", () => {
    expect(
      computeSignals({ ...baseInput, runVolume: 1.04 }).runAheadOfBaseline
    ).toBe(0);
    expect(
      computeSignals({ ...baseInput, runVolume: 1.25 }).runAheadOfBaseline
    ).toBeCloseTo(0.25);
  });

  it("recoveryWeak fires when recoveryScore < 50", () => {
    expect(
      computeSignals({ ...baseInput, recoveryScore: 49 }).recoveryWeak
    ).toBe(true);
    expect(
      computeSignals({ ...baseInput, recoveryScore: 50 }).recoveryWeak
    ).toBe(false);
  });

  it("adherenceWeak fires when adherenceScore < 50", () => {
    expect(
      computeSignals({ ...baseInput, adherenceScore: 30 }).adherenceWeak
    ).toBe(true);
    expect(
      computeSignals({ ...baseInput, adherenceScore: 70 }).adherenceWeak
    ).toBe(false);
  });

  it("deloadFlag mirrors deloadRecommended", () => {
    expect(
      computeSignals({ ...baseInput, deloadRecommended: true }).deloadFlag
    ).toBe(true);
    expect(
      computeSignals({ ...baseInput, deloadRecommended: false }).deloadFlag
    ).toBe(false);
  });

  it("lifetimeWeeks reflects baseline day coverage", () => {
    expect(
      computeSignals({ ...baseInput, baselineDayCount: 28 }).lifetimeWeeks
    ).toBe(4);
    expect(
      computeSignals({ ...baseInput, baselineDayCount: 14 }).lifetimeWeeks
    ).toBe(2);
    expect(
      computeSignals({ ...baseInput, baselineDayCount: 0 }).lifetimeWeeks
    ).toBe(0);
  });

  it("daysSinceLastTraining uses most recent of workout/run", () => {
    // computeKey = 2026-05-19; lastWorkout = 2026-05-18 (1 day ago)
    // lastRun = 2026-05-17 (2 days ago); min = 1
    const sig = computeSignals(baseInput);
    expect(sig.daysSinceLastTraining).toBe(1);
  });

  it("daysSinceLastTraining handles missing training data (defaults to 0)", () => {
    const sig = computeSignals({
      ...baseInput,
      lifetimeData: {
        lifetimeWorkoutCount: 0,
        lifetimeRunCount: 0,
        lastWorkoutDateStr: null,
        lastRunCompletedAt: null,
      },
    });
    expect(sig.daysSinceLastTraining).toBe(0);
  });

  it("rounds aheadOfBaseline to 3 decimal places", () => {
    // 1.1234 → 0.1234 → rounded to 3dp = 0.123
    const sig1 = computeSignals({ ...baseInput, liftProgression: 1.1234 });
    expect(sig1.liftAheadOfBaseline).toBe(0.123);
    // 1.1236 → 0.1236 → rounded to 3dp = 0.124
    const sig2 = computeSignals({ ...baseInput, liftProgression: 1.1236 });
    expect(sig2.liftAheadOfBaseline).toBe(0.124);
  });
});

describe("safeRatio — cold-start neutrality (reconciled with client engine)", () => {
  it("returns NEUTRAL 1.0 (not 1.2) for a zero baseline with current activity", () => {
    // Was 1.2 server-side — inflated every cold-start ratio to "20% above
    // baseline". Must match the client engine's 1.0.
    expect(safeRatio(500, 0)).toBe(1.0);
  });
  it("returns 0 when there's no current activity and no baseline", () => {
    expect(safeRatio(0, 0)).toBe(0);
  });
  it("returns the true ratio once a baseline exists", () => {
    expect(safeRatio(120, 100)).toBeCloseTo(1.2);
    expect(safeRatio(80, 100)).toBeCloseTo(0.8);
  });
});

describe("shouldRecommendDeload — sustained-overreach threshold reconciled to 85", () => {
  it("does NOT recommend deload for two consecutive weeks in the 75-84 band", () => {
    // Old server threshold (75) fired here; client (and now server) is 85.
    expect(shouldRecommendDeload(80, 70, 70, 80)).toBe(false);
    expect(shouldRecommendDeload(84, 70, 70, 84)).toBe(false);
  });
  it("recommends deload for two consecutive weeks at/above 85", () => {
    expect(shouldRecommendDeload(85, 70, 70, 85)).toBe(true);
    expect(shouldRecommendDeload(90, 70, 70, 88)).toBe(true);
  });
  it("still fires on high PI + low recovery regardless of the previous week", () => {
    expect(shouldRecommendDeload(80, 40, 70, null)).toBe(true);
  });
  it("still fires on high PI + low adherence", () => {
    expect(shouldRecommendDeload(70, 70, 40, null)).toBe(true);
  });
  it("does not fire from a single high week alone (no previous, decent recovery/adherence)", () => {
    expect(shouldRecommendDeload(88, 70, 70, null)).toBe(false);
  });
});
