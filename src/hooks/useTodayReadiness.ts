import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useRunningStats } from "@/hooks/useRunningStats";
import { addLocalDays, localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { isHardRun } from "@/lib/hybridGuidance";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import {
  readinessFor,
  type BodySignals,
  type Feel,
  type Readiness,
} from "@/lib/readiness";
import { readFeel, writeFeel } from "@/lib/readinessFeel";
import { isLowerBodyDay } from "@/features/program/easierToday";
import type { WorkoutDay } from "@/features/program/programTypes";

export interface TodayReadiness {
  readiness: Readiness;
  feel: Feel | null;
  /** Keep this morning's answer (null asks again). */
  setFeel: (feel: Feel | null) => void;
}

/**
 * Readiness for today's lift (whole-app grill Q41): this morning's answer,
 * kept on the phone, and the training fact the app already reads for
 * "Go easier today" on Train (a hard run yesterday before a day that loads
 * the same legs). `body` is sleep and heart from Apple Health, passed only
 * for a Pro account once Health is connected; null keeps it to the free
 * reasons (Q76).
 */
export function useTodayReadiness(
  day: Pick<WorkoutDay, "exercises"> | undefined,
  body: BodySignals | null = null
): TodayReadiness {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const today = useLocalDateKey();
  const [feel, setFeelState] = useState<Feel | null>(() =>
    uid ? readFeel(uid, today) : null
  );
  /* A new day, or another account, asks afresh. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read the stored answer when the day or account changes
    setFeelState(uid ? readFeel(uid, today) : null);
  }, [uid, today]);

  const { runs, evidenceReady } = useRunningStats(2);
  const hardRunYesterday = useMemo(() => {
    if (!evidenceReady) return false;
    const yesterday = localDateString(addLocalDays(parseLocalDate(today), -1));
    return runs.some(
      (run) =>
        isVolumeEligible(run) &&
        runEvidenceDate(run) === yesterday &&
        isHardRun(run)
    );
  }, [runs, evidenceReady, today]);

  const readiness = useMemo(
    () =>
      readinessFor({
        feel,
        hardRunYesterday,
        legDayYesterday: false,
        todayLoadsLegs: day ? isLowerBodyDay(day) : false,
        todayHardRun: false,
        body,
      }),
    [feel, hardRunYesterday, day, body]
  );

  const setFeel = useCallback(
    (next: Feel | null) => {
      if (uid) writeFeel(uid, today, next);
      setFeelState(next);
    },
    [uid, today]
  );

  return { readiness, feel, setFeel };
}
