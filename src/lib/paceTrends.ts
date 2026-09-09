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
import { isPaceTrendEligible } from "./runStatsEligibility";

export type PaceTrend = "pr" | "improving" | "consistent" | "no-data";

export interface PaceTrendResult {
  trend: PaceTrend;
  label: string;
  /**
   * Tailwind classes for the badge: a token tint plus that token's AA
   * text step. NOT a colour string — RunSummary renders this badge at
   * `text-sm font-semibold` (14px, so 4.5:1 applies, not 3:1), and the
   * fixed values that used to live here could not clear it. Measured on
   * `--background`, the page canvas the badge actually sits on and the
   * worst of the three surfaces in light mode:
   *
   *              was     now
   *   PR!      1.66:1  4.82:1
   *   Faster   1.90:1  4.50:1
   *   Steady   2.81:1  4.60:1   (also failed DARK, at 4.13:1)
   *
   * Two things had to move together. The colours became the tuned
   * `-strong` steps — theme-aware, unlike the frozen hex — and the tint
   * dropped 15% -> 10%, because in light mode a denser tint darkens the
   * ground under dark text. At 15% even the correct steps only reach
   * 4.22 / 4.37 on the canvas; 10% is the strongest tint at which all
   * three clear AA on card, muted AND background in both themes.
   *
   * Writing them as CLASSES rather than `hsl(var(--x) / 0.1)` is what
   * keeps them honest: `tokenContrast.test.ts` derives its tint alphas
   * by scanning the source for `bg-<token>/<n>`, so this badge is now
   * inside a guard that already existed, and raising the tint back to
   * /15 turns that suite red on its own.
   *
   * `--lifting` is the token whose value IS `THEME.brand` (#7B72E9);
   * `--primary` is a slightly different purple, and `--primary-strong`
   * is the darker step for white text ON a purple fill — the opposite
   * direction, and 3.24:1 here. The "lifting" name is the documented
   * value-alias debt, not a claim that Steady is a lifting badge.
   */
  className: string;
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
    return { trend: "no-data", label: "", className: "" };
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
    return { trend: "no-data", label: "", className: "" };
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
      className: "bg-achievement/10 text-achievement-strong",
    };
  }

  // Improving — faster than recent average (never show if slower)
  if (currentRun.avgPace < recentAvg * IMPROVING_THRESHOLD) {
    return {
      trend: "improving",
      label: "Faster",
      className: "bg-success/10 text-success-strong",
    };
  }

  // Consistent — within 2% of recent average
  if (currentRun.avgPace <= recentAvg * CONSISTENT_THRESHOLD) {
    return {
      trend: "consistent",
      label: "Steady",
      className: "bg-lifting/10 text-lifting-strong",
    };
  }

  // Slower — never show negative badge
  return { trend: "no-data", label: "", className: "" };
}
