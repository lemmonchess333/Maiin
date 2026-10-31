/**
 * The Monday review notification (Mob2 call 10, Rev1 STATUS): a local
 * notification at 09:00 on Monday, "Your week, reviewed", opening
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

/** Its own id in the 3000s, the event-driven notifications' range
 *  (useMealReminders' band note). */
export const REVIEW_NOTIFICATION_ID = 3010;

/** Where a tap on it opens. */
export const REVIEW_ROUTE = "/review";

export const REVIEW_NOTIFICATION = {
  title: "Your week, reviewed",
  body: "Last week in a few cards, and the week ahead.",
} as const;

const REVIEW_HOUR = 9;
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
 * Whether the server's Monday recap push (functions/index.js
 * `maybeSendWeeklyRecap`, 08:00 local) may reach this account, read from
 * `users/{uid}/settings/push` as its gate reads it
 * (`mayTargetUserConsent(consent, "recap")`, functions/lib/pushConsent.js):
 * push on, and the recap not turned off. An absent document is off: the
 * local notification never writes one (the first-week return offer hides
 * itself once one exists). Pinned to the server's gate by
 * `reviewReminder.cross.test.ts`.
 *
 * Which channel owns Monday is still the owner's call; until then, the
 * local notification stands aside wherever the push would say it.
 */
export function serverRecapPushOn(consent: unknown): boolean {
  if (!consent || typeof consent !== "object") return false;
  const stored = consent as { enabled?: unknown; recap?: unknown };
  // Truthy, as the server reads it: the two must agree on every shape.
  return Boolean(stored.enabled) && stored.recap !== false;
}

/**
 * Whether to schedule it.
 *
 * - `enabled`: the person's switch (on unless they turned it off).
 * - `pushOwns`: the server's Monday recap push is on for this account
 *   (push and its Weekly recap switch), and says the same thing an hour
 *   earlier; two would be one too many.
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
