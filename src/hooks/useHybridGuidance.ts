import { useMemo } from "react";
import type { Workout } from "./useWorkouts";
import { useRunningStats } from "./useRunningStats";
import { localDateString, addLocalDays } from "@/lib/dateHelpers";
import {
  isHardRun,
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
 * The caller supplies the workouts result (PROGRAM-ADAPT-01 reliability fix):
 * Home already holds a live `useWorkouts()` subscription, and this hook
 * previously opened a SECOND `onSnapshot` on the same collection just to read
 * yesterday — every Home mount cost a duplicate Firestore listener. Threading
 * the existing result in keeps one subscription per surface.
 *
 * "Hard" heuristics (gentle by design — a wrong "ease" hint is low-cost):
 *   - lift: a knee/hip-dominant (lower-body) session, a leg-compound
 *     movement by name, or a long session
 *   - run: `isHardRun` (long, long-duration, or a quality template) —
 *     shared with the Easier-today recommendation
 */
const LEG_COMPOUND =
  /squat|deadlift|lunge|leg press|leg curl|leg extension|hip thrust|rdl|romanian|bulgarian/i;

/** Saved workout docs store `category` = the exercise's movementCategory
 *  ("knee_dominant" / "hip_dominant" for legs). The previous
 *  `/leg|lower/i` test never matched those values — lower-body work was
 *  only caught by the name regex fallback. */
const LOWER_BODY_CATEGORY = /^(knee_dominant|hip_dominant)$/;

export function useHybridGuidance(
  todayType: DayType,
  workouts: Workout[],
  workoutsLoading: boolean
): HybridGuidance | null {
  const { runs, loading: rLoading } = useRunningStats(7);

  return useMemo(() => {
    if (workoutsLoading || rLoading) return null;
    const yKey = localDateString(addLocalDays(new Date(), -1));

    const yWorkouts = workouts.filter((w) => w.date === yKey);
    const anyLift = yWorkouts.length > 0;
    const hardLift = yWorkouts.some(
      (w) =>
        (w.durationMinutes ?? 0) >= 50 ||
        w.exercises.some(
          (e) =>
            LOWER_BODY_CATEGORY.test(e.category) ||
            LEG_COMPOUND.test(e.exerciseName)
        )
    );

    const yRuns = runs.filter(
      (r) =>
        !r.isInvalid &&
        !r.savedAnyway &&
        localDateString(new Date(r.completedAt)) === yKey
    );
    const anyRun = yRuns.length > 0;
    const hardRun = yRuns.some((r) => isHardRun(r));

    const y: YesterdayTraining = { anyLift, anyRun, hardLift, hardRun };
    return resolveHybridGuidance(todayType, y);
  }, [workouts, runs, workoutsLoading, rLoading, todayType]);
}
