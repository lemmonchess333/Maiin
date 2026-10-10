import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { startDayKey } from "@/lib/startDay";

/**
 * A new runner's first weeks (Run20 (5)): no tempo or intervals in them, so
 * they build the running itself. The evidence puts structured quality after
 * a novice's first four to six weeks, with strides allowed (running-evidence,
 * Daniels); six is a Tropos heuristic inside that range.
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
