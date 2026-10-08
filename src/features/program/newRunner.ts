import { differenceInCalendarDays } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { startDayKey } from "@/lib/startDay";
import { RUN_WALK_TEMPLATE_IDS } from "@/lib/workoutTemplates";

/**
 * A new runner's first weeks (Run20 (5)): no tempo or intervals in them, so
 * they build the running itself, and each runs as run-walk (NHS Couch to 5K).
 * The evidence puts structured quality after a novice's first four to six
 * weeks, with strides allowed (running-evidence, Daniels); six is a Tropos
 * heuristic inside that range.
 */
export const NEW_RUNNER_WEEKS = 6;

/**
 * The day a new runner's first weeks end, counted from the day they began:
 * setup's "New to running" (`runFrequency: "new"`). Null for anyone else, or
 * while the day they began isn't known.
 */
export function newRunnerUntil(
  runFrequency: UserProfile["runFrequency"] | undefined,
  startKey: string | null | undefined
): string | null {
  if (runFrequency !== "new" || !startKey) return null;
  return localDateString(
    addLocalDays(parseLocalDate(startKey), NEW_RUNNER_WEEKS * 7)
  );
}

/** `newRunnerUntil` for a stored profile, which began on its `createdAt`. */
export function profileNewRunnerUntil(
  profile: Pick<UserProfile, "runFrequency" | "createdAt"> | null | undefined
): string | null {
  return newRunnerUntil(profile?.runFrequency, startDayKey(profile?.createdAt));
}

/**
 * The run-walk session for a new runner's week starting `weekKey` (Run20
 * (5)): every run in a week that starts before `until` is that week's
 * session on the run-walk ladder (`RUN_WALK_TEMPLATE_IDS`). It counts back
 * from `until`, so the ladder's last session falls in the first weeks' last
 * week, and a part week at the very start repeats the first session. Null
 * from `until` on, and for anyone who isn't new to running.
 */
export function runWalkTemplateIdForWeek(
  weekKey: string,
  until: string | null | undefined
): string | null {
  if (!until || weekKey >= until) return null;
  const weeksLeft = Math.ceil(
    differenceInCalendarDays(parseLocalDate(until), parseLocalDate(weekKey)) / 7
  );
  const stage = Math.max(1, RUN_WALK_TEMPLATE_IDS.length + 1 - weeksLeft);
  return RUN_WALK_TEMPLATE_IDS[stage - 1];
}
