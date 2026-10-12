import { useCallback, useMemo } from "react";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isHardRun } from "@/lib/hybridGuidance";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { easierTodayRecommendation, isLowerBodyDay } from "./easierToday";
import type { WorkoutDay } from "./programTypes";

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * Whether a long or hard run (`isHardRun`) finished in the 24 hours before
 * a session started (Lift4 (14)), from the runs this page already reads.
 * The finish records the answer, and a leg miss after such a run counts
 * half (Lift4 (7)).
 */
export function useHardRunBefore(): (startedAt: number) => boolean {
  const { runs, evidenceReady } = useRunningStats(2);
  return useCallback(
    (startedAt: number) =>
      evidenceReady &&
      runs.some((run) => {
        const finished = run.completedAt.getTime();
        return (
          finished <= startedAt &&
          startedAt - finished <= DAY_MS &&
          isVolumeEligible(run) &&
          isHardRun(run)
        );
      }),
    [runs, evidenceReady]
  );
}

/** Advice for the actual cursor/chooser day; never writes a prescription. */
export function useEasierTodayRecommendation(day: WorkoutDay | undefined) {
  const { runs, evidenceReady } = useRunningStats(2);
  const today = useLocalDateKey();
  return useMemo(() => {
    if (!day) return null;
    const yesterday = localDateString(addLocalDays(parseLocalDate(today), -1));
    const hardRunYesterday =
      evidenceReady &&
      runs.some(
        (run) =>
          isVolumeEligible(run) &&
          runEvidenceDate(run) === yesterday &&
          isHardRun(run)
      );
    return easierTodayRecommendation({
      hardRunYesterday,
      lowerBodyDay: isLowerBodyDay(day),
    });
  }, [day, runs, evidenceReady, today]);
}
