"use strict";

/**
 * The evening streak and Monday review reminders as the server sends them
 * (App1 Q26, owner, 13 November 2026: one switch and one time per reminder;
 * the app picks local or push).
 *
 * The server's copy of `src/lib/reminderChoices.ts`, which has the whole
 * story: one switch and one time per reminder, stored flat on
 * `users/{uid}/settings/reminders` (`streakEnabled`, `streakTime`,
 * `reviewEnabled`), with the old fields read until those are written. The
 * app schedules a reminder on the phone only when push does not carry it,
 * and the senders here send it only when push does, so it goes once. Both
 * copies run, the app's to schedule and draw the switch, this one to send;
 * `src/lib/__tests__/reminderChoices.cross.test.ts` holds them to one
 * answer for every stored shape.
 *
 * Before this, the streak push read `push.streak` and went at 19:00
 * whatever time the person had chosen, and the recap read `push.recap` and
 * went at 08:00 against the phone's 09:00.
 */

/** @typedef {"training" | "meals" | "streak" | "review"} ReminderKind */
/** @typedef {"off" | "local" | "push"} ReminderDelivery */

const REMINDERS_SETTINGS_DOC = "reminders";

/** Whole hours, 08:00 to 21:00: the server sends on the hour, never in
 *  quiet hours (lib/pushSchedule.js). */
const STREAK_REMINDER_HOURS = Object.freeze(
  Array.from({ length: 14 }, (_, index) => 8 + index)
);

const DEFAULT_STREAK_REMINDER_TIME = "20:00";

/** Monday's review goes at 09:00 local, by either channel. */
const REVIEW_REMINDER_HOUR = 9;

function fields(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

/**
 * @param {ReminderKind} kind
 * @param {boolean} enabled
 * @param {unknown} push the stored `settings/push` document
 * @returns {ReminderDelivery}
 */
function reminderDelivery(kind, enabled, push) {
  if (!enabled) return "off";
  if (kind === "training" || kind === "meals") return "local";
  const consent = fields(push);
  return consent && consent.enabled ? "push" : "local";
}

/** Any stored time as "HH:00", held to 08:00–21:00; null if not a time. */
function streakReminderTime(time) {
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

function written(stored, key) {
  return !!stored && key in stored && stored[key] !== undefined;
}

/**
 * @param {{ reminders?: unknown, streakReminder?: unknown, push?: unknown }} stored
 * @returns {{ enabled: boolean, time: string }}
 */
function streakReminderChoice(stored) {
  const chosen = fields(stored.reminders);
  const old = fields(stored.streakReminder);
  const push = fields(stored.push);
  let enabled;
  if (chosen && typeof chosen.streakEnabled === "boolean") {
    enabled = chosen.streakEnabled;
  } else {
    const phoneOn = !!(old && old.enabled) && !!(old && old.primingShown);
    const phoneOff = written(old, "enabled") && !old.enabled;
    const pushOn = !!(push && push.enabled) && push.streak !== false;
    const pushChosen = !!(push && push.enabled) && push.streak === true;
    enabled = phoneOn || (phoneOff ? pushChosen : pushOn);
  }
  const time =
    streakReminderTime(chosen && chosen.streakTime) ||
    streakReminderTime(old && old.time) ||
    DEFAULT_STREAK_REMINDER_TIME;
  return { enabled, time };
}

/**
 * @param {{ reminders?: unknown, reviewReminder?: unknown, push?: unknown }} stored
 * @returns {{ enabled: boolean }}
 */
function reviewReminderChoice(stored) {
  const chosen = fields(stored.reminders);
  if (chosen && typeof chosen.reviewEnabled === "boolean")
    return { enabled: chosen.reviewEnabled };
  const old = fields(stored.reviewReminder);
  if (!written(old, "enabled") || old.enabled) return { enabled: true };
  const push = fields(stored.push);
  return { enabled: !!(push && push.enabled) && push.recap === true };
}

async function readSettings(db, uid, name) {
  return (await db.doc(`users/${uid}/settings/${name}`).get()).data() || null;
}

/**
 * The hour (local, 8 to 21) the server sends this account's evening streak
 * reminder at, or null when the server sends none: the reminder is off, or
 * push does not carry it (the phone schedules it instead). `push` is the
 * `settings/push` document, already read. The old document is read only
 * while a new field is unwritten.
 */
async function streakReminderPushHour(db, uid, push) {
  if (!fields(push) || !push.enabled) return null;
  const reminders = await readSettings(db, uid, REMINDERS_SETTINGS_DOC);
  // Turned off: nothing more to read, on any hour of any day.
  if (reminders && reminders.streakEnabled === false) return null;
  const settled =
    !!reminders &&
    typeof reminders.streakEnabled === "boolean" &&
    !!streakReminderTime(reminders.streakTime);
  const choice = streakReminderChoice({
    reminders,
    streakReminder: settled
      ? null
      : await readSettings(db, uid, "streakReminder"),
    push,
  });
  if (reminderDelivery("streak", choice.enabled, push) !== "push") return null;
  return Number(choice.time.slice(0, 2));
}

/** Whether the server sends this account's Monday review reminder: it is
 *  on, and push carries it. */
async function reviewReminderByPush(db, uid, push) {
  if (!fields(push) || !push.enabled) return false;
  const reminders = await readSettings(db, uid, REMINDERS_SETTINGS_DOC);
  const settled = !!reminders && typeof reminders.reviewEnabled === "boolean";
  const choice = reviewReminderChoice({
    reminders,
    reviewReminder: settled
      ? null
      : await readSettings(db, uid, "reviewReminder"),
    push,
  });
  return reminderDelivery("review", choice.enabled, push) === "push";
}

module.exports = {
  REMINDERS_SETTINGS_DOC,
  STREAK_REMINDER_HOURS,
  DEFAULT_STREAK_REMINDER_TIME,
  REVIEW_REMINDER_HOUR,
  reminderDelivery,
  streakReminderTime,
  streakReminderChoice,
  reviewReminderChoice,
  streakReminderPushHour,
  reviewReminderByPush,
};
