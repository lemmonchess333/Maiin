/**
 * Whether a session is the account's first: the post's "First session on
 * Tropos" (Soc15). And whether it is the first of its sport, a lifter's
 * first run or a runner's first lift, which the finish screen rewards as a
 * first (DS4 call 3, owner 7 November 2026). The post keeps the account's
 * first: its stored moment is `{ kind: "firstSession" }` and nothing more
 * (`validPostMoment` in firestore.rules).
 *
 * The finish screens hold windowed histories (the streak's 90 days, Train's
 * recent workouts), and a window says nothing about a lifter back after a
 * year away. So this reads each kind's newest two sessions, saved or still
 * on this phone (`fetchSavedWorkouts` / `fetchSavedRuns`), and asks whether
 * any is not the session itself: two documents a kind, however long the
 * history.
 */
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { logger } from "@/lib/logger";

/** Whether the account has an earlier workout, and an earlier run. */
export interface EarlierSessions {
  workouts: boolean;
  runs: boolean;
}

/**
 * Whether the account has a saved workout, and a saved run, other than the
 * ones named. Null when that can't be known: offline, where a read answered
 * from this phone's cache could miss an older session, or when the read
 * fails. A first is claimed only on a known false.
 */
export async function earlierSessions(
  uid: string,
  own: { workoutId?: string | null; runId?: string | null } = {}
): Promise<EarlierSessions | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return null;
  try {
    const [workouts, runs] = await Promise.all([
      fetchSavedWorkouts(uid, { latest: 2 }),
      fetchSavedRuns(uid, { latest: 2 }),
    ]);
    return {
      workouts: workouts.some((workout) => workout.id !== own.workoutId),
      runs: runs.some((run) => run.id !== own.runId),
    };
  } catch (err) {
    logger.warn("[firstSession] earlier sessions not read", err);
    return null;
  }
}

/** The account's first session: no earlier session of either sport. */
export function isFirstSession(earlier: EarlierSessions | null): boolean {
  return earlier !== null && !earlier.workouts && !earlier.runs;
}

/** The first session of its sport: a lifter's first run counts. */
export function isFirstOfSport(
  earlier: EarlierSessions | null,
  sport: "lift" | "run"
): boolean {
  return (
    earlier !== null && !(sport === "lift" ? earlier.workouts : earlier.runs)
  );
}
