import { useMemo } from "react";
import { useUid } from "@/lib/auth";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import { SAVED_WORKOUTS } from "@/lib/savedWorkouts";
import { boundaryDayKey } from "./useChallenges";
import { outOfReach, reachTurnsOnDaysTrained } from "./challengeReach";
import type { ReachChallenge } from "./challengeReach";

/**
 * The challenges the person can no longer finish, by id (`outOfReach`).
 *
 * Only a challenge whose first goal needs more days than it has left needs
 * the person's days trained, so the saved sessions are read only then, from
 * the earliest such window's first day to today: most of a month reads
 * nothing. The count is every day with a saved lift or run, more than the
 * server credits (it leaves some runs out), so a count that is off errs
 * towards reachable. Joined, the server's own count stands in when it is
 * higher. Until both reads have answered, nothing is out of reach.
 */
export function useChallengeReach(
  challenges: readonly ReachChallenge[],
  progress: Readonly<Record<string, { currentValue?: number } | undefined>>
): ReadonlySet<string> {
  const uid = useUid();
  const todayKey = useLocalDateKey();
  const inDoubt = challenges.filter((c) =>
    reachTurnsOnDaysTrained(c, todayKey)
  );
  const since = inDoubt
    .map((c) => boundaryDayKey(c.startDate))
    .filter((k): k is string => !!k)
    .sort()[0];
  const window = useMemo(
    () => (since ? { since, until: todayKey } : null),
    [since, todayKey]
  );
  const workouts = useSavedSessions(SAVED_WORKOUTS, uid, window);
  const runs = useSavedRuns(window);
  const answered =
    window !== null &&
    workouts.answered &&
    runs.answered &&
    !workouts.failed &&
    !runs.failed;
  const days = answered
    ? [...workouts.items.map((w) => w.date), ...runs.runs.map((r) => r.day)]
    : null;

  const ids = inDoubt
    .filter((c) => {
      if (!days) return false;
      const start = boundaryDayKey(c.startDate) ?? "";
      const trained = new Set(days.filter((d) => d >= start && d <= todayKey))
        .size;
      const credited = progress[c.id]?.currentValue ?? 0;
      return outOfReach(c, Math.max(trained, credited), todayKey);
    })
    .map((c) => c.id);
  const key = ids.join(",");
  return useMemo(() => new Set(key ? key.split(",") : []), [key]);
}
