import { useMemo } from "react";
import { isVolumeEligible } from "../lib/runStatsEligibility";
import {
  localDateString,
  parseLocalDate,
  rollingWindowStart,
} from "../lib/dateHelpers";
import { binKeyForDate, type ChartGranularity } from "../lib/chartGranularity";
import { useLocalDateKey } from "./useLocalDateKey";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import {
  parseSavedRun,
  type RunSummaryItem,
  type RunWindow,
} from "@/lib/savedRuns";
import { useSavedRuns } from "./useSavedRuns";

export type { RunSummaryItem, SavedRun } from "@/lib/savedRuns";

/** The saved-run parser, under the name its older callers import.
 *  `src/lib/savedRuns.ts` owns it. */
export const parseRunSummary = parseSavedRun;

export interface RunningWeekData {
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}

/**
 * Bucket a flat run list into Monday-anchored weeks. Pure function —
 * extracted so the bug it carries is unit-testable without mocking
 * Firestore + auth + the hook lifecycle.
 *
 * Volume eligibility is applied internally so the hook can return
 * the unfiltered `runs` array for transparency UI (Recent Runs
 * showing invalid/saved-anyway records with badges) while keeping
 * the weekly tile aggregations honest. A run that fails
 * `isVolumeEligible` contributes nothing to count, distance, or
 * pace this week.
 */
export function aggregateRunBins(
  runs: RunSummaryItem[],
  granularity: ChartGranularity = "weekly"
): RunningWeekData[] {
  const weeks: Record<
    string,
    { distance: number; count: number; paceKmSum: number; paceKm: number }
  > = {};
  for (const run of runs) {
    if (!isVolumeEligible(run)) continue;
    // Pure LOCAL date math, through the shared binner. At "weekly" this is
    // `localWeekKey` — the Monday-start key the axis and the sparkline both
    // read. Mixing local getDay()/setDate() with a UTC toISOString() key put
    // runs logged near midnight in non-UTC zones in the wrong week.
    const key = binKeyForDate(
      parseLocalDate(runEvidenceDate(run)),
      granularity
    );
    if (!weeks[key])
      weeks[key] = { distance: 0, count: 0, paceKmSum: 0, paceKm: 0 };
    weeks[key].distance += run.distance / 1000;
    weeks[key].count += 1;
    if (run.distance > 0 && run.avgPace > 0) {
      // Distance-weight each run's pace. An unweighted mean of per-run
      // paces let a 1 km recovery jog move the week's "avg pace" as much
      // as a 20 km long run — the classic average-of-averages skew.
      weeks[key].paceKmSum += run.avgPace * (run.distance / 1000);
      weeks[key].paceKm += run.distance / 1000;
    }
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      totalDistance: Math.round(d.distance * 10) / 10,
      runCount: d.count,
      avgPace: d.paceKm > 0 ? Math.round(d.paceKmSum / d.paceKm) : 0,
    }));
}

/**
 * The weekly call, kept as the name every existing consumer uses — and as
 * ONE implementation rather than two. History's distance sparkline walks
 * `localWeekKey` values, so its input must stay weekly whatever the chart
 * beneath it is binning.
 */
export function aggregateWeeklyData(runs: RunSummaryItem[]): RunningWeekData[] {
  return aggregateRunBins(runs, "weekly");
}

/**
 * `days` is a rolling window of exactly that many dates, ENDING TODAY —
 * so `useRunningStats(7)` covers today and the six days before it. A run
 * belongs to the day it started (Lift3), so a run begun before the window's
 * first midnight is not in it even when it finished inside.
 *
 * The reading itself (query, parse, unsynced runs, failure, evidence) is
 * `useSavedRuns`; this adds the Monday weeks.
 */
export function useRunningStats(days: number = 30) {
  const today = useLocalDateKey();
  const window = useMemo<RunWindow>(
    () => ({
      since: localDateString(rollingWindowStart(days, parseLocalDate(today))),
    }),
    [days, today]
  );
  const { runs, loading, failed, evidenceReady, refresh } =
    useSavedRuns(window);
  const weeklyData = useMemo(() => aggregateWeeklyData(runs), [runs]);
  return {
    /** Monday weeks, always. */
    weeklyData,
    runs,
    loading,
    /** True when the last read threw. Distinguishes "we couldn't load
     *  your runs" from "you have no runs" — the two are otherwise the
     *  same `runs: []`. */
    failed,
    /** History can display cached/queued facts, but coaching must not treat
     * a partial or failed query as a complete, current evidence window. */
    evidenceReady,
    /** Hist4: restarts the underlying live query. Used by the
     *  History page's pull-to-refresh gesture; the other History
     *  data sources (useWorkouts, useMeals) are onSnapshot listeners
     *  so they're already live. The loading flag reports the new subscription, while
     *  existing same-account rows remain visible. */
    refresh,
  };
}
