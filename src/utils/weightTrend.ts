import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  startOfLocalWeek,
} from "@/lib/dateHelpers";
import { attestedWeeklyRateKg } from "@/lib/goalWeightPlan";
import { computeDataConfidence } from "@/lib/dataConfidence";
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
  const latestDate = sorted[sorted.length - 1].date;

  // CALENDAR-day windows, not entry-count slices. slice(-7) averaged the
  // last 7 LOG ENTRIES — for a weekly logger that "7-day avg" silently
  // spanned ~7 weeks, and the delta/direction derived from it were
  // mislabelled. Anchor to the latest entry's local date and window by
  // date-string comparison (entries carry local "YYYY-MM-DD" keys).
  const dayKeyBefore = (dateKey: string, days: number): string => {
    const d = new Date(dateKey + "T12:00:00");
    d.setDate(d.getDate() - days);
    return localDateString(d);
  };
  const cutoff7 = dayKeyBefore(latestDate, 6); // latest day + 6 before = 7 days
  const cutoff30 = dayKeyBefore(latestDate, 29);

  const last7 = sorted.filter((e) => e.date >= cutoff7);
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
    sparkline: sorted.filter((e) => e.date >= cutoff30).map((e) => e.weight),
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
  factor = 0.1
): { date: string; actual: number; trend: number }[] {
  if (weights.length === 0) return [];

  const sorted = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
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
 * The goal weight the USER set (Settings → Nutrition), or none.
 *
 * The weight chart and the Weekly Review derived one instead:
 * the programme's start weight less 5 kg for a cut, plus 3 kg for a lean
 * bulk, the start weight itself otherwise. The user's own target has been
 * stored since the goal-weight plan shipped (`goalWeightKg`, written with
 * its signed `weeklyRateKg` and the phase by `buildGoalWeightPersistPayload`)
 * and owns the nutrition direction, but neither surface read it: someone
 * cutting from 90 kg to 78 kg was told they were "7 kg to goal" at 82 kg,
 * against a goal of 85 they never set.
 *
 * A goal counts when the user is travelling toward it: a rate the phase
 * agrees with (`attestedWeeklyRateKg`). Onboarding stores the signup
 * weight as the target with a rate of 0, which is maintenance, not a
 * goal, and a maintainer is shown none.
 */
export function userGoalWeightKg(
  profile:
    | {
        goalWeightKg?: number | null;
        weeklyRateKg?: number | null;
        program?: { goal?: string } | null;
      }
    | null
    | undefined
): number | undefined {
  const goal = profile?.goalWeightKg;
  if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0)
    return undefined;
  if (attestedWeeklyRateKg(profile) === null) return undefined;
  return goal;
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

  const last = trendSeries[trendSeries.length - 1];
  // The CURRENT rate, the one the Body page states beside this date: a
  // year that held a bulk and then a cut is not moving at its average.
  const rate = recentWeeklyRate(trendSeries);
  if (!rate) return null;
  const slope = rate.kgPerWeek / 7; // kg/day
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

/** The span a "current" rate is read over: four weeks, long enough that a
 *  week of water weight does not swing it, short enough to be now. */
export const RATE_WINDOW_DAYS = 28;

/** Under this many kg a week the trend reads as holding. */
export const STEADY_RATE_KG = 0.05;

const DAY_MS = 86_400_000;

/**
 * How fast the trend weight is moving, in kg a week: from the trend at the
 * newest point to the trend at the latest point `days` or more before it,
 * or the first point when the history is shorter. The goal projection and
 * the Body page's rate both read this, so "at this rate" names the rate
 * the page states. Null without two points on different days.
 */
export function recentWeeklyRate(
  points: readonly { date: string; trend: number }[],
  days: number = RATE_WINDOW_DAYS
): { kgPerWeek: number; fromDate: string; toDate: string } | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = localDateString(
    addLocalDays(parseLocalDate(last.date), -days)
  );
  let from = points[0];
  for (const p of points) {
    if (p.date > cutoff) break;
    from = p;
  }
  const spanDays = Math.round(
    (parseLocalDate(last.date).getTime() -
      parseLocalDate(from.date).getTime()) /
      DAY_MS
  );
  if (spanDays <= 0) return null;
  return {
    kgPerWeek: ((last.trend - from.trend) / spanDays) * 7,
    fromDate: from.date,
    toDate: last.date,
  };
}

/**
 * The rate, when the history can carry one: the weight chart's own gate
 * for a projection (T3, a month of history and five weigh-ins), since
 * below it a rate is two noisy mornings. The Body page's card and the
 * overview's Body tile both read this, so neither states a rate the other
 * would not.
 */
export function currentWeightRate(
  points: readonly { date: string; trend: number }[]
): { kgPerWeek: number; fromDate: string; toDate: string } | null {
  if (points.length < 2) return null;
  const windowDays = Math.round(
    (parseLocalDate(points[points.length - 1].date).getTime() -
      parseLocalDate(points[0].date).getTime()) /
      DAY_MS
  );
  const { hasProjection } = computeDataConfidence({
    pointsInWindow: points.length,
    pointsInPriorWindow: 0,
    windowDays,
  });
  return hasProjection ? recentWeeklyRate(points) : null;
}

export interface WeekAverage {
  /** The week's Monday, "YYYY-MM-DD". */
  weekKey: string;
  /** The mean of the week's weigh-ins, in kg. */
  averageKg: number;
  weighIns: number;
  /** Against the week before's average, when that week had weigh-ins. */
  changeKg: number | null;
  /** The week holding today, still going. */
  current: boolean;
}

/**
 * The weigh-ins averaged by Monday week, newest first: the number a
 * weekly weigher and a daily one can both compare, since a single morning
 * swings by more than a week's real change. Weeks without a weigh-in are
 * left out rather than shown as zero, and a week's change is against the
 * week before only when that week was weighed.
 */
export function weeklyWeightAverages(
  weighIns: readonly { date: string; actual: number }[],
  { today, limit = 6 }: { today: Date; limit?: number }
): WeekAverage[] {
  const byWeek = new Map<string, number[]>();
  for (const w of weighIns) {
    if (!(w.actual > 0) || !Number.isFinite(w.actual)) continue;
    const key = localWeekKey(parseLocalDate(w.date));
    const list = byWeek.get(key) ?? [];
    list.push(w.actual);
    byWeek.set(key, list);
  }
  const currentKey = localWeekKey(today);
  const keys = [...byWeek.keys()].sort().reverse().slice(0, limit);
  return keys.map((key) => {
    const list = byWeek.get(key)!;
    const averageKg = list.reduce((a, b) => a + b, 0) / list.length;
    const previousKey = localWeekKey(
      addLocalDays(startOfLocalWeek(parseLocalDate(key)), -7)
    );
    const previous = byWeek.get(previousKey);
    return {
      weekKey: key,
      averageKg,
      weighIns: list.length,
      changeKg: previous
        ? averageKg - previous.reduce((a, b) => a + b, 0) / previous.length
        : null,
      current: key === currentKey,
    };
  });
}
