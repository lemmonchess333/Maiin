/**
 * Data layer for the WeekPulseCard (Rev1 PR2) — the CURRENT week's
 * training progress, fetched once on mount of a completion screen.
 * Returns null while loading (the card simply doesn't render —
 * completion screens must never jank).
 *
 * `pendingLifts` counts a session the caller has FINISHED but not yet
 * saved. The header used to claim "both callers render after their session
 * doc is saved, so the fresh session is included" — that was false in both
 * directions: the lift screen renders under `sessionComplete`, which is a
 * pure setState, while the save is dispatched later by the "Save workout"
 * button on that same screen. So the card fetched BEFORE the write, and
 * since the screen unmounts on save success, the excluding number was the
 * only one the user ever saw ("0 of 6 lifts" straight after finishing one).
 * There is no refetch path to lean on — hence an explicit argument.
 */
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import {
  buildWeekPulse,
  weekBounds,
  type WeekPulse,
} from "@/lib/weeklyReviewViewModel";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import {
  trainingWeek,
  type TrainingWeekInput,
  type WeekRun,
} from "@/lib/trainingWeek";
import { logger } from "@/lib/logger";

/** The run a run's finish screen is showing, saved or not yet. */
export interface PendingRun {
  /** Its document id once known; a fetched run with this id is the same run. */
  id: string | null;
  /** Its local date; null for one with no trace, counted as today's. */
  date: string | null;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Flagged invalid on the finish screen: it counts nowhere. */
  isInvalid: boolean;
}

interface WeekFetch {
  weekKey: string;
  /** When the week was read: a pending run with no date is that day's. */
  readAt: Date;
  workouts: { date: string }[];
  runs: (WeekRun & { id: string })[];
  /** The plan and the profile as they were when the week was read. */
  programState: TrainingWeekInput["programState"];
  profile: TrainingWeekInput["profile"];
}

export function useWeekPulse(
  pendingLifts = 0,
  /**
   * The run screen's own run. The card loads when the screen opens, which
   * is before Save, so the run was never in the read and the week line
   * left out the run just finished. It is counted here unless the read
   * already holds it.
   */
  pendingRun: PendingRun | null = null
): WeekPulse | null {
  const { user, profile } = useAuth();
  const { currentStreak } = useStreaks();
  const [week, setWeek] = useState<WeekFetch | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const readAt = new Date();
        const weekKey = localWeekKey(readAt);
        const { start, end } = weekBounds(weekKey);
        const [savedWorkouts, savedRuns, programStateSnap] = await Promise.all([
          // Through the saved-workout reader: the week's workouts, including
          // one finished on this phone and not yet synced.
          fetchSavedWorkouts(user.uid, { since: start, until: end }),
          // Through the saved-run reader: the week's runs by their Lift3
          // day, including runs saved before `date` existed (a `date`-only
          // query left those out) and runs saved on this phone.
          fetchSavedRuns(user.uid, { since: start, until: end }),
          getDoc(doc(db, "users", user.uid, "programState", "current")),
        ]);
        if (cancelled) return;

        setWeek({
          weekKey,
          readAt,
          workouts: savedWorkouts.map((w) => ({ date: w.date })),
          runs: savedRuns,
          programState: programStateSnap.exists()
            ? (programStateSnap.data() as TrainingWeekInput["programState"])
            : null,
          profile,
        });
      } catch (err) {
        logger.warn("[useWeekPulse] fetch failed", err);
        // Leave null — the card just doesn't render.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot on mount; streak/profile churn shouldn't refetch mid-screen.
    // The pending session and run are render-time addends, not fetch inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const hasPending = pendingRun !== null;
  const pendingId = pendingRun?.id ?? null;
  const pendingDate = pendingRun?.date ?? null;
  const pendingDistance = pendingRun?.distance ?? 0;
  const pendingDuration = pendingRun?.duration ?? 0;
  const pendingInvalid = pendingRun?.isInvalid ?? false;
  return useMemo(() => {
    if (!week) return null;
    const alreadyRead =
      pendingId !== null && week.runs.some((r) => r.id === pendingId);
    const runs: WeekRun[] =
      hasPending && !alreadyRead
        ? [
            ...week.runs,
            {
              day: pendingDate ?? localDateString(week.readAt),
              distance: pendingDistance,
              duration: pendingDuration,
              isInvalid: pendingInvalid,
            },
          ]
        : week.runs;
    return buildWeekPulse({
      week: trainingWeek({
        weekKey: week.weekKey,
        profile: week.profile,
        programState: week.programState,
        workouts: week.workouts,
        runs,
        now: week.readAt,
      }),
      streak: currentStreak,
      pendingLifts,
    });
  }, [
    week,
    hasPending,
    pendingId,
    pendingDate,
    pendingDistance,
    pendingDuration,
    pendingInvalid,
    currentStreak,
    pendingLifts,
  ]);
}
