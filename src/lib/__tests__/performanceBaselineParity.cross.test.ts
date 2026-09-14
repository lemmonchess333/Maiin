/**
 * The two PI baselines must describe the same athlete.
 *
 * `scorePerformance` is already pinned across the client/server copies by
 * `performanceEngineParity.cross.test.ts`. That test deliberately starts
 * AFTER the baseline, because the two engines build one from different raw
 * material: the client folds an array of prior weekly aggregates
 * (`computeBaseline`), the server aggregates a rolling 28-day window and
 * normalises it to a per-week equivalent (`computeBaselineFromAgg`).
 *
 * Different derivations, but they answer the same question — "what is a
 * typical week for this athlete?" — and they feed the identical scorer. So
 * their OUTPUT has to agree, and until now nothing said so. Each copy was
 * pinned against its own fixtures on its own side of the mirror, which is the
 * arrangement this codebase has been burned by before: two green suites, no
 * statement that the two answers match.
 *
 * It matters because the gap was real. PERF-L (#1107) recorded the server
 * keeping the single longest run across its whole window while the client
 * averaged each week's longest — a baseline that is systematically larger,
 * so the authoritative rollup scored `longRatio` colder than the preview the
 * user had just been shown on Home. The server was later reconciled to the
 * mean, and `runLongKmWeeklySum` exists for exactly that. The reconciliation
 * was left resting on two comments.
 *
 * The cases below are the ones where a plausible re-implementation diverges:
 * a lift-only week (counts in the divisor, contributes no run distance), a
 * fully idle week (counts in neither), and unequal weekly long runs (mean vs
 * max). `weeksUsed` rides along because it gates deload suppression and had
 * its own drift, PERF-M.
 *
 * Not asserted here: nutrition and bodyweight, which the server's baseline
 * does not carry at all — the scorer reads those from the CURRENT window.
 */
import { describe, it, expect } from "vitest";
import Module, { createRequire } from "node:module";
import { computeBaseline } from "../performanceEngine";
import type { WeeklyAggregates } from "../performanceTypes";

const require = createRequire(import.meta.url);

/* `functions/performanceEngine.js` calls `admin.firestore()` at module load
   and is not admin-free the way `lib/perfScoring.js` is, so requiring it
   needs the same specifier stub `adminAuthMirror.cross.test.ts` uses. The
   stub covers module-load side effects only; `computeBaselineFromAgg` is a
   pure function of its argument and touches neither Firestore nor logging,
   so nothing under test is faked out. */
