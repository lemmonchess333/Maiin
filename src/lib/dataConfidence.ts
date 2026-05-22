/* ─────────────────────────────────────────────
   Data confidence — unified thin-data suppression policy

   Hist5d locked spec. Single source of truth for "when does this
   decoration render?" Every Analytics surface that wants to suppress
   sparklines, deltas, projections, donuts, or chart bars calls
   `computeDataConfidence(input)` and reads the boolean flags.

   Why a shared utility:
   - Today the Analytics page treats data-density inconsistently —
     nutrition section suppresses sparklines + deltas on thin samples
     (via `showSparklines` / `showDelta` flags in History.tsx) while
     lifting, running, macros, and weight surfaces show decorations
     unconditionally. Result: "↓ 79% vs last" rendered alongside
     "Averages below are based on too few logged days to be reliable"
     on the same page.
   - One policy, one place to revise thresholds.

   Threshold numbers below are v1 best-guesses informed by reference
   apps (Hevy ≥4wk, NRC ≥4 activities, MacroFactor's explicit caveats).
   Post-launch telemetry (`analytics_decorations_suppressed` event,
   batched per page-load) drives empirical tuning. DO NOT treat these
   as derived constants — they're a working hypothesis.
   ───────────────────────────────────────────── */

/** Decorations the page may render or suppress. */
export type DecorationKind =
  | "sparkline"
  | "delta"
  | "projection"
  | "donut"
  | "bars";

/** Reason a decoration was suppressed. Drives telemetry + can drive
 *  caveat copy selection at the call site. */
export type SuppressionReason =
  | "insufficient_points"
  | "no_prior_window"
  | "no_recency"
  | "below_minimum_window"
  | "insufficient_logged_days";

export interface SuppressionRecord {
  decoration: DecorationKind;
  reason: SuppressionReason;
  /** Best-available "how many points do we have" count — for
   *  telemetry analysis and ETA copy generation. */
  pointsAvailable: number;
}

export interface DataConfidence {
  hasSparkline: boolean;
  hasDelta: boolean;
  hasProjection: boolean;
  hasDonut: boolean;
  hasBars: boolean;
  /** Suppressions emitted for telemetry + caveat copy. One entry
   *  per suppressed decoration. Stable shape across versions —
   *  new decoration kinds get appended to `DecorationKind`. */
  suppressions: SuppressionRecord[];
}

export interface DataConfidenceInput {
  /** Per-metric correct unit: distinct days (sport), logged days
   *  (nutrition), data points (weight). Caller passes the right
   *  unit; this util doesn't second-guess. */
  pointsInWindow: number;
  /** Same unit as `pointsInWindow`, scoped to the prior window
   *  (rolling-back-by-windowDays per Hist5d cross-cut pin 4). 0
   *  means there is no prior window (first-period user). */
  pointsInPriorWindow: number;
  /** Window length in days. Drives the T3 projection minimum-window
   *  gate (must be ≥ 30 for a meaningful trend projection). */
  windowDays: number;
  /** Nutrition-specific: distinct days the user logged ≥1 meal.
   *  When omitted, falls back to `pointsInWindow`. Donut gate (T4)
   *  uses this. */
  loggedDays?: number;
  /** Recency check (Stress 8 from Hist5d grill): does at least one
   *  data point fall in the last 25% of the window (or the last 7
   *  days, whichever is larger)? Suppresses T1-T3 decorations for
   *  backfilled-but-inactive users. Caller computes; util consumes. */
  hasRecentPoint?: boolean;
}

// ── Thresholds — v1 best-guesses; telemetry-driven tuning ─────

/** T1: sparklines need ≥4 distinct points in the window to show a
 *  recognisable shape. Below that, a 2-3 point sparkline is more
 *  visual noise than signal. */
export const T1_SPARKLINE_MIN_POINTS = 4;

/** T2: vs-last delta needs ≥4 in BOTH current and prior windows.
 *  A delta computed from one window with 2 points and another with
 *  10 is inherently noisy; symmetry guards against false signal. */
export const T2_DELTA_MIN_POINTS = 4;

/** T3: trend projection (TrendWeight, etc.) needs ≥30-day window
 *  AND ≥5 data points. A linear fit through 4 weight points across
 *  a week produces a goal-date projection that's mathematically a
 *  lie. */
export const T3_PROJECTION_MIN_WINDOW_DAYS = 30;
export const T3_PROJECTION_MIN_POINTS = 5;

/** T4: donut / allocation viz needs ≥7 distinct logged days. The
 *  MacroDistribution donut over 2 days of nutrition data is whatever
 *  the user happened to eat those days — usually skewed by a single
 *  meal. Replace with "Building your macro split" caveat below this. */
export const T4_DONUT_MIN_LOGGED_DAYS = 7;

/** T5: bar charts need ≥3 bars to show change-over-time. A 1- or
 *  2-bar chart is just a stat in chart clothing — render the stat
 *  separately (Stress 16 + Stress 24 of the grill). */
export const T5_BARS_MIN_COUNT = 3;

// ── Computation ────────────────────────────────────────────────

/**
 * Pure gate function. Inputs are pre-aggregated counts — the util
 * itself is O(1). Per-surface hooks own the surface-specific count
 * computation + memoisation (Hist5d cross-cut pin 5).
 */
