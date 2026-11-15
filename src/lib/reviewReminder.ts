/**
 * The Monday review notification (Mob2 call 10, Rev1 STATUS): a
 * notification at 09:00 on Monday, from the phone unless push carries it
 * (App1 Q26, `reminderChoices.ts`), "Your week, reviewed", opening
 * `/review`, scheduled only when a review will be waiting then.
 *
 * Weeks start on Monday (`WEEK_STARTS_ON`), so at 09:00 on Monday the
 * review is of the week that ended the night before. Scheduled on a Monday
 * before 09:00, that is the review waiting now, and the notification is
 * for it only while it has not been read. Scheduled later in the week, it
 * is the week under way, whose review will exist when the person has
 * logged something in it or before it: a review never goes away once it
 * would render, so the question can be answered on the day it is
 * scheduled.
 *
 * Pure, so the rules are tested without a clock or a device;
 * `useReviewReminder` reads the state and schedules.
 */
import { reviewedWeekKey } from "@/lib/reviewEligibility";
import { REVIEW_REMINDER_HOUR } from "@/lib/reminderChoices";

/** Its own id in the 3000s, the event-driven notifications' range
 *  (useMealReminders' band note). */
export const REVIEW_NOTIFICATION_ID = 3010;

/** Where a tap on it opens. */
export const REVIEW_ROUTE = "/review";

export const REVIEW_NOTIFICATION = {
  title: "Your week, reviewed",
  body: "Last week in a few cards, and the week ahead.",
} as const;

/** The same hour as the server's recap push, which is this reminder when
 *  push carries it (`lib/reminderChoices.ts`). */
const REVIEW_HOUR = REVIEW_REMINDER_HOUR;
/** `Date.getDay()` of Monday. */
const MONDAY = 1;

/** The next 09:00 on a Monday after `now`, on the phone's clock. */
export function nextReviewReminderAt(now: Date): Date {
  const at = new Date(now);
  at.setHours(REVIEW_HOUR, 0, 0, 0);
  while (at.getDay() !== MONDAY || at.getTime() <= now.getTime()) {
    at.setDate(at.getDate() + 1);
    at.setHours(REVIEW_HOUR, 0, 0, 0);
  }
  return at;
}

/** The week a notification at `fireAt` is about: the one before the week
 *  `fireAt` falls in (`reviewedWeekKey`), which ended the night before. */
export function reviewWeekFor(fireAt: Date): string {
  return reviewedWeekKey(fireAt);
}

/**
 * Whether to schedule it.
 *
 * - `enabled`: the person's one switch (on unless they turned it off,
 *   `reviewReminderChoice`).
 * - `pushOwns`: push carries this reminder (`reminderDelivery`): the
 *   server's Monday recap sends it at the same hour, so the phone stands
 *   aside; two would be one too many. Null while not known.
 * - `waiting`: a review will render for that week (`useReviewEligibility`'s
 *   question, asked of the week the notification is about).
 * - `viewed`: the person has already read that week's review.
 */
export function shouldScheduleReviewReminder(state: {
  enabled: boolean;
  pushOwns: boolean | null;
  waiting: boolean;
  viewed: boolean;
}): boolean {
  if (!state.enabled) return false;
  if (state.pushOwns !== false) return false;
  return state.waiting && !state.viewed;
}
