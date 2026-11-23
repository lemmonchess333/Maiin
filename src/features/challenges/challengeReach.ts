import type { Timestamp } from "firebase/firestore";
import { boundaryDayKey } from "./useChallenges";

/**
 * Whether a challenge can still be finished in the days it has left.
 *
 * Only a count of DAYS can be shown to be out of reach: a day counts once
 * however much is done on it, so a challenge that needs more training days
 * than the calendar has left cannot be finished. Distance, volume, minutes,
 * sessions and points can all be done in one big day, so they are never
 * called out of reach here, however far off they look.
 *
 * "Finished" is the first tier, bronze: the goal the challenge names ("Train
 * on 8 days this month"). The days already trained count, joined or not,
 * because joining credits every day of the window so far (the join-time
 * backfill, `functions/lib/challengeParticipationProgress.js`).
 *
 * Out of reach takes proof, so every doubt reads as reachable: no count of
 * the days trained yet (still loading, or a read that failed), a challenge
 * that is not running today, or a metric this does not know.
 */

/** What a joined challenge out of reach says in place of its countdown
 *  (Together's row) and, with its first tier, in place of the next tier's
 *  aim (the challenge's sheet): the calendar's fact, with no step to take
 *  and no grade. */
export const OUT_OF_REACH_LINE = "Not enough days left";
export const OUT_OF_REACH_SHEET_LINE = "Not enough days left for Bronze";

/** A challenge's window and first goal, as far as reach needs them. */
export interface ReachChallenge {
  id: string;
  metric: string;
  tiers: { bronze: number };
  startDate: Timestamp | Date;
  endDate: Timestamp | Date;
  collectiveTarget?: number;
}

const DAY_MS = 86_400_000;

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** Whether this challenge counts days, the one kind that can run out. */
export function countsDays(challenge: Pick<ReachChallenge, "metric">) {
  return challenge.metric === "active_days";
}

/**
 * The days a challenge has left for the person, today included: an
 * activity logged on each of them still counts (`isChallengeActiveOnDay`).
 * Null when the challenge is not running on `todayKey`.
 */
export function daysLeftIncludingToday(
  challenge: Pick<ReachChallenge, "startDate" | "endDate">,
  todayKey: string
): number | null {
  const startKey = boundaryDayKey(challenge.startDate);
  const endKey = boundaryDayKey(challenge.endDate);
  if (!startKey || !endKey || startKey > todayKey || todayKey >= endKey)
    return null;
  return dayNumber(endKey) - dayNumber(todayKey);
}

/**
 * Whether the days already trained decide it: only when the first goal
 * needs more days than are left could the challenge be out of reach, so
 * only then does anything need to count them.
 */
export function reachTurnsOnDaysTrained(
  challenge: ReachChallenge,
  todayKey: string
): boolean {
  if (!countsDays(challenge) || (challenge.collectiveTarget ?? 0) > 0)
    return false;
  const left = daysLeftIncludingToday(challenge, todayKey);
  return left !== null && challenge.tiers.bronze > left;
}

/**
 * Whether the challenge's first goal can no longer be reached: the days
 * still needed are more than the days left, today included. `daysTrained`
 * is the person's count of days in the window so far, or null while it is
 * not known, which never proves anything.
 */
export function outOfReach(
  challenge: ReachChallenge,
  daysTrained: number | null,
  todayKey: string
): boolean {
  if (daysTrained === null || !reachTurnsOnDaysTrained(challenge, todayKey))
    return false;
  const left = daysLeftIncludingToday(challenge, todayKey) ?? 0;
  return challenge.tiers.bronze - Math.max(0, daysTrained) > left;
}
