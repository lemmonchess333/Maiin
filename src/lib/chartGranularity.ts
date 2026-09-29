/* ─────────────────────────────────────────────
   Chart bins: the day, Monday week or month a date falls in, and a
   bin's axis label.

   The Analytics period cards bin through `binKeyForDate`
   (`periodSummary`), as does the weekly run aggregation
   (`useRunningStats`); every date axis on the page labels its ticks
   with `formatBinLabel`, so a bar's bin and its label agree.
   ───────────────────────────────────────────── */

import { localDateString, localWeekKey } from "./dateHelpers";

export type ChartGranularity = "daily" | "weekly" | "monthly";

/**
 * Compute the bin key for `date` under the chosen granularity.
 * Returns a local date string (`YYYY-MM-DD`) — the first day of
 * the bin (the day itself for daily, the Monday of the week for
 * weekly, the 1st of the month for monthly).
 *
 * LOCAL, deliberately. This was UTC-anchored (`toISOString`), on the
 * reasoning that "the key is stable regardless of the caller's local
 * timezone". Stability of the function is the wrong invariant: what
 * matters is that every caller's key means the same DAY, and the days
 * this app bins are local ones — a workout's `date` is a local
 * "YYYY-MM-DD" string, and a user's Sunday session belongs to their
 * Sunday.
 *
 * The bug that reasoning produced: History fed this function two
 * different KINDS of Date. The data side did `new Date(w.date)`, which
 * parses "YYYY-MM-DD" as UTC midnight; the axis side built a local
 * wall-clock cursor. Under UTC anchoring those two agree only where
 * the offset happens to keep them on the same UTC day — so at UTC+10
 * and beyond the axis sat a full week behind the data and the current
 * week's sparkline bar read zero, permanently, for every user in
 * Australia and New Zealand. At UTC+9 it depended on the time of day.
 *
 * Anchoring locally makes the key depend only on the calendar day the
 * user experienced, so both call sites agree in every zone.
 */
export function binKeyForDate(
  date: Date,
  granularity: ChartGranularity
): string {
  if (granularity === "daily") {
    return localDateString(date);
  }
  if (granularity === "weekly") {
    return localWeekKey(date); // Monday-anchored, local
  }
  // monthly — first-of-month, local
  return localDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * Format a bin key for the chart's X-axis label. The chart asks
 * about visual presentation; the granularity informs what unit
 * makes sense (day-of-month vs month-name).
 *
 *   daily   → "20/3"
 *   weekly  → "20/3"   (week-starting date, same shape as daily)
 *   monthly → "Mar"    (short month name; the whole year added when
 *                       the bin is in a different year from today,
 *                       "Sept 2025": two digits read as a day, and
 *                       "Sept 25" as the 25th)
 */
/** A bin key's month, short and without a year: "Sept". */
export function formatBinMonth(binKey: string): string {
  const d = new Date(binKey + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
}

export function formatBinLabel(
  binKey: string,
  granularity: ChartGranularity
): string {
  const d = new Date(binKey + "T00:00:00Z");
  // A tick has no honest label for an unparseable key, and "NaN/NaN" on
  // an axis is worse than a gap. PerformanceIndexChart carried this
  // guard in its own hand-rolled formatter; it belongs here, with the
  // parsing.
  if (Number.isNaN(d.getTime())) return "";
  if (granularity === "monthly") {
    // `d` is the bin KEY, parsed at UTC midnight — reading it back with
    // getUTC* returns the string's own digits, which is the point. `now`
    // is an INSTANT, and an instant only has a year once a zone is
    // chosen: the year to compare against is the one the user is living
    // in, so it is read locally. Reading it as UTC too made the axis
    // disagree with the user's calendar for up to 14 hours after their
    // New Year (east of UTC) and 12 before it (west) — see the
    // year-boundary tests.
    const nowLocalYear = new Date().getFullYear();
    const sameYear = d.getUTCFullYear() === nowLocalYear;
    const month = formatBinMonth(binKey);
    return sameYear ? month : `${month} ${d.getUTCFullYear()}`;
  }
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
