import { differenceInCalendarDays } from "date-fns";
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
 * The profile's fields a new runner's first weeks are read from: setup's
 * answer, and the days setup finished and the account began. Written out
 * rather than picked from `UserProfile`, so the plan's generator can read
 * this module without importing auth, which reaches the generator through
 * the Run screen's modules.
 */
export interface NewRunnerProfile {
  runFrequency?: string;
  createdAt?: unknown;
  onboardingCompletedAt?: unknown;
}

/**
 * The day a new runner's first weeks end, counted from the day they began:
 * setup's "New to running" (`runFrequency: "new"`). Null for anyone else, or
 * while the day they began isn't known.
 */
export function newRunnerUntil(
  runFrequency: string | undefined,
  startKey: string | null | undefined
): string | null {
  if (runFrequency !== "new" || !startKey) return null;
  return localDateString(
    addLocalDays(parseLocalDate(startKey), NEW_RUNNER_WEEKS * 7)
  );
}

/**
 * `newRunnerUntil` for a stored profile. Setup counts from the day it
 * finishes, so a plan made later counts from that day too: the server stamps
 * it as `onboardingCompletedAt`. Someone can sign up and finish setup weeks
 * later, and they began running then. Until the stamp comes back from the
 * server, and on a profile set up before it was kept, the day the account
 * began (`createdAt`), which is setup's day for nearly everyone.
 */
export function profileNewRunnerUntil(
  profile: NewRunnerProfile | null | undefined
): string | null {
  return newRunnerUntil(
    profile?.runFrequency,
    startDayKey(profile?.onboardingCompletedAt) ??
      startDayKey(profile?.createdAt)
  );
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
