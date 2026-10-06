import { useMemo } from "react";
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
