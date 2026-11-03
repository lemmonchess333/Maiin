/**
 * Whether a session is the account's first: the post's "First session on
 * Tropos" (Soc15).
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

/**
 * True when the account has a saved workout or run other than the ones
 * named, false when it has none. Null when that can't be known: offline,
 * where a read answered from this phone's cache could miss an older
 * session, or when the read fails. A moment is claimed only on a false.
 */
export async function hasEarlierSession(
  uid: string,
  own: { workoutId?: string | null; runId?: string | null } = {}
): Promise<boolean | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return null;
  try {
    const [workouts, runs] = await Promise.all([
      fetchSavedWorkouts(uid, { latest: 2 }),
      fetchSavedRuns(uid, { latest: 2 }),
    ]);
    return (
      workouts.some((workout) => workout.id !== own.workoutId) ||
      runs.some((run) => run.id !== own.runId)
    );
  } catch (err) {
    logger.warn("[firstSession] earlier sessions not read", err);
    return null;
  }
}
