/**
 * Pace Trend Badges — compare runs within 20% distance to detect improvement trends.
 *
 * Source eligibility lives in {@link isPaceTrendEligible} in
 * runStatsEligibility.ts — that module documents the policy
 * divergence from `isPaceEligible` (strict outdoor-PR eligibility)
 * in one place. Trend uses the LENIENT policy: missing `activityType`
 * is treated as outdoor for legacy compat so pre-Sprint-1 docs keep
 * their trend visibility.
 */

import type { ActivityType } from "@/types/run";
import { THEME } from "@/lib/theme";
import { isPaceTrendEligible } from "./runStatsEligibility";

export type PaceTrend = "pr" | "improving" | "consistent" | "no-data";

/**
 * FOUND, NOT FIXED — the badge these colours paint fails contrast in
 * LIGHT mode, and has since it was written. RunSummary renders it as
 * `text-sm font-semibold` (14px, so 4.5:1 applies, not 3:1) with
 * `color` on a 15% tint of itself over the card. Measured:
 *
 *              light    dark
 *   PR!        1.92:1   6.15:1
 *   Faster     2.20:1   5.42:1   (1.68:1 before the token repoint)
 *   Steady     3.26:1   3.73:1
 *
 * Two of the three have a ready answer — `--success-strong` and
 * `--warning-strong` are exactly the "text on a tint of its own
 * colour" steps and measure 5.30 / 5.39 in light. The brand branch
 * does not: `--primary-strong` is the DARKER step for white text on a
 * purple FILL, the opposite direction, and lands at 2.89:1 in dark.
 * Fixing all three properly means adding a brand text-on-tint token,
 * which is a design-system decision rather than a repoint — so it is
 * recorded here instead of half-done.
 */
export interface PaceTrendResult {
  trend: PaceTrend;
  label: string;
  /** @see the contrast note above before changing this. */
  color: string;
  bgColor: string;
}

interface RunForTrend {
  distance: number; // metres
  avgPace: number; // sec/km
  completedAt: Date;
  activityType?: ActivityType | string;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

const MIN_COMPARABLE_RUNS = 8;
const DISTANCE_TOLERANCE = 0.2; // 20%
const IMPROVING_THRESHOLD = 0.98; // 2% faster than recent average
const CONSISTENT_THRESHOLD = 1.02; // within 2% of recent average

export function calculatePaceTrend(
  currentRun: RunForTrend,
  allRuns: RunForTrend[]
): PaceTrendResult {
  if (!isPaceTrendEligible(currentRun)) {
    return { trend: "no-data", label: "", color: "", bgColor: "" };
  }

  // Find comparable runs (within 20% distance, excluding the current one)
  const comparable = allRuns.filter((r) => {
    if (r.completedAt.getTime() === currentRun.completedAt.getTime())
      return false;
    if (!isPaceTrendEligible(r)) return false;
    const ratio = r.distance / currentRun.distance;
    return ratio >= 1 - DISTANCE_TOLERANCE && ratio <= 1 + DISTANCE_TOLERANCE;
  });

  if (comparable.length < MIN_COMPARABLE_RUNS) {
    return { trend: "no-data", label: "", color: "", bgColor: "" };
  }

  // Sort by date (oldest first)
  const sorted = [...comparable].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );

  const bestPace = Math.min(...sorted.map((r) => r.avgPace));
  const recentAvg =
    sorted.slice(-3).reduce((s, r) => s + r.avgPace, 0) /
    Math.min(3, sorted.length);

  // PR — current run is faster than all comparable
  if (currentRun.avgPace < bestPace) {
    return {
      trend: "pr",
      label: "PR!",
      color: THEME.amberLight,
      bgColor: `${THEME.amberLight}26`,
    };
  }

  // Improving — faster than recent average (never show if slower)
  if (currentRun.avgPace < recentAvg * IMPROVING_THRESHOLD) {
    return {
      trend: "improving",
      label: "Faster",
      /* Was teal-400 (#2dd4bf) — stock Tailwind, off-palette, and
         reading as the hydration teal. "Faster" is the positive
         register, so it takes THEME.success like every other one. */
      color: THEME.success,
      bgColor: `${THEME.success}26`,
    };
  }

  // Consistent — within 2% of recent average
  if (currentRun.avgPace <= recentAvg * CONSISTENT_THRESHOLD) {
    return {
      trend: "consistent",
      label: "Steady",
      /* bgColor was #7C6EF6 — a frozen snapshot of the LIGHT-mode
         --primary, so it did not even match the THEME.brand on the
         line above it. */
      color: THEME.brand,
      bgColor: `${THEME.brand}26`,
    };
  }

  // Slower — never show negative badge
  return { trend: "no-data", label: "", color: "", bgColor: "" };
}
