export interface WeightTrend {
  current: number;
  avg7d: number;
  delta: number;
  direction: "up" | "down" | "stable";
  sparkline: number[];
}

export function calcWeightTrend(
  entries: { date: string; weight: number }[]
): WeightTrend | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1].weight;

  const last7 = sorted.slice(-7);
  const avg7d =
    Math.round(
      (last7.reduce((sum, e) => sum + e.weight, 0) / last7.length) * 10
    ) / 10;
  const delta = Math.round((current - avg7d) * 10) / 10;

  return {
    current,
    avg7d,
    delta,
    direction: Math.abs(delta) < 0.2 ? "stable" : delta > 0 ? "up" : "down",
    sparkline: sorted.slice(-30).map((e) => e.weight),
  };
}

/**
 * Exponential moving average smoothing for the body-weight trend
 * chart. Used by TrendWeight (Progress page).
 *
 * Returns one row per input entry, sorted ascending by date, with:
 *   - `actual`: the raw weight as logged.
 *   - `trend`:  the smoothed value (one-decimal rounded).
 *
 * The smoothing factor (default 0.1) is intentionally low — body-
 * weight is a noisy signal (water, glycogen, food in transit) and
 * a lower α produces a trend line that reads the underlying signal
 * rather than tracking day-to-day noise. Used by both Renpho and
 * Happy Scale at similar α values, per their published methodology.
 *
 * Empty input returns []; single entry returns that entry as both
 * actual and trend (no smoothing possible).
 */
export function calculateEMA(
  weights: { date: string; weight: number }[],
  factor = 0.1,
): { date: string; actual: number; trend: number }[] {
  if (weights.length === 0) return [];

  const sorted = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let trend = sorted[0].weight;
  return sorted.map((w) => {
    trend = trend + factor * (w.weight - trend);
    return {
      date: w.date,
      actual: w.weight,
      trend: Math.round(trend * 10) / 10,
    };
  });
}
