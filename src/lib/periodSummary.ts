/**
 * The Analytics overview's period summary (DS3): sessions, volume and
 * distance for the chosen range against the range before it, and the
 * sessions bar by bar.
 *
 * Every range is a ROLLING window ending today (History derives it with
 * `rollingWindowStart`), so the headings name a span of days rather than
 * a calendar month: on 16 September "This month" would head sixteen days,
 * and "Last 30 days" heads thirty. The wording moved here from the
 * rings card this replaced (PeriodOverview), which carried the reasoning
 * first.
 */
import { binKeyForDate } from "./chartGranularity";
import { addLocalDays, parseLocalDate, startOfLocalWeek } from "./dateHelpers";
import { buildDelta } from "./deltaFormat";

/** The heading for a range: the window it actually covers. */
export function rollingRangeLabel(range: string | undefined): string {
  switch (range) {
    case "1M":
      return "Last 30 days";
    case "3M":
      return "Last 3 months";
    case "6M":
      return "Last 6 months";
    case "1Y":
      return "Last 12 months";
    default:
      return "Last 7 days";
  }
}

/** What the changes are measured against: the same span, just before. */
export function previousRangeLabel(range: string | undefined): string {
  switch (range) {
    case "1M":
      return "the 30 days before";
    case "3M":
      return "the 3 months before";
    case "6M":
      return "the 6 months before";
    case "1Y":
      return "the 12 months before";
    default:
      return "the 7 days before";
  }
}

export type SummaryGranularity = "daily" | "weekly" | "monthly";

/**
 * One bar per day across a week, per week up to three months, per month
 * beyond. Coarser than the charts' `granularityForRange` at 1M on
 * purpose: thirty daily bars of one or two sessions read as noise, and
 * the question this card answers is how the weeks went.
 */
export function summaryGranularity(rangeDays: number): SummaryGranularity {
  if (rangeDays <= 7) return "daily";
  if (rangeDays <= 90) return "weekly";
  return "monthly";
}

export interface SummaryBin {
  /** The bin's first local day, "YYYY-MM-DD". */
  key: string;
  lifts: number;
  runs: number;
  /** The bin that holds today. */
  current: boolean;
}

function binStart(d: Date, granularity: SummaryGranularity): Date {
  if (granularity === "daily")
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (granularity === "weekly") return startOfLocalWeek(d);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function nextBin(d: Date, granularity: SummaryGranularity): Date {
  if (granularity === "daily") return addLocalDays(d, 1);
  if (granularity === "weekly") return addLocalDays(d, 7);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/**
 * Every bin from the window's first day to today, empty ones included —
 * a week without a session is part of the story, not a gap to close up.
 * Dates are local "YYYY-MM-DD" keys already inside the window.
 */
export function summaryBins({
  since,
  today,
  liftDates,
  runDates,
  granularity,
}: {
  since: Date;
  today: Date;
  liftDates: readonly string[];
  runDates: readonly string[];
  granularity: SummaryGranularity;
}): SummaryBin[] {
  const lifts = new Map<string, number>();
  const runs = new Map<string, number>();
  const bump = (map: Map<string, number>, date: string) => {
    const key = binKeyForDate(parseLocalDate(date), granularity);
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const date of liftDates) bump(lifts, date);
  for (const date of runDates) bump(runs, date);

  const currentKey = binKeyForDate(today, granularity);
  const bins: SummaryBin[] = [];
  for (
    let cursor = binStart(since, granularity);
    cursor <= today;
    cursor = nextBin(cursor, granularity)
  ) {
    const key = binKeyForDate(cursor, granularity);
    bins.push({
      key,
      lifts: lifts.get(key) ?? 0,
      runs: runs.get(key) ?? 0,
      current: key === currentKey,
    });
  }
  return bins;
}

export interface SummaryChange {
  direction: "up" | "down";
  /** "2" for a count, "6%" for a total. */
  text: string;
}

/**
 * A change in a COUNT, as a count: two more sessions reads better than
 * "12%", and a count needs no denominator, so it survives a previous
 * range with none. Unknown previous (a read that failed) says nothing.
 */
export function countChange(
  current: number,
  previous: number | null
): SummaryChange | null {
  if (previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  return { direction: diff > 0 ? "up" : "down", text: String(Math.abs(diff)) };
}

/**
 * A change in a TOTAL, as a percentage, through the shared `buildDelta`
 * rules: nothing from a zero base, nothing under 1%.
 */
export function percentChange(
  current: number,
  previous: number | null
): SummaryChange | null {
  if (previous === null) return null;
  const delta = buildDelta(current, previous);
  if (!delta) return null;
  return { direction: delta.positive ? "up" : "down", text: delta.value };
}
