"use strict";

/**
 * A reminder ignored three times running goes quiet, and Home says so once
 * (App1 Q62, owner, 13 November 2026). The server's half: the evening
 * streak and the Monday review when push carries them (App1 Q26), the two
 * reminders a server sends. The phone's half, for the reminders it
 * schedules itself, and the reasons for the signal, are in
 * `src/lib/reminderAttention.ts`; `reminderAttention.cross.test.ts` holds
 * the two to one limit and one set of field names.
 *
 * Answered, for a push: the app was opened after it on the same local day
 * (from the push or not: the app writes `{kind}AnsweredAt` when it opens
 * and finds a push of that kind sent earlier that day), the person tapped
 * it, or did what it asked: logged that day, for the streak; read the
 * review, for the review. Anything else is ignored. A push is settled when
 * the next one of its kind is about to go, so the third ignored one is
 * known when the fourth would be sent, and that fourth is not sent: the
 * reminder is turned off (`{kind}Enabled: false`, the one switch), its
 * count starts again from 0, and `{kind}QuietAt` tells Home to say so once.
 * Turning it back on in Settings → Notifications is the one switch again.
 *
 * Every field is flat on `users/{uid}/settings/reminders`, beside the
 * switches, so a merge write of one never touches another.
 */

/** Ignored this many times running, a reminder goes quiet. */
const IGNORED_LIMIT = 3;

/** The reminders push can carry (lib/reminderChoices.js). */
const PUSH_REMINDER_KINDS = Object.freeze(["streak", "review"]);

/** The fields Q62 keeps for one reminder kind on `settings/reminders`. */
function reminderAttentionFields(kind) {
  return {
    sentAt: `${kind}SentAt`,
    answeredAt: `${kind}AnsweredAt`,
    ignored: `${kind}Ignored`,
    quietAt: `${kind}QuietAt`,
    quietShown: `${kind}QuietShown`,
  };
}

/** A stored time as milliseconds: a Timestamp, a Date or a number. */
function millisOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value.seconds === "number") {
    const ms = value.seconds * 1000 + (Number(value.nanoseconds) || 0) / 1e6;
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function storedCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Settles the last push of `kind` before the next one goes.
 *
 * @param {"streak" | "review"} kind
 * @param {Record<string, unknown> | null | undefined} reminders the stored
 *   `settings/reminders` document
 * @param {{ actedDayKeys?: string[], sentDayKey?: (ms: number) => string | null }} [facts]
 *   the local days the person did what it asks, and how to name the day a
 *   push went in their time zone
 * @returns {{ settled: boolean, ignored: number, quiet: boolean }}
 */
function settleReminderPush(kind, reminders, facts = {}) {
  const fields = reminderAttentionFields(kind);
  const stored = reminders && typeof reminders === "object" ? reminders : {};
  const before = storedCount(stored[fields.ignored]);
  const sentAt = millisOf(stored[fields.sentAt]);
  if (sentAt === null)
    return { settled: false, ignored: before, quiet: before >= IGNORED_LIMIT };
  const answeredAt = millisOf(stored[fields.answeredAt]);
  const sentDay =
    typeof facts.sentDayKey === "function" ? facts.sentDayKey(sentAt) : null;
  const acted =
    !!sentDay &&
    Array.isArray(facts.actedDayKeys) &&
    facts.actedDayKeys.includes(sentDay);
  const answered = (answeredAt !== null && answeredAt >= sentAt) || acted;
  const ignored = answered ? 0 : before + 1;
  return { settled: true, ignored, quiet: ignored >= IGNORED_LIMIT };
}

/** What goes quiet writes: the switch off, the count from 0, and the
 *  mark Home says it once from. `at` is the time to store. */
function quietPatch(kind, at) {
  const fields = reminderAttentionFields(kind);
  return {
    [`${kind}Enabled`]: false,
    [fields.ignored]: 0,
    [fields.sentAt]: null,
    [fields.quietAt]: at,
    [fields.quietShown]: false,
  };
}

/** After a settle: the count, and the push it was for is done with.
 *  With `sentAt`, the push that has just gone is the one waiting. */
function settledPatch(kind, ignored, sentAt = null) {
  const fields = reminderAttentionFields(kind);
  return { [fields.ignored]: ignored, [fields.sentAt]: sentAt };
}

module.exports = {
  IGNORED_LIMIT,
  PUSH_REMINDER_KINDS,
  reminderAttentionFields,
  millisOf,
  settleReminderPush,
  quietPatch,
  settledPatch,
};
