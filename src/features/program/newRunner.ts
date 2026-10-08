import type { UserProfile } from "@/lib/auth";
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
