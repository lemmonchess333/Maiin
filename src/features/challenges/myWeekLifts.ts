import { localDateString, startOfLocalWeek } from "@/lib/dateHelpers";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";

/** Your own lift sessions this week, for the weekly challenge's card,
 *  whether or not you have joined: your sessions are yours to read. */
export async function countMyWeekLifts(uid: string): Promise<number> {
  // The week's first day through the shared anchor, as a LOCAL day key:
  // `workout.date` is the local day a session started (Lift3).
  const since = localDateString(startOfLocalWeek(new Date()));
  const workouts = await fetchSavedWorkouts(uid, { since, cap: 50 });
  return workouts.length;
}
