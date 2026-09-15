import { describe, it, expect } from "vitest";
import {
  aggregateRunBins,
  aggregateWeeklyData,
  type RunSummaryItem,
} from "@/hooks/useRunningStats";

/**
 * The run aggregator bins at the granularity the window asks for.
 *
 * It only ever bucketed Monday weeks, which was fine while the chart it
 * feeds asked for a fixed 90 days. Once that chart started honouring the
 * page's time range, weekly bins over a year became the "~52 unreadable
 * bars" Hist5c pin 7 already moved the lifting volume chart off — so the
 * running chart would have inherited the defect the moment it was fixed.
 *
 * `aggregateWeeklyData` is now literally `aggregateRunBins(runs,
 * "weekly")` rather than a second implementation, because History's
 * distance sparkline walks `localWeekKey` values and must keep weekly
 * bins whatever the chart beneath it is drawing. The last test here is
 * what stops those two drifting apart again.
 */
function run(dateKey: string, km: number, paceSec = 300): RunSummaryItem {
  return {
    id: `${dateKey}-${km}`,
    distance: km * 1000,
    duration: Math.round(km * paceSec),
    avgPace: paceSec,
    elevationGain: 0,
    calories: 0,
    activityType: "outdoor",
    completedAt: new Date(`${dateKey}T09:00:00`),
    date: dateKey,
    relativeEffort: null,
  };
}

/* Three runs inside one calendar week (Mon 3 Aug 2026 .. Sun 9 Aug), and
   one in the following month. */
const RUNS = [
  run("2026-08-03", 5),
  run("2026-08-05", 8),
  run("2026-08-08", 12),
  run("2026-09-02", 6),
];

describe("aggregateRunBins", () => {
  it("keeps every run on its own day at daily granularity", () => {
    const bins = aggregateRunBins(RUNS, "daily");
    expect(bins.map((b) => b.week)).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-08",
      "2026-09-02",
    ]);
    expect(bins.map((b) => b.totalDistance)).toEqual([5, 8, 12, 6]);
  });

  it("collapses a calendar week into its Monday at weekly granularity", () => {
    const bins = aggregateRunBins(RUNS, "weekly");
    expect(bins.map((b) => b.week)).toEqual(["2026-08-03", "2026-08-31"]);
    // 5 + 8 + 12 — and the 8th is a Saturday, the case a Sunday-anchored
    // week would have split off into a bin of its own.
    expect(bins[0].totalDistance).toBe(25);
    expect(bins[0].runCount).toBe(3);
  });

  it("collapses to the first of the month at monthly granularity", () => {
    const bins = aggregateRunBins(RUNS, "monthly");
    expect(bins.map((b) => b.week)).toEqual(["2026-08-01", "2026-09-01"]);
    expect(bins.map((b) => b.totalDistance)).toEqual([25, 6]);
    expect(bins.map((b) => b.runCount)).toEqual([3, 1]);
  });

  it("distance-weights pace inside a bin, at every granularity", () => {
    // 4 km at 6:00 and 16 km at 5:00 → 5:12, not the 5:30 an unweighted
    // mean of the two paces would give.
    const mixed = [run("2026-08-03", 4, 360), run("2026-08-04", 16, 300)];
    for (const g of ["daily", "weekly", "monthly"] as const) {
      const bins = aggregateRunBins(mixed, g);
      const weighted = bins.reduce(
        (s, b) => s + b.avgPace * b.totalDistance,
        0
      );
      const km = bins.reduce((s, b) => s + b.totalDistance, 0);
      expect(Math.round(weighted / km)).toBe(312);
    }
    expect(aggregateRunBins(mixed, "weekly")[0].avgPace).toBe(312);
  });

  it("defaults to weekly, and aggregateWeeklyData is that same call", () => {
    expect(aggregateRunBins(RUNS)).toEqual(aggregateRunBins(RUNS, "weekly"));
    // The anti-drift assertion: one implementation, not two.
    expect(aggregateWeeklyData(RUNS)).toEqual(aggregateRunBins(RUNS, "weekly"));
    // …and weekly must NOT quietly become something else, which an
    // equality between two aliases of the same function cannot see.
    expect(aggregateWeeklyData(RUNS).map((b) => b.week)).toEqual([
      "2026-08-03",
      "2026-08-31",
    ]);
  });
});
