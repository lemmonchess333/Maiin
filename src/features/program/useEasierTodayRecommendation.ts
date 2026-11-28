import { useCallback, useEffect, useMemo, useState } from "react";
import { useUid } from "@/lib/auth";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isHardRun } from "@/lib/hybridGuidance";
import { readFeel, subscribeFeel } from "@/lib/readinessFeel";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import type { Feel } from "@/lib/readiness";
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
  const uid = useUid();
  const { runs, evidenceReady } = useRunningStats(2);
  const today = useLocalDateKey();
  const [feel, setFeel] = useState<Feel | null>(() =>
    uid ? readFeel(uid, today) : null
  );
  useEffect(() => {
    const sync = () => setFeel(uid ? readFeel(uid, today) : null);
    sync();
    return subscribeFeel(sync);
  }, [uid, today]);

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
    const training = easierTodayRecommendation({
      hardRunYesterday,
      lowerBodyDay: isLowerBodyDay(day),
    });
    if (training.recommended) return training;
    if (feel === "rough") {
      return { recommended: true, reason: "you said you feel rough today" };
    }
    if (feel === "tired") {
      return { recommended: true, reason: "you said you’re tired today" };
    }
    return training;
  }, [day, runs, evidenceReady, today, feel]);
}
