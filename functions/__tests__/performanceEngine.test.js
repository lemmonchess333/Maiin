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
import { readFileSync } from "node:fs";
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
  triggerComputeKey,
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

/**
 * The trigger gate, as a decision about WHICH key to compute with — not
 * just whether. `todayKey` is the server's UTC date; a workout's `date` is
 * the user's LOCAL day. East of UTC those disagree every morning, and the
 * old gate (`isInRollingWindow(date, today)` alone) read every such
 * session as out-of-window: the trigger skipped, logging prose written for
 * backdated entries, and the PI sat stale until the next day's cron —
 * exactly when the user looks at it.
 */
describe("triggerComputeKey", () => {
  const TODAY = "2026-08-15";

  it("computes with today for an in-window past or same-day date", () => {
    expect(triggerComputeKey("2026-08-15", TODAY)).toBe(TODAY);
    expect(triggerComputeKey("2026-08-12", TODAY)).toBe(TODAY);
    expect(triggerComputeKey("2026-08-09", TODAY)).toBe(TODAY); // window edge
  });

  it("still skips a backdated entry beyond the window", () => {
    expect(triggerComputeKey("2026-08-08", TODAY)).toBeNull();
    expect(triggerComputeKey("2026-01-01", TODAY)).toBeNull();
  });

  it("computes with the doc's OWN day when its label is one day ahead", () => {
    /* The east-of-UTC case: a 9am Auckland session is dated 2026-08-16
       while the server's UTC date is still the 15th. Returning TODAY here
       would not be enough even if the gate passed — currentWindow(today)'s
       exclusive end IS that doc's midnight, so the aggregate would skip
       it. The key must be the doc's day so the window contains it. */
    expect(triggerComputeKey("2026-08-16", TODAY)).toBe("2026-08-16");
  });

  it("still skips a label more than one day ahead — that is a broken clock", () => {
    /* UTC+14 is the planet's maximum; no real timezone leads the server's
       date by two. The protective half of the gate is unchanged. */
    expect(triggerComputeKey("2026-08-17", TODAY)).toBeNull();
    expect(triggerComputeKey("2027-08-15", TODAY)).toBeNull();
  });

  it("the one-day-ahead key produces a window that actually contains the doc", () => {
    /* Ties the returned key to the aggregation rather than trusting the
       reasoning: the whole point of returning dateStr is that the window
       built from it counts the workout todayKey's window cannot. */
    const key = triggerComputeKey("2026-08-16", TODAY);
    const { start: wStart, end: wEnd } = currentWindow(key);
    const agg = aggregateWindow(
      wStart,
      wEnd,
      [
        {
          date: "2026-08-16",
          exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
        },
      ],
      [],
      [],
      []
    );
    expect(agg.liftSessions).toBe(1);
    expect(agg.liftTonnage).toBe(500);

    // ...and the counter-fact that makes the key choice load-bearing:
    // the same doc against TODAY's window is excluded.
    const { start: tStart, end: tEnd } = currentWindow(TODAY);
    const aggToday = aggregateWindow(
      tStart,
      tEnd,
      [
        {
          date: "2026-08-16",
          exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
        },
      ],
      [],
      [],
      []
    );
    expect(aggToday.liftSessions).toBe(0);
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

  it("a timed hold adds no tonnage but its last set is still a hard set", () => {
    /* The PI was the LAST copy of the tonnage rule without the timed-hold
       exclusion: a 20 kg / 60 s weighted plank read as 1,200 kg of weekly
       load — inflating tonnageRatio, the load band, and the deload logic
       off an exercise that moved no weight. Every other consumer of a
       workout (challenges, lifetime volume, all display surfaces) already
       excluded it.

       The hard-set HALF is the boundary in the other direction: a
       completed hold is a completed effortful set, and hard sets is a
       count with no unit to corrupt — so it stays in. An exclusion that
       swallowed it would misread every core-day as lighter than it was. */
    const workouts = [
      {
        date: "2026-05-15",
        exercises: [
          { category: "lift", sets: [{ weightKg: 100, reps: 5 }] },
          {
            category: "core",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
        ],
      },
    ];
    const agg = aggregateWindow(start, end, workouts, [], [], []);
    expect(agg.liftTonnage).toBe(500);
    expect(agg.liftHardSets).toBe(2);
  });

  it("prefers the writer's stated totalVolume over re-deriving", () => {
    /* Post-#2041 docs carry the session tonnage the writer computed —
       the same figure every other consumer credits. The PI reading a
       DIFFERENT number for the same session than challenges and lifetime
       volume is exactly the disagreement this consolidation removes. */
    const workouts = [
      {
        date: "2026-05-15",
        totalVolume: 2400,
        exercises: [{ category: "lift", sets: [{ weightKg: 100, reps: 5 }] }],
      },
    ];
    const agg = aggregateWindow(start, end, workouts, [], [], []);
    expect(agg.liftTonnage).toBe(2400);
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

  it("ignores bodyweight logs with a missing/non-numeric weight (no NaN)", () => {
    // Regression: a malformed log (no weight) used to push undefined into the
    // avg, yielding NaN — which != null, so it was miscounted as a present
    // bodyweight reading. Guarded logs are dropped; a real reading still lands.
    const bw = [
      { date: "2026-05-14" }, // missing weight
      { date: "2026-05-15", weight: "eighty" }, // non-numeric
      { date: "2026-05-16", weight: 80 }, // valid
    ];
    const agg = aggregateWindow(start, end, [], [], [], bw);
    expect(agg.bwCurrent7dAvg).toBe(80);

    const allBad = aggregateWindow(
      start,
      end,
      [],
      [],
      [],
      [{ date: "2026-05-14" }]
    );
    expect(allBad.bwCurrent7dAvg).toBeNull(); // not NaN
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

  it("divides load by ACTIVE weeks, not calendar weeks (P2 — matches client)", () => {
    // A returning trainer: all their baseline load lands in 2 of the 4 calendar
    // weeks (2 gap weeks). The client averages over the 2 ACTIVE weeks; the old
    // server divided by 4 calendar weeks, deflating the baseline and inflating
    // the PI. Now both divide by activeWeeks.
    const bl = computeBaselineFromAgg({
      liftTonnage: 8000,
      liftHardSets: 40,
      runKm: 24,
      runLongKm: 15,
      runLongKmWeeklySum: 25, // weeks with long runs of 15 + 10
      activeWeeks: 2,
      dayCount: 28,
    });
    expect(bl.liftTonnage).toBe(4000); // 8000 / 2 active weeks (was 8000*7/28=2000)
    expect(bl.liftHardSets).toBe(20); // 40 / 2
    expect(bl.runKm).toBe(12); // 24 / 2
    // P3: mean of weekly-longest runs, not the single max (which was 15).
    expect(bl.runLongKm).toBe(12.5); // 25 / 2
  });

  it("fully-active baseline is unchanged from the old calendar scaling (no PI drift)", () => {
    // activeWeeks === 4 → perWeek 1/4 === the old 7/28, so users who trained
    // every baseline week see identical output. Only gap-week users move.
    const bl = computeBaselineFromAgg({
      liftTonnage: 4000,
      liftHardSets: 40,
      runKm: 20,
      runLongKm: 12,
      runLongKmWeeklySum: 40, // 4 weeks × ~10
      activeWeeks: 4,
      dayCount: 28,
    });
    expect(bl.liftTonnage).toBe(1000);
    expect(bl.runLongKm).toBe(10); // 40 / 4
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

  it("lifetimeWeeks reflects ACTIVE baseline weeks, not the fixed window span", () => {
    // Regression: lifetimeWeeks used to derive from baselineDayCount (the
    // 28-day window span, always 28), hardcoding it to 4 for everyone and
    // misclassifying cold-start users as established. It now reflects
    // activeWeeks — weeks that actually had a session.
    expect(
      computeSignals({ ...baseInput, baselineActiveWeeks: 4 }).lifetimeWeeks
    ).toBe(4);
    expect(
      computeSignals({ ...baseInput, baselineActiveWeeks: 2 }).lifetimeWeeks
    ).toBe(2);
    // A brand-new user with no prior-window training → 0 (cold-start), NOT 4.
    expect(
      computeSignals({ ...baseInput, baselineActiveWeeks: 0 }).lifetimeWeeks
    ).toBe(0);
  });

  it("lifetimeWeeks CANNOT exceed 4 — the ceiling the client gate depends on", () => {
    /* The name says "lifetime" and the field is anything but: activeWeeks
       is a Set of 7-day bucket indices computed INSIDE the 28-day baseline
       window, so 4 is the maximum a user can ever reach — a decade of
       training and a perfect month score the same.

       Pinned HERE, against the running aggregator, rather than restated as
       a constant on the client: ADR-0008, reachability over prose. The
       client's `isEstablishingBaseline` treats 3 as "established", and that
       threshold is only defensible while the ceiling is 4. If the baseline
       window ever widens, this test fails first and points at the gate.

       It is also the test that would have caught the original defect. The
       client suite asserted the confident path with `lifetimeWeeks: 52` and
       `30`; nothing anywhere connected those fixtures to what the writer
       can emit, so a perfect-attendance gate read as "fewer than four weeks
       of history" for months. */
    const { aggregateWindow, baselineWindow, BASELINE_DAYS } = _internal;
    expect(BASELINE_DAYS).toBe(28);

    const { start, end } = baselineWindow("2026-05-19");
    // A session on EVERY day of the window — the most active a user can be.
    const workouts = [];
    for (let i = 0; i < BASELINE_DAYS + 7; i += 1) {
      const d = new Date(start.getTime() + i * 86400000);
      workouts.push({ date: d.toISOString().slice(0, 10), exercises: [] });
    }
    const agg = aggregateWindow(start, end, workouts, [], [], []);
    expect(agg.activeWeeks).toBeLessThanOrEqual(4);
    expect(agg.activeWeeks).toBe(4);
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

/* ── The deload transition guard's WIRING ────────────────────────────────
 *
 * `shouldRecommendDeload` fires on the transition into overreach, which needs
 * a THIRD reading (`weekBeforePreviousPI`) to tell "just crossed" from "has
 * been here for weeks". The guard itself is unit-tested from both sides in
 * src/lib/__tests__/deloadNagLoop.test.ts — but that drives `scorePerformance`
 * directly, so it cannot see whether the Cloud Function actually SUPPLIES the
 * third reading.
 *
 * That gap is not hypothetical: deleting the argument from the call site here
 * leaves every one of those twelve tests green, because the parameter simply
 * goes undefined and the guard falls back to its pre-fix behaviour — a steady
 * improver silently returns to a weekly deload banner.
 *
 * A source-level pin rather than an integration test, deliberately: the read
 * chain needs Firestore, and what can be lost here is a single argument. Same
 * technique as triggerMetadata.test.js.
 */
describe("computeAndWritePerformance — supplies both prior PIs", () => {
  const SOURCE = readFileSync(
    new URL("../performanceEngine.js", import.meta.url),
    "utf8"
  );

  it("reads the perf doc two windows back", () => {
    expect(SOURCE).toMatch(/dateKeyMinusN\(computeKey,\s*WINDOW_DAYS\s*\*\s*2\)/);
    expect(SOURCE).toContain("weekBeforePreviousPI = priorDeloadIndex(prev2Doc.data())");
  });

  it("reads BOTH priors in the units the deload trigger asks in", () => {
    /* The trigger's current reading is now `deloadIndex`, which differs from
       `performanceIndex` on a single-discipline week. Reading the priors as
       raw `performanceIndex` would compare a renormalised current against
       composite history — a silent unit mix, and the kind that reads fine.
       `priorDeloadIndex` falls back to `performanceIndex` for docs written
       before the field existed, so the transition is behaviour-preserving. */
    expect(SOURCE).toContain("previousComputePI = priorDeloadIndex(prevDoc.data())");
    expect(SOURCE).not.toMatch(/=\s*prevDoc\.data\(\)\.performanceIndex/);
    expect(SOURCE).not.toMatch(/=\s*prev2Doc\.data\(\)\.performanceIndex/);
  });

  it("persists deloadIndex so next week can compare like with like", () => {
    // Computed and then not written would leave the fallback permanently
    // engaged — correct-looking, and exactly the pre-fix behaviour.
    expect(SOURCE).toMatch(/const perfDoc = \{[\s\S]{0,400}?deloadIndex,/);
  });

  it("passes it to the scorer alongside the previous PI", () => {
    /* Both, in order — the guard reads its 4th and 5th parameters positionally,
       so dropping either one changes which reading lands where. */
    expect(SOURCE).toMatch(
      /previousComputePI,\s*\n\s*weekBeforePreviousPI\s*\n\s*\);/
    );
  });
});

describe("computeAndWritePerformance — scores against the target the user saw", () => {
  /* The precedence itself is pinned, and cross-checked against the client
     copy, in src/lib/__tests__/adaptiveTargetMirror.cross.test.ts. What that
     cannot see is whether this file actually CALLS it — and a resolution
     computed and then not passed through is exactly the shape that ships
     silently, since every existing test here would stay green.

     Source-level because the compute path needs the Admin SDK; the same
     approach the prior-PI wiring above uses. */
  const SOURCE = readFileSync(
    new URL("../performanceEngine.js", import.meta.url),
    "utf8"
  );

  it("resolves the scoring target from the profile and its effective tier", () => {
    expect(SOURCE).toContain('require("./lib/calorieTargetResolution")');
    expect(SOURCE).toMatch(
      /resolveScoringCalorieTarget\(\s*\n?\s*profile,\s*\n?\s*computeEffectiveTier\(profile\)/
    );
  });

  it("passes the RESOLVED target to the scorer, not the raw profile field", () => {
    expect(SOURCE).toMatch(/targetCalories:\s*scoringCalories,/);
    expect(SOURCE).not.toMatch(/targetCalories:\s*profile\.targetCalories,/);
  });

  it("falls back to null rather than a guess when no target resolves", () => {
    // computeAdherenceScore reads a falsy target as "drop the calorie factor".
    expect(SOURCE).toMatch(
      /scoringCalories\s*=\s*resolvedTarget\s*\?\s*resolvedTarget\.value\s*:\s*null/
    );
  });
});
