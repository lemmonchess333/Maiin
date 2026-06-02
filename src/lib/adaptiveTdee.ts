/**
 * Adaptive TDEE estimator — learns a user's true maintenance expenditure from
 * the two signals they already log: calorie intake and a body-weight trend.
 *
 * The MacroFactor mechanic, stated as energy balance: over a window,
 *   intake − TDEE = energy stored = Δweight × ~7700 kcal/kg
 * so, rearranged for the unknown,
 *   learnedTDEE = avgIntake − (Δweight_per_day × 7700)
 *
 * Robustness decisions (all locked in the #976 grill — read before changing):
 *
 * - SLOPE, not endpoints. Δweight is the least-squares SLOPE of the weigh-ins
 *   in kg/DAY against real date offsets — NOT `end − start`, which is
 *   endpoint-sensitive and was the naive trap. The regression IS the de-noiser:
 *   over the window, symmetric water/glycogen noise averages out of the fit.
 *   (We deliberately do NOT also EWMA-smooth first — empirically the EWMA warmup
 *   lag attenuates the fitted slope ~35% and biases the estimate toward intake.
 *   `calculateEMA` stays the DISPLAY trend for the chart; the SLOPE uses the raw
 *   regression. Outlier-robust fits — Theil-Sen — are a v2 refinement.)
 * - WARMUP GATE. Returns `ready: false` (and `learnedTDEE: null`) until there is
 *   enough data — a min trusted-intake-day count, a min weigh-in count, and a min
 *   elapsed span. Below the gate the caller shows the static formula target; we
 *   never surface an under-data regression (the early water-weight artifact).
 * - TRUSTED DAYS / self-correction. `avgIntake` is the mean over TRUSTED days only
 *   (a day clears a low gross-error plausibility floor); broken/zero days are
 *   EXCLUDED, not counted as low. We deliberately do NOT try to detect moderate
 *   under-logging: the target is set in the user's own logged units, so a
 *   *consistent* bias cancels behaviourally (consistency, not accuracy).
 * - MAINTENANCE by construction. Because the estimate reconciles intake against
 *   the real weight change, it returns the user's MAINTENANCE TDEE even while they
 *   are in a deficit — never their (lower) deficit intake.
 *
 * Pure function — no I/O, no clock. Table-tested like `raceGoalPlanner`.
 * Recency-weighting is a documented v2 refinement (this is an even-weighted fit).
 */

export interface AdaptiveTdeeInput {
  /** Days that have a logged intake total, within the trailing window. Missing/zero days are simply absent. */
  intakeByDay: { dateKey: string; kcal: number }[];
  /** Raw weigh-ins within the window — may be sparse / irregularly spaced. */
  weighIns: { dateKey: string; weightKg: number }[];
  /** Trailing window length in days. Single tunable constant. */
  windowDays?: number;
  /** Gross-error plausibility floor — intake days below this are excluded as broken logs. */
  plausibilityFloorKcal?: number;
  /** Minimum trusted intake-days before an estimate is produced. */
  minTrustedDays?: number;
  /** Minimum weigh-ins required to fit a trend. */
  minWeighIns?: number;
  /** Minimum elapsed span (days, first→last weigh-in) before trusting the slope. */
  minSpanDays?: number;
  /** Energy density of body-mass change. */
  kcalPerKg?: number;
}

export interface AdaptiveTdeeResult {
  /** True only when every data gate is cleared. */
  ready: boolean;
  /** Maintenance TDEE in the user's logged-calorie units; null when not ready. */
  learnedTDEE: number | null;
  /** Number of intake days that cleared the plausibility floor. */
  trustedDays: number;
  /** Number of weigh-ins considered. */
  weighInCount: number;
  /** Elapsed span in days, first→last weigh-in (0 if <2). Always present — drives the warmup bar pre-gate. */
  spanDays: number;
  /** Smoothed-trend slope in kg/day; null when not ready. */
  slopeKgPerDay: number | null;
}

export const ADAPTIVE_TDEE_DEFAULTS = {
  windowDays: 21,
  plausibilityFloorKcal: 800,
  minTrustedDays: 10,
  minWeighIns: 8,
  minSpanDays: 14,
  kcalPerKg: 7700,
} as const;

