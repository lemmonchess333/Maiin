/**
 * Data layer for the WeekPulseCard (Rev1 PR2) — the CURRENT week's
 * training progress, fetched once on mount of a completion screen.
 * Both callers render after their session doc is saved, so the fresh
 * session is included in the counts. Returns null while loading (the
 * card simply doesn't render — completion screens must never jank).
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

export function useWeekPulse(): WeekPulse | null {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return pulse;
}
