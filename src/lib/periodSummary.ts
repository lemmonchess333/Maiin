/**
 * The Analytics overview's period summary (DS3): sessions, volume and
 * distance for the chosen range against the range before it, and each of
 * the three bar by bar.
 *
 * Every range is a ROLLING window ending today (History derives it with
 * `rollingWindowStart`), so the headings name a span of days rather than
 * a calendar month: on 16 September "This month" would head sixteen days,
 * and "Last 30 days" heads thirty. The wording moved here from the
 * rings card this replaced (PeriodOverview), which carried the reasoning
 * first.
 */
import { binKeyForDate, formatBinLabel } from "./chartGranularity";
import { addLocalDays, parseLocalDate, startOfLocalWeek } from "./dateHelpers";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";
import { abbreviateK, formatDayMonth } from "@/utils/formatters";

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
 * beyond. Thirty daily bars of one or two sessions read as noise; the
 * question these cards answer is how the weeks went.
 */
export function summaryGranularity(rangeDays: number): SummaryGranularity {
  if (rangeDays <= 7) return "daily";
  if (rangeDays <= 90) return "weekly";
  return "monthly";
}

/** A bin's name on the axis and to a screen reader: "Today", "Mon",
 *  "This week", "14 Sept", "This month", "Aug". */
export function summaryBinLabel(
  bin: { key: string; current: boolean },
  granularity: SummaryGranularity
): string {
  if (granularity === "daily") {
    return bin.current
      ? "Today"
      : parseLocalDate(bin.key).toLocaleDateString("en-GB", {
          weekday: "short",
        });
  }
  if (granularity === "weekly") {
    return bin.current ? "This week" : formatDayMonth(parseLocalDate(bin.key));
  }
  return bin.current ? "This month" : formatBinLabel(bin.key, "monthly");
}

export interface SummaryBin {
  /** The bin's first local day, "YYYY-MM-DD". */
  key: string;
  lifts: number;
  runs: number;
  /** Kilograms lifted in the bin. */
  volumeKg: number;
  /** Metres run in the bin. */
  distanceM: number;
  /** The bin that holds today. */
  current: boolean;
}

/** A session as the card counts it: its local day and what it moved. */
export interface SummaryLift {
  /** Local "YYYY-MM-DD", already inside the window. */
  date: string;
  volumeKg: number;
}

export interface SummaryRun {
  /** Local "YYYY-MM-DD", already inside the window. */
  date: string;
  distanceM: number;
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
 * Each bin carries its count, kilograms and metres, so the card can draw
 * any of the three without a second pass over the sessions.
 */
export function summaryBins({
  since,
  today,
  lifts,
  runs,
  granularity,
}: {
  since: Date;
  today: Date;
  lifts: readonly SummaryLift[];
  runs: readonly SummaryRun[];
  granularity: SummaryGranularity;
}): SummaryBin[] {
  const byKey = new Map<
    string,
    { lifts: number; runs: number; volumeKg: number; distanceM: number }
  >();
  const slot = (date: string) => {
    const key = binKeyForDate(parseLocalDate(date), granularity);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { lifts: 0, runs: 0, volumeKg: 0, distanceM: 0 };
      byKey.set(key, entry);
    }
    return entry;
  };
  for (const lift of lifts) {
    const entry = slot(lift.date);
    entry.lifts += 1;
    entry.volumeKg += Number.isFinite(lift.volumeKg) ? lift.volumeKg : 0;
  }
  for (const run of runs) {
    const entry = slot(run.date);
    entry.runs += 1;
    entry.distanceM += Number.isFinite(run.distanceM) ? run.distanceM : 0;
  }

  const currentKey = binKeyForDate(today, granularity);
  const bins: SummaryBin[] = [];
  for (
    let cursor = binStart(since, granularity);
    cursor <= today;
    cursor = nextBin(cursor, granularity)
  ) {
    const key = binKeyForDate(cursor, granularity);
    const entry = byKey.get(key);
    bins.push({
      key,
      lifts: entry?.lifts ?? 0,
      runs: entry?.runs ?? 0,
      volumeKg: entry?.volumeKg ?? 0,
      distanceM: entry?.distanceM ?? 0,
      current: key === currentKey,
    });
  }
  return bins;
}

export interface SummaryChange {
  direction: "up" | "down";
  /** The amount it moved, in the figure's own terms: "2", "3.4k kg",
   *  "41.0 km". */
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

/*
 * The totals change by an AMOUNT, not a percentage. A percentage off a
 * small base is noise that reads as a machine talking: a month back from
 * an injury said "373%" over 52 km. "41.0 km" says what moved, needs no
 * base, and so also works after a range with nothing in it. Each amount
 * is rounded as its figure is, so a change never claims a move the
 * figure above it cannot show.
 */

/** A change in kilograms lifted: "850 kg", "3.4k kg". */
export function volumeChange(
  currentKg: number,
  previousKg: number | null
): SummaryChange | null {
  if (previousKg === null) return null;
  const diff = currentKg - previousKg;
  // The figure reads "52.8k" past a tonne, so it moves in 100 kg steps.
  const step = Math.max(currentKg, previousKg) >= 1000 ? 100 : 1;
  const amount = Math.round(Math.abs(diff) / step) * step;
  if (amount === 0) return null;
  return {
    direction: diff > 0 ? "up" : "down",
    text: `${abbreviateK(amount)} kg`,
  };
}

/** A change in distance run, in the reader's unit: "41.0 km", "2.3 mi". */
export function distanceChange(
  currentM: number,
  previousM: number | null,
  unit: DistanceUnit
): SummaryChange | null {
  if (previousM === null) return null;
  const diff = distanceIn(currentM, unit) - distanceIn(previousM, unit);
  // The figure has one decimal place, so the change does too.
  const amount = Math.round(Math.abs(diff) * 10) / 10;
  if (amount === 0) return null;
  return {
    direction: diff > 0 ? "up" : "down",
    text: `${amount.toFixed(1)} ${distanceUnitLabel(unit)}`,
  };
}

/** The fewest whole bins an average is taken over: one week is that
 *  week, not an average of anything. */
export const USUAL_BIN_MIN_BINS = 2;

/**
 * The usual bin: the mean of the range's bins that are over and that the
 * user could have trained all of. The current bin is part-done and would
 * pull it down; the range's first bin is usually cut by the range's start;
 * a bin that began before the user's first session holds days before they
 * started. Null with fewer than `USUAL_BIN_MIN_BINS` left, rather than an
 * average of one week, or of nothing.
 */
export function usualBinAmount(
  bins: readonly SummaryBin[],
  amount: (bin: SummaryBin) => number,
  {
    sinceKey,
    firstSessionKey,
  }: { sinceKey: string; firstSessionKey: string | null }
): number | null {
  if (!firstSessionKey) return null;
  const whole = bins.filter(
    (b) => !b.current && b.key >= sinceKey && b.key >= firstSessionKey
  );
  if (whole.length < USUAL_BIN_MIN_BINS) return null;
  return whole.reduce((sum, b) => sum + amount(b), 0) / whole.length;
}
