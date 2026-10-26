import type { Timestamp } from "firebase/firestore";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth, formatMonth, formatWeekday } from "@/utils/formatters";
import { boundaryDayKey, challengeLocalEndMs } from "./useChallenges";
import { isFeaturedChallenge } from "./challengeOrder";

/**
 * A challenge is one edition of a series: this month's Mileage, this
 * week's Weekly Warrior, this season's goal. Each edition is joined on
 * its own, and the next one opens on the day this one ends (the server's
 * windows are [startDate, endDate), so the end day IS the next edition's
 * first day). These helpers say that at the moments it matters, rather
 * than in a paragraph above the list.
 */
type Edition = {
  type?: string;
  startDate?: Timestamp | Date;
  endDate?: Timestamp | Date;
};

/** The local date a boundary marker names, or null without one. */
function boundaryDay(value: Timestamp | Date | undefined): Date | null {
  const key = boundaryDayKey(value);
  return key ? parseLocalDate(key) : null;
}

/**
 * The confirmation a join gets: which edition the person is in, and when
 * the next one opens, which they will have to join again.
 * "You're in for October. November's opens on 1 Nov."
 */
export function joinedMessage(challenge: Edition): string {
  const start = boundaryDay(challenge.startDate);
  const next = boundaryDay(challenge.endDate);
  if (!start || !next) return "You're in.";
  switch (challenge.type) {
    case "monthly":
      return `You're in for ${formatMonth(start)}. ${formatMonth(next)}'s opens on ${formatDayMonth(next)}.`;
    case "weekly":
      return `You're in for this week. Next week's opens on ${formatWeekday(next)}.`;
    case "seasonal":
      return `You're in for this season. The next one opens on ${formatDayMonth(next)}.`;
    default:
      return "You're in.";
  }
}

/** True while less than a day of the challenge is left for the person:
 *  the last day before their local midnight of its end day. */
export function inFinalDay(
  endDate: Timestamp | Date | undefined,
  now: number = Date.now()
): boolean {
  const endMs = challengeLocalEndMs(endDate);
  if (endMs === null) return false;
  const left = endMs - now;
  return left > 0 && left < 86_400_000;
}

/** What an edition in its final day says in place of Join: nobody can
 *  meet a week's goal in its last hours, so it points at the next one.
 *  "Ends tonight. The next one starts Monday." */
export function finalDayLine(endDate: Timestamp | Date | undefined): string {
  const next = boundaryDay(endDate);
  return next
    ? `Ends tonight. The next one starts ${formatWeekday(next)}.`
    : "Ends tonight.";
}

/**
 * Which cards say how long is left, given the cards in the order they
 * are shown. Every monthly challenge ends on the same day, so the month's
 * time left is said once, on the featured challenge (or, without one, the
 * first monthly card), and any other card says its own only when it ends
 * on a different day: a seasonal or a weekly one.
 */
export function cardsShowingTimeLeft(
  ordered: readonly ({ id: string } & Edition)[]
): Set<string> {
  const anchor =
    ordered.find(isFeaturedChallenge) ??
    ordered.find((c) => c.type === "monthly");
  const monthEnd = anchor ? boundaryDayKey(anchor.endDate) : null;
  const shown = new Set<string>();
  for (const c of ordered) {
    if (c === anchor || boundaryDayKey(c.endDate) !== monthEnd) shown.add(c.id);
  }
  return shown;
}
