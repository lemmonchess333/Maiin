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

/**
 * Goal weight implied by the programme: startWeight −5kg for a cut,
 * +3kg for a lean bulk, startWeight itself for maintain. Extracted
 * from TrendWeight (Rev1) so the Weekly Review derives the SAME goal
 * the Progress chart shows — one source of truth, no drift.
 */
export function deriveGoalWeightKg(
  program:
    | { startWeight?: number | null; goal?: string | null }
    | null
    | undefined,
): number | undefined {
  if (!program?.startWeight) return undefined;
  if (program.goal === "cut") return program.startWeight - 5;
  if (program.goal === "lean bulk") return program.startWeight + 3;
  return program.startWeight;
}

export interface GoalProjection {
  /** e.g. "24 Jul" or "24 Jul 2027" when it crosses a year boundary. */
  date: string;
  weeks: number;
}

/**
 * Projected goal-reach date. Linear extrapolation from the trend slope —
 * not a prediction engine, just a motivational "at this rate, about X
 * weeks away." Extracted verbatim from TrendWeight (Rev1) so the Weekly
 * Review reuses the SAME projection incl. its honest self-suppression:
 * returns null unless (1) a goal exists, (2) the caller's confidence
 * gate passed (T3 / computeDataConfidence), (3) the trend is actually
 * moving toward the goal, and (4) the ETA is under ~2 years (otherwise
 * it's demotivating noise). `now` is injected for testability.
 */
export function projectGoalDate(args: {
  trendSeries: { date: string; trend: number }[];
  goalWeight: number | undefined;
  hasProjection: boolean;
  now?: Date;
}): GoalProjection | null {
  const { trendSeries, goalWeight, hasProjection } = args;
  const now = args.now ?? new Date();
  if (!goalWeight || !Number.isFinite(goalWeight)) return null;
  if (!hasProjection) return null;
  if (trendSeries.length < 2) return null;

  const first = trendSeries[0];
  const last = trendSeries[trendSeries.length - 1];
  const daysSpan =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) /
    (1000 * 60 * 60 * 24);
  if (daysSpan <= 0) return null;

  const slope = (last.trend - first.trend) / daysSpan; // kg/day
  const remaining = goalWeight - last.trend; // +ve if goal is higher
  if (slope === 0) return null;
  // Directions mismatch → not on track for goal, suppress.
  if (remaining > 0 !== slope > 0) return null;
  const daysToGoal = remaining / slope;
  if (!Number.isFinite(daysToGoal) || daysToGoal <= 0) return null;
  if (daysToGoal > 730) return null;

  const eta = new Date(now);
  eta.setDate(eta.getDate() + Math.round(daysToGoal));
  const dateLabel = eta.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: eta.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  return { date: dateLabel, weeks: Math.round(daysToGoal / 7) };
}