/** Parse a "YYYY-MM-DD" key to a deterministic UTC-midnight epoch (date-only, tz-neutral). */
function dayEpoch(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

/** Least-squares slope of y against day-offset x. Returns 0 when x has no spread. */
function slopePerDay(points: { dateKey: string; value: number }[]): number {
  const x0 = dayEpoch(points[0].dateKey);
  const xs = points.map((p) => (dayEpoch(p.dateKey) - x0) / 86_400_000);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function estimateAdaptiveTDEE(
  input: AdaptiveTdeeInput
): AdaptiveTdeeResult {
  const floor =
    input.plausibilityFloorKcal ?? ADAPTIVE_TDEE_DEFAULTS.plausibilityFloorKcal;
  const minTrustedDays =
    input.minTrustedDays ?? ADAPTIVE_TDEE_DEFAULTS.minTrustedDays;
  const minWeighIns = input.minWeighIns ?? ADAPTIVE_TDEE_DEFAULTS.minWeighIns;
  const minSpanDays = input.minSpanDays ?? ADAPTIVE_TDEE_DEFAULTS.minSpanDays;
  const kcalPerKg = input.kcalPerKg ?? ADAPTIVE_TDEE_DEFAULTS.kcalPerKg;

  // Trusted intake days only — gross-error days are excluded, never counted as low.
  const trusted = input.intakeByDay.filter((d) => d.kcal >= floor);
  const trustedDays = trusted.length;
  const weighInCount = input.weighIns.length;

  // Span is computed ALWAYS (even below the gate) so the warmup bar can show
  // span progress pre-gate. 0 when fewer than 2 weigh-ins (no span to measure).
  const sortedWeighIns = [...input.weighIns].sort(
    (a, b) => dayEpoch(a.dateKey) - dayEpoch(b.dateKey)
  );
  const spanDays =
    weighInCount >= 2
      ? (dayEpoch(sortedWeighIns[weighInCount - 1].dateKey) -
          dayEpoch(sortedWeighIns[0].dateKey)) /
        86_400_000
      : 0;

  const notReady: AdaptiveTdeeResult = {
    ready: false,
    learnedTDEE: null,
    trustedDays,
    weighInCount,
    spanDays,
    slopeKgPerDay: null,
  };

  if (trustedDays < minTrustedDays || weighInCount < minWeighIns)
    return notReady;

  if (spanDays < minSpanDays) return notReady;

  // Least-squares slope of the raw weigh-ins (the regression is the de-noiser;
  // see header — EWMA-then-regress biases the slope via warmup lag).
  const slopeKgPerDay = slopePerDay(
    sortedWeighIns.map((w) => ({ dateKey: w.dateKey, value: w.weightKg }))
  );

  const avgIntake = trusted.reduce((s, d) => s + d.kcal, 0) / trustedDays;

  // Energy balance: TDEE = intake − (Δweight/day × kcal/kg).
  // Losing weight (negative slope) → TDEE > intake; returns maintenance even mid-deficit.
  const learnedTDEE = Math.round(avgIntake - slopeKgPerDay * kcalPerKg);

  return {
    ready: true,
    learnedTDEE,
    trustedDays,
    weighInCount,
    spanDays,
    slopeKgPerDay,
  };
}

/**
 * Warmup progress (0..1) for the "personalizing your metabolism" bar (Nutr2).
 *
 * Derived from the gate's OWN conditions, so it reaches 1.0 if-and-only-if the
 * gate is `ready` — it can never promise an unlock the multi-condition gate
 * won't honor. Below the gate it's clamped to ≤0.99. The high-water latch and
 * the "fallen behind the window" stall detection are stateful and live in the
 * `useAdaptiveTdee` hook; this pure fn returns the instantaneous fraction.
 */
export interface WarmupProgress {
  /** 0..1 gate-completeness. Exactly 1 iff `ready`; otherwise ≤0.99. */
  fraction: number;
  /** Mirrors the estimator's gate. */
  ready: boolean;
}

export function computeWarmupProgress(
  result: Pick<
    AdaptiveTdeeResult,
    "ready" | "trustedDays" | "weighInCount" | "spanDays"
  >,
  opts?: {
    minTrustedDays?: number;
    minWeighIns?: number;
    minSpanDays?: number;
  }
): WarmupProgress {
  const minTrustedDays =
    opts?.minTrustedDays ?? ADAPTIVE_TDEE_DEFAULTS.minTrustedDays;
  const minWeighIns = opts?.minWeighIns ?? ADAPTIVE_TDEE_DEFAULTS.minWeighIns;
  const minSpanDays = opts?.minSpanDays ?? ADAPTIVE_TDEE_DEFAULTS.minSpanDays;

  const raw = Math.min(
    result.trustedDays / minTrustedDays,
    result.weighInCount / minWeighIns,
    result.spanDays / minSpanDays
  );
  const clamped = Math.max(0, Math.min(raw, 1));
  // Honest-by-construction: only hit 1.0 when the gate has actually cleared.
  const fraction = result.ready ? 1 : Math.min(clamped, 0.99);
  return { fraction, ready: result.ready };
}
