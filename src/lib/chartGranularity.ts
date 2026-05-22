/* ─────────────────────────────────────────────
   Chart granularity — adaptive binning by TimeRange

   Hist5c pin 7. Replaces the prior universal weekly-bar aggregation
   on VolumeChart, which produced ~52 unreadable bars at TimeRange=1Y.
   Per-range granularity:

     1W / 1M  → daily bars
     3M       → weekly bars (Sunday-anchored)
     6M / 1Y  → monthly bars (first-of-month)

   Used by History.tsx's lifting-volume aggregator + VolumeChart's
   X-axis label formatter so the bar bin and the label match.

   Kept as a separate module (rather than inlined in History.tsx)
   because future consumers — CalorieBalanceChart's per-day bars
   could adopt the same coarse-bin behavior at long ranges — will
   share the policy.
   ───────────────────────────────────────────── */

export type ChartGranularity = "daily" | "weekly" | "monthly";

/**
 * Pick granularity for a window of `rangeDays`. Thresholds match
 * the locked Hist5c pin 7 table; revisit only with explicit grill.
 */
export function granularityForRange(rangeDays: number): ChartGranularity {
  if (rangeDays <= 30) return "daily";
  if (rangeDays <= 90) return "weekly";
  return "monthly";
}

/**
 * Compute the bin key for `date` under the chosen granularity.
 * Returns an ISO date string (`YYYY-MM-DD`) — the first day of
 * the bin (the day itself for daily, the Sunday of the week for
 * weekly, the 1st of the month for monthly).
 *
 * UTC-safe: uses Date.toISOString() so the returned key is stable
 * regardless of the caller's local timezone.
 */
export function binKeyForDate(date: Date, granularity: ChartGranularity): string {
  if (granularity === "daily") {
    return date.toISOString().split("T")[0];
  }
  if (granularity === "weekly") {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Sunday-anchored
    return d.toISOString().split("T")[0];
  }
  // monthly — first-of-month
  const d = new Date(date);
  d.setUTCDate(1);
  return d.toISOString().split("T")[0];
}

/**
 * Format a bin key for the chart's X-axis label. The chart asks
 * about visual presentation; the granularity informs what unit
 * makes sense (day-of-month vs month-name).
 *
 *   daily   → "20/3"
 *   weekly  → "20/3"   (week-starting date, same shape as daily)
 *   monthly → "Mar"    (short month name; year suppressed unless
 *                       the bin is in a different year from today)
 */
export function formatBinLabel(
  binKey: string,
  granularity: ChartGranularity,
): string {
  const d = new Date(binKey + "T00:00:00Z");
  if (granularity === "monthly") {
    const now = new Date();
    const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
    const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return sameYear ? month : `${month} ${String(d.getUTCFullYear()).slice(2)}`;
  }
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
