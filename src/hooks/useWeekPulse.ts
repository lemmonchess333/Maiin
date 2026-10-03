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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { scheduledDaysSinceStart, startDayKey } from "@/lib/startDay";
import {
  buildWeekPulse,
  weekBounds,
  inWeek,
  type ReviewRun,
  type WeekPulse,
} from "@/lib/weeklyReviewViewModel";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { resolveRunPlanSurface } from "@/lib/runProgrammeViewModel";
import { logger } from "@/lib/logger";

/** The run a run's finish screen is showing, saved or not yet. */
export interface PendingRun extends Omit<ReviewRun, "date"> {
  /** Its document id once known; a fetched run with this id is the same run. */
  id: string | null;
  /** Its local date; null for one with no trace, counted as today's. */
  date: string | null;
}

interface WeekFetch {
  weekKey: string;
  /** The day the week was read, for a pending run with no date. */
  todayKey: string;
  workouts: { date: string }[];
  runs: (ReviewRun & { id: string })[];
  plannedLifts: number | null;
  plannedRuns: number | null;
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
        const weekKey = localWeekKey(new Date());
        const { start, end } = weekBounds(weekKey);
        const [workoutsSnap, savedRuns, programStateSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", user.uid, "workouts"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          // Through the saved-run reader: the week's runs by their Lift3
          // day, including runs saved before `date` existed (a `date`-only
          // query left those out) and runs saved on this phone.
          fetchSavedRuns(user.uid, { since: start, until: end }),
          getDoc(doc(db, "users", user.uid, "programState", "current")),
        ]);
        if (cancelled) return;

        const workouts = workoutsSnap.docs
          .map((d) => d.data() as { date?: unknown })
          .filter((w): w is { date: string } => typeof w.date === "string");
        const runs = savedRuns.map((run) => ({
          id: run.id,
          date: run.day,
          distanceMeters: run.distance,
          eligible: isVolumeEligible(run),
        }));

        const schedule = Array.isArray(profile?.weekSchedule)
          ? (profile.weekSchedule as { day?: number; type?: string }[])
          : [];
        // In the week the account began, only the days since (startDay.ts).
        const liftDays = scheduledDaysSinceStart(
          schedule,
          ["lift", "both"],
          weekKey,
          startDayKey(profile?.createdAt)
        );

        // Planned runs only when a race plan exists (Run9a: freeform →
        // done-only framing — same rule as the review).
        const programState = programStateSnap.exists()
          ? (programStateSnap.data() as Record<string, unknown>)
          : null;
        const surface = resolveRunPlanSurface(
          profile as Parameters<typeof resolveRunPlanSurface>[0],
          programState as Parameters<typeof resolveRunPlanSurface>[1]
        );
        const runPlan = programState?.runPlan as
          | { runDays?: { date?: string }[] }
          | undefined;
        const plannedRuns =
          surface.kind === "race_goal" && Array.isArray(runPlan?.runDays)
            ? runPlan.runDays.filter(
                (d) => typeof d.date === "string" && inWeek(d.date, weekKey)
              ).length
            : null;

        setWeek({
          weekKey,
          todayKey: localDateString(),
          workouts,
          runs,
          plannedLifts: liftDays > 0 ? liftDays : null,
          plannedRuns,
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
  const pendingMeters = pendingRun?.distanceMeters ?? 0;
  const pendingEligible = pendingRun?.eligible ?? false;
  return useMemo(() => {
    if (!week) return null;
    const alreadyRead =
      pendingId !== null && week.runs.some((r) => r.id === pendingId);
    const runs =
      hasPending && !alreadyRead
        ? [
            ...week.runs,
            {
              date: pendingDate ?? week.todayKey,
              distanceMeters: pendingMeters,
              eligible: pendingEligible,
            },
          ]
        : week.runs;
    return buildWeekPulse({
      weekKey: week.weekKey,
      workouts: week.workouts,
      runs,
      plannedLifts: week.plannedLifts,
      plannedRuns: week.plannedRuns,
      streak: currentStreak,
      pendingLifts,
    });
  }, [
    week,
    hasPending,
    pendingId,
    pendingDate,
    pendingMeters,
    pendingEligible,
    currentStreak,
    pendingLifts,
  ]);
}
