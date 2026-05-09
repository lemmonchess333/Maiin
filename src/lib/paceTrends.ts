/**
 * Pace Trend Badges — compare runs within 20% distance to detect improvement trends.
 *
 * Source eligibility: pace trends only consider runs that would be
 * pace-eligible under the Sprint 1 matrix — outdoor GPS, not
 * invalid, not savedAnyway. Treadmill / manual records would
 * compare against outdoor runs at face value (a treadmill 2:38/km
 * would falsely register as a PR), so they're excluded both as
 * the candidate (returns 'no-data') and as comparables.
 *
 * Legacy compat: `activityType` is optional on `RunForTrend` and
 * defaults to outdoor when missing — pre-Sprint-1 callers
 * (existing tests, older code paths) continue to work without
 * explicit fields. New callers from `useRunningStats` /
 * `RunSummary` plumb the full set so the filter actually fires.
 */

import { isOutdoorGpsRun } from './runGuards';
import type { ActivityType } from '@/types/run';

export type PaceTrend = "pr" | "improving" | "consistent" | "no-data";

export interface PaceTrendResult {
  trend: PaceTrend;
  label: string;
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

/* Pace-trend eligibility. Mirrors `isPaceEligible` but tailored to
   paceTrends's input shape (no duration field required — the
   existing `avgPace > 0 && distance > 0` floor in this module is
   sufficient for the misclick zombie case at this layer). */
function isPaceTrendEligible(r: RunForTrend): boolean {
  if (r.isInvalid === true) return false;
  if (r.savedAnyway === true) return false;
  if (r.avgPace <= 0 || r.distance <= 0) return false;
  /* Missing activityType is treated as outdoor for legacy compat —
     pre-Sprint-1 docs and existing tests don't carry the field
     and excluding them blanketly would erase historical trend
     data. New callers always pass it. */
  if (r.activityType !== undefined && !isOutdoorGpsRun(r.activityType as ActivityType)) {
    return false;
  }
  return true;
}

export function calculatePaceTrend(
  currentRun: RunForTrend,
  allRuns: RunForTrend[]
): PaceTrendResult {
  if (!isPaceTrendEligible(currentRun)) {
    return { trend: "no-data", label: "", color: "", bgColor: "" };
  }

  // Find comparable runs (within 20% distance, excluding the current one)
  const comparable = allRuns.filter((r) => {
    if (r.completedAt.getTime() === currentRun.completedAt.getTime()) return false;
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
    sorted.slice(-3).reduce((s, r) => s + r.avgPace, 0) / Math.min(3, sorted.length);

  // PR — current run is faster than all comparable
  if (currentRun.avgPace < bestPace) {
    return {
      trend: "pr",
      label: "PR!",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.15)",
    };
  }

  // Improving — faster than recent average (never show if slower)
  if (currentRun.avgPace < recentAvg * IMPROVING_THRESHOLD) {
    return {
      trend: "improving",
      label: "Faster",
      color: "#2dd4bf",
      bgColor: "rgba(45, 212, 191, 0.15)",
    };
  }

  // Consistent — within 2% of recent average
  if (currentRun.avgPace <= recentAvg * CONSISTENT_THRESHOLD) {
    return {
      trend: "consistent",
      label: "Steady",
      color: "#7B72E9",
      bgColor: "rgba(124, 110, 246, 0.15)",
    };
  }

  // Slower — never show negative badge
  return { trend: "no-data", label: "", color: "", bgColor: "" };
}
