import { useMemo } from "react";
import { useWorkouts, type Workout } from "@/hooks/useWorkouts";
import { useRunningStats, type RunSummaryItem } from "@/hooks/useRunningStats";

export type RecentSession =
  | { kind: "workout"; workout: Workout }
  | { kind: "run"; run: RunSummaryItem };

const RECENT_SESSIONS_MAX = 5;

function sessionTime(s: RecentSession): number {
  return s.kind === "run"
    ? s.run.completedAt.getTime()
    : (s.workout.createdAt?.toDate?.().getTime() ?? 0);
}

/**
 * The caller's five most recent sessions across both disciplines, newest
 * first — enough to attach "what I just did" to a space post without
 * building a browser. The Space page reads it to decide whether its empty
 * state can offer "Share your last session", and hands the same list to
 * the composer so both agree on which session is the latest.
 */
export function useRecentSessions(): RecentSession[] {
  const { workouts } = useWorkouts();
  const { runs } = useRunningStats(30);
  return useMemo(() => {
    const ws: RecentSession[] = workouts
      .slice(0, RECENT_SESSIONS_MAX)
      .map((workout) => ({ kind: "workout", workout }));
    const rs: RecentSession[] = runs
      .slice(0, RECENT_SESSIONS_MAX)
      .map((run) => ({ kind: "run", run }));
    return [...ws, ...rs]
      .sort((a, b) => sessionTime(b) - sessionTime(a))
      .slice(0, RECENT_SESSIONS_MAX);
  }, [workouts, runs]);
}
