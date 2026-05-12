/**
 * Route-quality scoring for runs.
 *
 * PR H (audit P1 #9): pre-PR-H run docs persisted nothing about
 * the quality of the GPS trace beyond the points themselves. A run
 * that captured 40 fixes over 5km is qualitatively different from
 * one that captured 12 fixes with a 4-minute background gap, but
 * both surfaced the same on RunDetail. This helper takes the
 * signals we already track and produces a confidence label users
 * can see at a glance.
 *
 * The app's foreground-only GPS strategy means short runs can have
 * legitimate gaps when the screen sleeps; we surface "patchy" or
 * "poor" rather than hide the run, so the user knows the route
 * trace isn't authoritative for splits or routes shared socially.
 *
 * Pure function — no DOM, no Firestore. Suitable for both the
 * save-time write (Run.tsx → RunSummary.tsx) and the read-time
 * display chip (RunDetail).
 */

export type RouteConfidence = "good" | "patchy" | "poor";

export interface RouteQuality {
  /** Total background gap accumulated across the run, in ms. Sum of
   *  every `visibilityHidden → visibilityVisible` window while the
   *  run was active. 0 if the user kept the screen on. */
  backgroundGapMs: number;
  /** Number of long inter-fix gaps observed (≥ 8s between fixes).
   *  Inter-fix gaps under 8s are the normal sampling rhythm; longer
   *  ones indicate either signal loss or app throttling. */
  gapCount: number;
  /** Number of GPS readings rejected by isValidReading (poor
   *  accuracy / unrealistic speed). High counts here suggest the
   *  raw GPS signal was unreliable even when fixes arrived. */
  rejectedFixCount: number;
  /** Median accuracy of accepted fixes in metres. */
  medianAccuracyM: number;
  /** Worst accuracy of accepted fixes in metres. */
  worstAccuracyM: number;
  /** Compact label for display. */
  confidence: RouteConfidence;
}

interface ComputeArgs {
  acceptedAccuracies: number[];
  rejectedFixCount: number;
  backgroundGapMs: number;
  /** Inter-fix timestamps in ms (sorted ascending). */
  fixTimestamps: number[];
}

const INTER_FIX_GAP_THRESHOLD_MS = 8_000;

/**
 * Median of a numeric array. Returns 0 for an empty array (callers
 * treat 0 as "no data" rather than throwing).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the confidence label from the raw metrics. Thresholds are
 * deliberately conservative — a 30s background gap on a 30-minute
 * run is still "good"; only multi-minute gaps or many rejected
 * fixes drop to "patchy" or "poor".
 *
 * Rules:
 *   poor    → any of:
 *               - backgroundGapMs > 180_000 (3 minutes)
 *               - rejectedFixCount > 20
 *               - medianAccuracy > 50m
 *               - fewer than 5 accepted fixes total
 *   patchy  → any of:
 *               - backgroundGapMs > 60_000 (1 minute)
 *               - rejectedFixCount > 5
 *               - medianAccuracy > 25m
 *               - 2+ inter-fix gaps
 *   good    → otherwise
 */
function deriveConfidence(args: {
  backgroundGapMs: number;
  rejectedFixCount: number;
  medianAccuracyM: number;
  acceptedFixCount: number;
  gapCount: number;
}): RouteConfidence {
  if (
    args.backgroundGapMs > 180_000 ||
    args.rejectedFixCount > 20 ||
    args.medianAccuracyM > 50 ||
    args.acceptedFixCount < 5
  ) {
    return "poor";
  }
  if (
    args.backgroundGapMs > 60_000 ||
    args.rejectedFixCount > 5 ||
    args.medianAccuracyM > 25 ||
    args.gapCount >= 2
  ) {
    return "patchy";
  }
  return "good";
}

export function computeRouteQuality(args: ComputeArgs): RouteQuality {
  const acceptedAccuracies = args.acceptedAccuracies.filter(
    (a) => Number.isFinite(a) && a > 0,
  );

  // Count long inter-fix gaps. timestamps are sorted ascending; a
  // diff > threshold counts as one gap.
  let gapCount = 0;
  for (let i = 1; i < args.fixTimestamps.length; i++) {
    const diff = args.fixTimestamps[i] - args.fixTimestamps[i - 1];
    if (diff >= INTER_FIX_GAP_THRESHOLD_MS) gapCount++;
  }

  const medianAccuracyM = median(acceptedAccuracies);
  const worstAccuracyM = acceptedAccuracies.length === 0
    ? 0
    : Math.max(...acceptedAccuracies);

  const confidence = deriveConfidence({
    backgroundGapMs: args.backgroundGapMs,
    rejectedFixCount: args.rejectedFixCount,
    medianAccuracyM,
    acceptedFixCount: acceptedAccuracies.length,
    gapCount,
  });

  return {
    backgroundGapMs: args.backgroundGapMs,
    gapCount,
    rejectedFixCount: args.rejectedFixCount,
    medianAccuracyM,
    worstAccuracyM,
    confidence,
  };
}

/**
 * User-facing label for a confidence value. Intentionally honest
 * rather than evasive — patchy / poor users should know the trace
 * isn't authoritative before they share it.
 */
export function describeRouteConfidence(c: RouteConfidence): string {
  switch (c) {
    case "good":
      return "Route looks solid";
    case "patchy":
      return "Route has some gaps";
    case "poor":
      return "Route may be inaccurate";
  }
}
