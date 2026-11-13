/**
 * What a free account's charts reach (whole-app grill Q84, owner, 13
 * November 2026): "Pro adds history and charts older than 3 months, the
 * training load chart and the performance score's details. Logging and
 * recent history stay free."
 *
 * Read as the reference apps draw the line: Hevy keeps 3 months of graph
 * history free and Cronometer a week of reports, and neither hides the
 * logs themselves. So the ranges that chart further back than 3 months are
 * Pro, and a person's own sessions, records, lifetime totals and exports
 * stay free at any age.
 */

/** Ranges that chart further back than 3 months (90 days, "3M"). */
const PRO_RANGES: ReadonlySet<string> = new Set(["6M", "1Y", "All"]);

/** Whether this range is open to this account. */
export function isRangeOpen(range: string, isPro: boolean): boolean {
  return isPro || !PRO_RANGES.has(range);
}

/** The ranges of `options` that are Pro for this account (none for Pro). */
export function lockedRanges(
  options: readonly string[],
  isPro: boolean
): string[] {
  return options.filter((range) => !isRangeOpen(range, isPro));
}

/** Where a locked range or the score's details lead. */
export const HISTORY_UPGRADE_PATH = "/upgrade?from=history";