type Loader = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const loaderHost = Module as unknown as { _load: Loader };
const realLoad = loaderHost._load;
loaderHost._load = function (request, ...rest) {
  if (request === "firebase-admin") {
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

interface ServerBaseline {
  liftTonnage: number;
  liftHardSets: number;
  runKm: number;
  runLongKm: number;
  weeksUsed: number;
}
const computeBaselineFromAgg = serverEngine._internal
  .computeBaselineFromAgg as (agg: Record<string, number>) => ServerBaseline;

/** One week of training, in the shape the CLIENT folds. */
function week(over: Partial<WeeklyAggregates> = {}): WeeklyAggregates {
  return {
    weekKey: "2026-05-11",
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
    ...over,
  };
}

/**
 * The SAME weeks, expressed the way the server's window aggregator emits
 * them: 28 days of totals plus the two counters the baseline divides by.
 *
 * This is the translation between the two raw materials, and it is the only
 * place the test could cheat — so it derives every field by summing the
 * weeks rather than restating an expected answer. `runLongKmWeeklySum` adds
 * up each week's longest run; `activeWeeks` counts weeks carrying any
 * session at all, lift or run, which is precisely the client's `valid`
 * filter.
 */
function toServerAgg(weeks: WeeklyAggregates[]): Record<string, number> {
  const active = weeks.filter((w) => w.liftSessions > 0 || w.runSessions > 0);
  const sum = (pick: (w: WeeklyAggregates) => number) =>
    weeks.reduce((s, w) => s + pick(w), 0);
  return {
    liftTonnage: sum((w) => w.liftTonnage),
    liftHardSets: sum((w) => w.liftHardSets),
    runKm: sum((w) => w.runKm),
    // The single longest run anywhere in the window — the field the server
    // used to build its baseline from, kept because legacy aggregates written
    // before the weekly sum existed still fall back to it.
    runLongKm: Math.max(0, ...weeks.map((w) => w.runLongKm)),
    runLongKmWeeklySum: sum((w) => w.runLongKm),
    activeWeeks: active.length,
    dayCount: 28,
  };
}

interface Scenario {
  name: string;
  weeks: WeeklyAggregates[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "four identical weeks",
    weeks: Array.from({ length: 4 }, () =>
      week({
        liftTonnage: 9000,
        liftHardSets: 36,
        liftSessions: 3,
        runKm: 22,
        runLongKm: 11,
        runSessions: 3,
      })
    ),
  },
  {
    name: "unequal long runs — a mean and a max part company here",
    weeks: [
      week({ runKm: 30, runLongKm: 21, runSessions: 4 }),
      week({ runKm: 18, runLongKm: 8, runSessions: 3 }),
      week({ runKm: 20, runLongKm: 10, runSessions: 3 }),
      week({ runKm: 16, runLongKm: 6, runSessions: 2 }),
    ],
  },
  {
    name: "a lift-only week counts in the divisor but adds no distance",
    weeks: [
      week({ runKm: 24, runLongKm: 12, runSessions: 3 }),
      week({ liftTonnage: 11000, liftHardSets: 44, liftSessions: 4 }),
      week({ runKm: 20, runLongKm: 9, runSessions: 3 }),
    ],
  },
  {
    name: "an idle week counts in neither",
    weeks: [
      week({ runKm: 24, runLongKm: 12, runSessions: 3 }),
      week(),
      week({ runKm: 18, runLongKm: 8, runSessions: 2 }),
    ],
  },
  {
    name: "a hybrid athlete — both disciplines every week",
    weeks: [
      week({
        liftTonnage: 12000,
        liftHardSets: 48,
        liftSessions: 4,
        runKm: 35,
        runLongKm: 16,
        runSessions: 4,
      }),
      week({
        liftTonnage: 8000,
        liftHardSets: 30,
        liftSessions: 3,
        runKm: 28,
        runLongKm: 13,
        runSessions: 3,
      }),
    ],
  },
  {
    name: "a single week of training",
    weeks: [week({ runKm: 12, runLongKm: 7, runSessions: 2 })],
  },
];

describe("PI baseline — client and server describe the same athlete", () => {
  SCENARIOS.forEach(({ name, weeks }) => {
    it(name, () => {
      const client = computeBaseline(weeks);
      const server = computeBaselineFromAgg(toServerAgg(weeks));

      expect(server.liftTonnage).toBeCloseTo(client.liftTonnage, 6);
      expect(server.liftHardSets).toBeCloseTo(client.liftHardSets, 6);
      expect(server.runKm).toBeCloseTo(client.runKm, 6);
      expect(server.runLongKm).toBeCloseTo(client.runLongKm, 6);
      expect(server.weeksUsed).toBe(client.weeksUsed);
    });
  });

  it("no scenario is vacuously equal", () => {
    /* Every assertion above would also pass if both copies returned zero for
       everything, which is the shape a broken stub or an empty fixture takes.
       Each scenario must put a real number on the field it exists to test. */
    SCENARIOS.forEach(({ name, weeks }) => {
      const bl = computeBaseline(weeks);
      expect(bl.weeksUsed, name).toBeGreaterThan(0);
      expect(bl.runLongKm + bl.liftTonnage, name).toBeGreaterThan(0);
    });
  });

  it("the long-run baseline is a mean of weekly maxes, not a window max", () => {
    /* The literal that makes the equality assertions above mean something.
       Without it "both agree" is satisfied by both copies adopting the wrong
       rule together — and a window max is exactly the wrong rule the server
       shipped: these weeks would give 21 rather than 11.25. */
    const weeks = SCENARIOS[1].weeks;
    expect(computeBaseline(weeks).runLongKm).toBeCloseTo(11.25, 6);
    expect(computeBaselineFromAgg(toServerAgg(weeks)).runLongKm).toBeCloseTo(
      11.25,
      6
    );
    expect(Math.max(...weeks.map((w) => w.runLongKm))).toBe(21);
  });

  it("an idle week does not deflate the per-week divisor", () => {
    /* PERF-M's shape: dividing by CALENDAR weeks rather than ACTIVE ones
       makes every ratio look hotter for anyone returning from a gap. Three
       calendar weeks, two of them trained. */
    const weeks = SCENARIOS[3].weeks;
    expect(computeBaseline(weeks).weeksUsed).toBe(2);
    expect(computeBaselineFromAgg(toServerAgg(weeks)).weeksUsed).toBe(2);
    expect(weeks).toHaveLength(3);
  });
});
