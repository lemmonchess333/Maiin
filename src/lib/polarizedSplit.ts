export interface PolarizedSplitRun {
  activityType?: string | null;
  type?: string | null;
  duration?: number | null;
  distance?: number | null;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

export interface PolarizedSplitResult {
  lowIntensityPct: number;
  highIntensityPct: number;
  runCount: number;
  status: "polarized" | "too_hard" | "all_easy" | "insufficient";
}

const HIGH_INTENSITY_RUN_TYPES = new Set([
  "tempo",
  "intervals",
  "interval",
  "threshold",
  "race",
  "speed",
  "vo2",
  "repetition",
  "fartlek",
]);

/**
 * Computes Seiler 80/20 polarized intensity distribution across valid logged
 * runs. Reads `SavedRun.activityType` first (falling back to legacy `type`),
 * skips invalid runs unless `savedAnyway`, and weights each run by duration
 * in minutes (falling back to distance in km, then 1).
 */
export function computePolarizedSplit(
  runs: ReadonlyArray<PolarizedSplitRun>
): PolarizedSplitResult {
  const validRuns = runs.filter((run) => !(run.isInvalid && !run.savedAnyway));

  if (validRuns.length < 3) {
    return {
      lowIntensityPct: 0,
      highIntensityPct: 0,
      runCount: validRuns.length,
      status: "insufficient",
    };
  }

  let low = 0;
  let high = 0;

  for (const run of validRuns) {
    const weight =
      typeof run.duration === "number" && run.duration > 0
        ? run.duration / 60
        : typeof run.distance === "number" && run.distance > 0
          ? run.distance / 1000
          : 1;
    const rawType = (run.activityType ?? run.type ?? "").trim().toLowerCase();
    if (HIGH_INTENSITY_RUN_TYPES.has(rawType)) {
      high += weight;
    } else {
      low += weight;
    }
  }

  const total = low + high;
  if (total <= 0) {
    return {
      lowIntensityPct: 0,
      highIntensityPct: 0,
      runCount: validRuns.length,
      status: "insufficient",
    };
  }

  const lowIntensityPct = Math.round((low / total) * 100);
  const highIntensityPct = 100 - lowIntensityPct;
  const status =
    highIntensityPct === 0
      ? "all_easy"
      : highIntensityPct > 25
        ? "too_hard"
        : "polarized";

  return {
    lowIntensityPct,
    highIntensityPct,
    runCount: validRuns.length,
    status,
  };
}
