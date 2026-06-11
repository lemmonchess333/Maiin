import { useMemo } from "react";
import { useWorkouts } from "./useWorkouts";
import { useRunningStats } from "./useRunningStats";
import { localDateString, addLocalDays } from "@/lib/dateHelpers";
import {
  resolveHybridGuidance,
  type DayType,
  type HybridGuidance,
  type YesterdayTraining,
} from "@/lib/hybridGuidance";

/**
 * Hybrid loop hook — derives yesterday's cross-discipline training from saved
 * workouts + runs and resolves today's guidance (see hybridGuidance.ts). The
 * "hard" heuristics live here (impure data shaping); the decision is the pure
 * engine. Returns null while data loads.
 *
 * "Hard" heuristics (gentle by design — a wrong "ease" hint is low-cost):
 *   - lift: a leg/lower session, a leg-compound movement, or a long session
 *   - run: long (≥ 8 km), long-duration (≥ 45 min), or a quality template
 */
const LEG_COMPOUND =
  /squat|deadlift|lunge|leg press|leg curl|leg extension|hip thrust|rdl|romanian|bulgarian/i;
const QUALITY_RUN = new Set(["tempo", "intervals", "long"]);

export function useHybridGuidance(todayType: DayType): HybridGuidance | null {
  const { workouts, loading: wLoading } = useWorkouts();
  const { runs, loading: rLoading } = useRunningStats(7);

  return useMemo(() => {
    if (wLoading || rLoading) return null;
    const yKey = localDateString(addLocalDays(new Date(), -1));

    const yWorkouts = workouts.filter((w) => w.date === yKey);
    const anyLift = yWorkouts.length > 0;
    const hardLift = yWorkouts.some(
      (w) =>
        (w.durationMinutes ?? 0) >= 50 ||
        w.exercises.some(
          (e) =>
            /leg|lower/i.test(e.category) || LEG_COMPOUND.test(e.exerciseName)
        )
    );

    const yRuns = runs.filter(
      (r) =>
        !r.isInvalid &&
        !r.savedAnyway &&
        localDateString(new Date(r.completedAt)) === yKey
    );
    const anyRun = yRuns.length > 0;
    const hardRun = yRuns.some(
      (r) =>
        r.distance >= 8000 ||
        r.duration >= 2700 ||
        QUALITY_RUN.has(r.activityType)
    );

    const y: YesterdayTraining = { anyLift, anyRun, hardLift, hardRun };
    return resolveHybridGuidance(todayType, y);
  }, [workouts, runs, wLoading, rLoading, todayType]);
}
