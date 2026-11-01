/**
 * What a person's saved runs say they have done lately, for a plan that
 * moves on from what was done rather than from the calendar.
 *
 * The runs are the recent ones the app already reads for the layoff
 * (`fetchRecentRunning`, the latest `RECENT_RUN_SCAN_LIMIT`), dated by their
 * Lift3 day and judged by the shared `isVolumeEligible`. Someone running
 * every day for four weeks has more runs than that read holds; the oldest
 * then go unseen, which can only make the longest run read shorter.
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import type { DatedRun } from "./layoffDetection";

/**
 * A week is done with two or more saved runs dated in it, as Run9's starter
 * counts a week (STATUS 2026-11-01: "with two a week, both"). One
 * definition, read by the running starting point's climb and there for the
 * starter's stages.
 */
export const DONE_WEEK_RUNS = 2;

/** How far back a run counts as recent: four weeks, the window the starting
 *  point is filled from (`recentRunningContext`). */
export const RECENT_RUN_DAYS = 28;

const shift = (key: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(key), days));

const eligible = (runs: readonly DatedRun[]) =>
  runs.filter((run) => !!run?.date && isVolumeEligible(run));

/** Whether the week starting `weekKey` was done: `DONE_WEEK_RUNS` or more
 *  saved runs dated in it. */
export function isWeekDone(
  runs: readonly DatedRun[],
  weekKey: string
): boolean {
  const last = shift(weekKey, 6);
  return (
    eligible(runs).filter((run) => run.date! >= weekKey && run.date! <= last)
      .length >= DONE_WEEK_RUNS
  );
}

/**
 * The runs of the `RECENT_RUN_DAYS` before `beforeKey`: the longest one's
 * minutes, the farthest one's km, the most minutes one of its four weeks
 * ran besides that week's longest run, and the pace of them all together
 * (seconds a km), each null with none. The weeks are the seven days ending
 * at `beforeKey`, the seven before them, and so on. A pace outside 2:30 to
 * 20:00 a km is a recording, not a run, and is left out.
 */
export function recentRunning(
  runs: readonly DatedRun[],
  beforeKey: string
): {
  longestMinutes: number | null;
  longestKm: number | null;
  otherMinutes: number | null;
  paceSPerKm: number | null;
} {
  const from = shift(beforeKey, -RECENT_RUN_DAYS);
  const recent = eligible(runs).filter(
    (run) => run.date! >= from && run.date! < beforeKey
  );
  if (recent.length === 0)
    return {
      longestMinutes: null,
      longestKm: null,
      otherMinutes: null,
      paceSPerKm: null,
    };
  const minutes = (run: DatedRun) => (run.duration ?? 0) / 60;
  const seconds = recent.reduce((sum, run) => sum + (run.duration ?? 0), 0);
  const km = recent.reduce((sum, run) => sum + (run.distance ?? 0), 0) / 1000;
  const pace = km > 0 ? seconds / km : NaN;
  const weeks = Array.from({ length: RECENT_RUN_DAYS / 7 }, (_, i) => {
    const start = shift(beforeKey, -7 * (i + 1));
    const end = shift(beforeKey, -7 * i);
    return recent
      .filter((run) => run.date! >= start && run.date! < end)
      .map(minutes);
  });
  return {
    longestMinutes: Math.max(...recent.map(minutes)),
    longestKm: Math.max(...recent.map((run) => (run.distance ?? 0) / 1000)),
    otherMinutes: Math.max(
      ...weeks.map((week) =>
        week.length === 0
          ? 0
          : week.reduce((sum, m) => sum + m, 0) - Math.max(...week)
      )
    ),
    paceSPerKm: pace >= 150 && pace <= 1200 ? pace : null,
  };
}
