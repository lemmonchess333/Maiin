/**
 * Pace Trend Badges — compare runs within 20% distance to detect improvement trends.
 */

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
}

const MIN_COMPARABLE_RUNS = 8;
const DISTANCE_TOLERANCE = 0.2; // 20%
const IMPROVING_THRESHOLD = 0.98; // 2% faster than recent average
const CONSISTENT_THRESHOLD = 1.02; // within 2% of recent average

export function calculatePaceTrend(
  currentRun: RunForTrend,
  allRuns: RunForTrend[]
): PaceTrendResult {
  if (currentRun.avgPace <= 0 || currentRun.distance <= 0) {
    return { trend: "no-data", label: "", color: "", bgColor: "" };
  }

  // Find comparable runs (within 20% distance, excluding the current one)
  const comparable = allRuns.filter((r) => {
    if (r.completedAt.getTime() === currentRun.completedAt.getTime()) return false;
    if (r.avgPace <= 0 || r.distance <= 0) return false;
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
