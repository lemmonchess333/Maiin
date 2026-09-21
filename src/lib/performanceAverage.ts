import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

/**
 * The Performance Index average — P2d's "12-week rolling average", which
 * the lock specified and which shipped as a figure that is not it.
 *
 * Two pins decide the arithmetic, and the card on the Performance tab
 * obeyed neither:
 *
 *   (1) "Available-weeks-up-to-12 rolling average — user with 5 weeks
 *       shows 5-week average … honest about sample size"
 *   (3) "Average computed only from weeks with `confidence >= 'medium'`
 *       — inactive weeks excluded … honest representation for
 *       return-from-break users"
 *
 * What was there averaged every fetched week under a label reading
 * "Avg PI (12w)". A user three weeks in read "12w" over a three-week
 * mean, and anyone back from a break had their silent weeks dragging the
 * figure down — the two cases the pins name by hand.
 *
 * WHAT "ACTIVE" MEANS, precisely, because the word is doing real work.
 * `computeConfidence` counts signals: a lift session, a run session,
 * three logged meal days, a recent bodyweight entry, a mature baseline.
 * Two or more is `medium`. So a week with no training and no food scores
 * at most one and reads `low` — that is the inactive week the pin
 * excludes. The cost, stated rather than discovered later: a brand-new
 * user's first week can also read `low` (one run, nothing else, no
 * baseline yet), so the average stays empty a little longer than the
 * chart does. That is the honest side to be wrong on.
 *
 * WHY THE WINDOW IS WRITTEN AS A TRAILING ONE when the caller fetches
 * exactly twelve weeks. At that fetch size a trailing-twelve mean and an
 * expanding mean are the same number, so the cap changes nothing today.
 * It is written as a cap anyway because the fetch size is a caller's
 * choice (`usePerformanceWeeks(12)`) and the twelve is the lock's, not
 * the query's — raise the query and the average must not quietly become
 * a lifetime mean.
 */

/** The lock's window. Twelve ACTIVE weeks, or as many as exist. */
export const AVERAGE_MAX_WEEKS = 12;

/** Minimum confidence a week needs to count. `low` is the inactive read. */
export function isActiveWeek(week: PerformanceWeekDoc): boolean {
  /* Absent is NOT low. Pre-confidence documents predate the field
     entirely, and treating a missing value as inactive would empty the
     average for every account with history older than the field. The
     stored value only excludes a week when it is explicitly `low`. */
  return week.confidence !== "low";
}

/**
 * The weeks the average is computed from — active only, oldest first, at
 * most `AVERAGE_MAX_WEEKS`, taken from the END of the series so the
 * window is the most recent one.
 */
export function activeWeeksForAverage(
  weeks: readonly PerformanceWeekDoc[]
): PerformanceWeekDoc[] {
  return weeks.filter(isActiveWeek).slice(-AVERAGE_MAX_WEEKS);
}

/** The figure itself, rounded, or null when no week qualifies. */
export function averagePerformanceIndex(
  weeks: readonly PerformanceWeekDoc[]
): number | null {
  const active = activeWeeksForAverage(weeks);
  if (active.length === 0) return null;
  const total = active.reduce((sum, w) => sum + (w.performanceIndex || 0), 0);
  return Math.round(total / active.length);
}

/** How many weeks the figure above actually covers — the number a label
 *  beside it has to name, rather than the window's ceiling. */
export function averageWeekCount(weeks: readonly PerformanceWeekDoc[]): number {
  return activeWeeksForAverage(weeks).length;
}

/**
 * The trailing average AT each week, for the dashed line pin 5 asks for
 * ("dashed muted-gray average line vs solid colored PI series").
 *
 * Every point is the mean of the active weeks at or before it, capped at
 * twelve. An inactive week contributes nothing but does NOT break the
 * line: it carries the previous value forward, because the baseline is a
 * property of the history rather than of that week. A week with no
 * active week anywhere behind it has no baseline at all and returns
 * null, which Recharts draws as a gap rather than as a zero.
 */
export function rollingAverageSeries(
  weeks: readonly PerformanceWeekDoc[]
): (number | null)[] {
  const window: number[] = [];
  return weeks.map((week) => {
    if (isActiveWeek(week)) {
      window.push(week.performanceIndex || 0);
      if (window.length > AVERAGE_MAX_WEEKS) window.shift();
    }
    if (window.length === 0) return null;
    return Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  });
}

/**
 * The sentence under the chart. Pin 6 puts it in the tertiary register —
 * "average is context not headline" — and pin 3 fixes the wording on
 * "active weeks", which is what makes the number defensible when a
 * user's history has holes in it.
 */
export function averageCaption(value: number, weekCount: number): string {
  const weeks = weekCount === 1 ? "week" : "weeks";
  return `Average ${value} over your last ${weekCount} active ${weeks}`;
}
