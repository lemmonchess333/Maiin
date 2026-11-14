/**
 * The year a "your year" recap tells (App1 Q56), read once when it opens:
 * the training year in a few numbers, and what Pro did over it. The year
 * is the subscription's, from a year before the renewal to today
 * (`yearRecapDue`).
 *
 * The reads are a year of saved workouts and runs through their one
 * readers, the year's meals, the 200 workouts before it as the bests'
 * baseline (as the review measures a week's), and the plan. Once a year
 * per account, behind a tap.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import { weekNewBests } from "@/hooks/useWeeklyReview";
import { fetchProPeriodMeals, fetchProRacePlan } from "@/hooks/useProReport";
import {
  proReportLines,
  type ProLine,
  type YearRecapDue,
} from "@/lib/proReport";
import { logger } from "@/lib/logger";

/** The bests' baseline: the review's, about three months of heavy logging. */
const BASELINE_WORKOUTS = 200;

export interface TrainingYear {
  lifts: number;
  /** Runs that count (`isVolumeEligible`), as every week count reads them. */
  runs: number;
  /** Their kilometres, to one decimal. */
  km: number;
  /** New bests, one per exercise and rep range, as the review counts them. */
  bests: number;
  tonnageKg: number;
}

export interface YearRecapData {
  training: TrainingYear;
  lines: ProLine[];
}

export function useYearRecap(due: YearRecapDue): {
  loading: boolean;
  failed: boolean;
  data: YearRecapData | null;
  retry: () => void;
} {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    attempt: number;
    data: YearRecapData | null;
    failed: boolean;
  }>({ attempt: -1, data: null, failed: false });
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const period = { start: due.start, end: due.end };
    (async () => {
      try {
        const [workouts, baseline, runs, meals, racePlan] = await Promise.all([
          fetchSavedWorkouts(uid, { since: period.start, until: period.end }),
          fetchSavedWorkouts(uid, {
            latest: BASELINE_WORKOUTS,
            before: period.start,
          }),
          fetchSavedRuns(uid, { since: period.start, until: period.end }),
          fetchProPeriodMeals(uid, period),
          fetchProRacePlan(uid, profile?.raceGoal?.distance),
        ]);
        if (cancelled) return;
        const counted = runs.filter((run) => isVolumeEligible(run));
        const metres = counted.reduce((sum, run) => sum + run.distance, 0);
        const training: TrainingYear = {
          lifts: workouts.length,
          runs: counted.length,
          km: Math.round(metres / 100) / 10,
          bests: weekNewBests(baseline, workouts).count,
          tonnageKg: Math.round(
            workouts.reduce((sum, w) => sum + workoutTonnageKg(w), 0)
          ),
        };
        setState({
          attempt,
          failed: false,
          data: {
            training,
            lines: proReportLines({
              ...period,
              changes: profile?.proChanges,
              meals,
              racePlan,
            }),
          },
        });
      } catch (err) {
        logger.error("[useYearRecap] read failed", err);
        if (!cancelled) setState({ attempt, data: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The profile is read as the recap opens; its identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, due.start, due.end, attempt]);

  const settled = state.attempt === attempt;
  return {
    loading: !settled,
    failed: settled && state.failed,
    data: settled ? state.data : null,
    retry,
  };
}
