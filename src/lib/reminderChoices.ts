/**
 * One switch and one time per reminder; the app picks how it goes (App1
 * Q26, owner, 13 November 2026).
 *
 * The reminders, and what can send each one:
 *
 * | Reminder        | Stored at (`users/{uid}/settings/…`)      | Phone | Server push           |
 * | --------------- | ----------------------------------------- | ----- | --------------------- |
 * | Training days   | `workoutReminders` `{ enabled, time }`    | yes   | no                    |
 * | Meals (3 times) | `mealReminders`                           | yes   | no                    |
 * | Evening streak  | `reminders` `streakEnabled`, `streakTime` | yes   | yes (`hourlyStreakNudge`) |
 * | Weekly review   | `reminders` `reviewEnabled`, Monday 09:00 | yes   | yes (the Monday recap) |
 *
 * Until this, the streak and the review each had two switches, one per
 * channel: the phone's ("Streak" with its time, "Weekly review") and the
 * server's ("Streak nudges" and "Weekly recap" under a "Push notifications"
 * master switch, in `settings/push`). Turning the phone's off left the push
 * on, the streak's time did nothing once push was on (the server sent at
 * 19:00 whatever it said), and the review went at 08:00 by push and 09:00 on
 * the phone. Now each has one switch and one time, read by both sides from
 * here and from `functions/lib/reminderChoices.js` (pinned by
 * `reminderChoices.cross.test.ts`), and the channel is the app's call:
 *
 * - Training days and meals always go from the phone: they repeat at fixed
 *   times, the phone keeps them with the app closed, and nothing on the
 *   server sends them. On the web they go while a tab is open; a server
 *   sender for them is not built (the website does not offer the app, Q52).
 * - The evening streak and the Monday review go by push when the account
 *   takes push (`settings/push.enabled`, the record every sender gates on):
 *   the server knows at that moment whether you logged, on any device, and
 *   reaches you on a day you never opened the app. Otherwise the phone
 *   schedules them. Never both: the phone stands aside whenever push carries
 *   them, and the server sends nothing when it does not.
 *
 * The stored shape (Q21: each fact stored once; an old name read as a
 * fallback, never written). The new fields are flat on `settings/reminders`
 * so a merge write of one never touches the other. Until a field is
 * written, its old fields answer, meaning what they meant: the reminder is
 * on if either old switch would have sent it, except that a phone switch the
 * person turned off stays off unless they also chose the push by hand.
 */

/** A reminder the person can turn on. */
export type ReminderKind = "training" | "meals" | "streak" | "review";

/** How a reminder reaches the person: not at all, as a notification the
 *  phone schedules, or as a push the server sends. Never both. */
export type ReminderDelivery = "off" | "local" | "push";

/** `users/{uid}/settings/{this}`: the streak's and the review's choices. */
export const REMINDERS_SETTINGS_DOC = "reminders";

export interface StreakReminderChoice {
  enabled: boolean;
  /** "HH:00": a whole hour, 08:00 to 21:00 (`STREAK_REMINDER_HOURS`). */
  time: string;
}

export interface ReviewReminderChoice {
  enabled: boolean;
}

/** The hours the streak reminder can go at. Whole hours, because the
 *  server sends on the hour, and never in quiet hours (22:00 to 08:00,
 *  `functions/lib/pushSchedule.js`), so the time is the same by either
 *  channel. */
export const STREAK_REMINDER_HOURS: readonly number[] = Array.from(
  { length: 14 },
  (_, index) => 8 + index
);

export const DEFAULT_STREAK_REMINDER_TIME = "20:00";

/** Monday's review goes at 09:00, by either channel. */
export const REVIEW_REMINDER_HOUR = 9;

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

/**
 * How a reminder that is on goes (see the header). `push` is the stored
 * `settings/push` document, read as every server sender reads it: on when
 * `enabled` is truthy.
 */
export function reminderDelivery(
  kind: ReminderKind,
  enabled: boolean,
  push: unknown
): ReminderDelivery {
  if (!enabled) return "off";
  if (kind === "training" || kind === "meals") return "local";
  return fields(push)?.enabled ? "push" : "local";
}

/**
 * Any stored time as the streak reminder's "HH:00": its hour, held to
 * 08:00 to 21:00. Null when it is not a time. A minute is dropped (the old
 * time field took any), and an hour outside the day moves to its nearest
 * edge, where the phone used to move an early one and drop a late one.
 */
export function streakReminderTime(time: unknown): string | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23 || Number(match[2]) > 59) return null;
  const first = STREAK_REMINDER_HOURS[0];
  const last = STREAK_REMINDER_HOURS[STREAK_REMINDER_HOURS.length - 1];
  const held = Math.min(Math.max(hour, first), last);
  return `${String(held).padStart(2, "0")}:00`;
}

/** Whether a stored field was written at all, whatever its value. */
function written(stored: Fields | null, key: string): boolean {
  return !!stored && key in stored && stored[key] !== undefined;
}

/**
 * The evening streak reminder: `settings/reminders` first, then the old
 * fields. Old: the phone's switch (`streakReminder.enabled`, with the
 * priming flag it needed) and the server's (`push.enabled` and its
 * `streak`, on unless false). Either one on sent it, except that a phone
 * switch turned off keeps it off unless the push was chosen by hand
 * (`streak: true`). The old time is the phone's.
 */
export function streakReminderChoice(stored: {
  reminders?: unknown;
  streakReminder?: unknown;
  push?: unknown;
}): StreakReminderChoice {
  const chosen = fields(stored.reminders);
  const old = fields(stored.streakReminder);
  const push = fields(stored.push);
  let enabled: boolean;
  if (typeof chosen?.streakEnabled === "boolean") {
    enabled = chosen.streakEnabled;
  } else {
    const phoneOn = !!old?.enabled && !!old?.primingShown;
    const phoneOff = written(old, "enabled") && !old?.enabled;
    const pushOn = !!push?.enabled && push?.streak !== false;
    const pushChosen = !!push?.enabled && push?.streak === true;
    enabled = phoneOn || (phoneOff ? pushChosen : pushOn);
  }
  const time =
    streakReminderTime(chosen?.streakTime) ??
    streakReminderTime(old?.time) ??
    DEFAULT_STREAK_REMINDER_TIME;
  return { enabled, time };
}

/**
 * The Monday review reminder: `settings/reminders` first, then the old
 * fields. Old: the phone's switch (`reviewReminder.enabled`, on unless
 * turned off, Mob2 call 10) and the server's recap (`push.enabled` and its
 * `recap`). Turned off on the phone, it stays off unless the recap push was
 * chosen by hand (`recap: true`).
 */
export function reviewReminderChoice(stored: {
  reminders?: unknown;
  reviewReminder?: unknown;
  push?: unknown;
}): ReviewReminderChoice {
  const chosen = fields(stored.reminders);
  if (typeof chosen?.reviewEnabled === "boolean")
    return { enabled: chosen.reviewEnabled };
  const old = fields(stored.reviewReminder);
  if (!written(old, "enabled") || old?.enabled) return { enabled: true };
  const push = fields(stored.push);
  return { enabled: !!push?.enabled && push?.recap === true };
}
