/**
 * Weekly sparkline series, with the week you are still living dropped.
 *
 * Both weekly axes on Analytics walk `startOfLocalWeek(windowStart)` to
 * `startOfLocalWeek(today)`, so their final bucket is ALWAYS the current
 * week — and on any day but Sunday night it holds a fraction of that
 * week's training. Mapped straight onto a sparkline it renders as a
 * cliff: a month of 52 km read as though the runner stopped, when what
 * actually happened is that it is Monday.
 *
 * Dropping it is the whole fix. The alternative — drawing the partial
 * bucket in some distinct treatment — was measured and rejected twice
 * over: the dashed/ghost vocabulary is already reserved for the
 * data-confidence tiers, and at the real width of a half-grid stat card
 * the endpoint lands on the SVG's right edge with no overflow, so the
 * marker is clipped in exactly the case it exists for. A sparkline is
 * declared decorative where it renders — "a glance at the shape of the
 * trend" — and the shape of the trend is the weeks that finished.
 *
 * Rate metrics never had this problem and must not route through here:
 * pace skips empty weeks entirely, because a week with no runs has no
 * pace rather than a pace of zero.
 */

/**
 * The completed weekly buckets, newest-completed last.
 *
 * Takes the lookup rather than a pre-built array so the drop happens
 * BEFORE the values are read — a caller cannot accidentally map first
 * and trim second, which would leave the partial week's value computed
 * and then silently discarded somewhere else.
 *
 * Returns an empty series when the window holds no completed week at
 * all (a one-week range, or a brand-new account). Callers render no
 * sparkline below three points, so an empty series is a drawn-nothing,
 * not a flat line at zero.
 */
export function completedWeeklySeries(
  weekKeys: readonly string[],
  valueForWeek: (weekKey: string) => number
): number[] {
  if (weekKeys.length === 0) return [];
  return weekKeys.slice(0, -1).map(valueForWeek);
}