export function computeDataConfidence(
  input: DataConfidenceInput,
): DataConfidence {
  const suppressions: SuppressionRecord[] = [];
  const recency = input.hasRecentPoint ?? true;
  const loggedDays = input.loggedDays ?? input.pointsInWindow;

  // T1 — sparkline
  const sparklineByCount = input.pointsInWindow >= T1_SPARKLINE_MIN_POINTS;
  const hasSparkline = sparklineByCount && recency;
  if (!hasSparkline) {
    suppressions.push({
      decoration: "sparkline",
      reason: !sparklineByCount ? "insufficient_points" : "no_recency",
      pointsAvailable: input.pointsInWindow,
    });
  }

  // T2 — vs-last delta
  const hasDelta =
    input.pointsInWindow >= T2_DELTA_MIN_POINTS
    && input.pointsInPriorWindow >= T2_DELTA_MIN_POINTS;
  if (!hasDelta) {
    suppressions.push({
      decoration: "delta",
      /* When the prior window has zero points, the user is in their
         first period of using the app for this surface — frame as
         "no prior window" (distinct copy from generic insufficient
         points). */
      reason:
        input.pointsInPriorWindow === 0
          ? "no_prior_window"
          : "insufficient_points",
      pointsAvailable: input.pointsInWindow,
    });
  }

  // T3 — trend projection
  const windowOK = input.windowDays >= T3_PROJECTION_MIN_WINDOW_DAYS;
  const pointsOK = input.pointsInWindow >= T3_PROJECTION_MIN_POINTS;
  const hasProjection = windowOK && pointsOK && recency;
  if (!hasProjection) {
    suppressions.push({
      decoration: "projection",
      reason: !windowOK
        ? "below_minimum_window"
        : !recency
          ? "no_recency"
          : "insufficient_points",
      pointsAvailable: input.pointsInWindow,
    });
  }

  // T4 — donut / allocation
  const hasDonut = loggedDays >= T4_DONUT_MIN_LOGGED_DAYS;
  if (!hasDonut) {
    suppressions.push({
      decoration: "donut",
      reason: "insufficient_logged_days",
      pointsAvailable: loggedDays,
    });
  }

  // T5 — bar chart
  const hasBars = input.pointsInWindow >= T5_BARS_MIN_COUNT;
  if (!hasBars) {
    suppressions.push({
      decoration: "bars",
      reason: "insufficient_points",
      pointsAvailable: input.pointsInWindow,
    });
  }

  return {
    hasSparkline,
    hasDelta,
    hasProjection,
    hasDonut,
    hasBars,
    suppressions,
  };
}

// ── Caveat copy generation ─────────────────────────────────────

/**
 * Suppression caveat copy. ≤30 chars (Hist5d pin 6 budget — English
 * v1; i18n re-evaluates per language at the i18n arc). Patience
 * framing for time-gated decorations (T1/T3/T4: data accrues with
 * time); action framing for activity-gated decorations (T5: user
 * has to log).
 *
 * When `ratePerDay` is provided (current logging cadence), computes
 * an ETA — "Trending in ~22 days" — for time-gated cases. Falls back
 * to generic "Building trend · check back" when rate is 0 or absent.
 */
export function suppressionCaveatCopy(
  decoration: DecorationKind,
  pointsAvailable: number,
  ratePerDay?: number,
): string {
  switch (decoration) {
    case "sparkline":
      return computeETA(T1_SPARKLINE_MIN_POINTS, pointsAvailable, ratePerDay)
        ?? "Building chart · keep logging";
    case "projection":
      return computeETA(T3_PROJECTION_MIN_POINTS, pointsAvailable, ratePerDay)
        ?? "Building trend · check back";
    case "donut":
      return computeETA(T4_DONUT_MIN_LOGGED_DAYS, pointsAvailable, ratePerDay, "Macro split in")
        ?? "Building your macro split";
    case "delta":
      return "First period · no comparison";
    case "bars":
      return "Log first run";
  }
}

function computeETA(
  target: number,
  current: number,
  ratePerDay: number | undefined,
  prefix: string = "Trending in",
): string | null {
  if (!ratePerDay || ratePerDay <= 0) return null;
  const remaining = Math.max(1, Math.ceil((target - current) / ratePerDay));
  return `${prefix} ~${remaining} days`;
}

// ── Telemetry batching ─────────────────────────────────────────

/**
 * One telemetry payload aggregating ALL suppressions on a page-load
 * (Hist5d pin 12). Consumers create a batch at render time, add per
 * surface, then fire a single `analytics_decorations_suppressed`
 * event with the array payload. Single event per page-load > N
 * events per surface — preserves telemetry quota while keeping the
 * data structured for post-launch threshold tuning.
 */
export interface SuppressionTelemetryItem {
  surface: string;
  decoration: DecorationKind;
  reason: SuppressionReason;
  pointsAvailable: number;
}

export function makeSuppressionBatch() {
  const items: SuppressionTelemetryItem[] = [];
  return {
    add(surface: string, suppressions: SuppressionRecord[]) {
      for (const s of suppressions) {
        items.push({
          surface,
          decoration: s.decoration,
          reason: s.reason,
          pointsAvailable: s.pointsAvailable,
        });
      }
    },
    payload(): { suppressions: SuppressionTelemetryItem[] } {
      return { suppressions: items };
    },
    isEmpty(): boolean {
      return items.length === 0;
    },
  };
}
