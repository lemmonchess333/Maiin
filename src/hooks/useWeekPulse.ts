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
 * pure setState, while the save is dispatched later by the "Save Workout"
 * button on that same screen. So the card fetched BEFORE the write, and
 * since the screen unmounts on save success, the excluding number was the
 * only one the user ever saw ("0 of 6 lifts" straight after finishing one).
 * There is no refetch path to lean on — hence an explicit argument.
 */
import { useEffect, useState } from "react";
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
import { getWeekKey } from "@/lib/performanceEngine";
import {
  buildWeekPulse,
  weekBounds,
  inWeek,
  type WeekPulse,
} from "@/lib/weeklyReviewViewModel";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { resolveRunPlanSurface } from "@/lib/runProgrammeViewModel";
import { logger } from "@/lib/logger";

export function useWeekPulse(pendingLifts = 0): WeekPulse | null {
  const { user, profile } = useAuth();
  const { currentStreak } = useStreaks();
  const [pulse, setPulse] = useState<WeekPulse | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const weekKey = getWeekKey(new Date());
        const { start, end } = weekBounds(weekKey);
        const [workoutsSnap, runsSnap, programStateSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", user.uid, "workouts"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          getDocs(
            query(
              collection(db, "users", user.uid, "runs"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          getDoc(doc(db, "users", user.uid, "programState", "current")),
        ]);
        if (cancelled) return;

        const workouts = workoutsSnap.docs
          .map((d) => d.data() as { date?: unknown })
          .filter((w): w is { date: string } => typeof w.date === "string");
        const runs = runsSnap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((r) => typeof r.date === "string")
          .map((r) => ({
            date: r.date as string,
            distanceMeters: typeof r.distance === "number" ? r.distance : 0,
            eligible: isVolumeEligible(
              r as Parameters<typeof isVolumeEligible>[0]
            ),
          }));

        const schedule = Array.isArray(profile?.weekSchedule)
          ? (profile.weekSchedule as { type?: string }[])
          : [];
        const liftDays = schedule.filter(
          (s) => s.type === "lift" || s.type === "both"
        ).length;

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

        setPulse(
          buildWeekPulse({
            weekKey,
            workouts,
            runs,
            plannedLifts: liftDays > 0 ? liftDays : null,
            plannedRuns,
            streak: currentStreak,
            pendingLifts,
          })
        );
      } catch (err) {
        logger.warn("[useWeekPulse] fetch failed", err);
        // Leave null — the card just doesn't render.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot on mount; streak/profile churn shouldn't refetch mid-screen.
    // `pendingLifts` is a render-time addend rather than a fetch input, so it
    // deliberately does not retrigger the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, pendingLifts]);

  return pulse;
}
