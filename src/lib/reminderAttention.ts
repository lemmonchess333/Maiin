/**
 * A reminder ignored three times running goes quiet, and Home says so once
 * (App1 Q62, owner, 13 November 2026). The phone's half, and the rule for
 * both: `functions/lib/reminderAttention.js` is the server's half, for the
 * two reminders push can carry, and `reminderAttention.cross.test.ts` holds
 * the two to one limit and one set of field names.
 *
 * WHAT COUNTS AS IGNORED. Nothing told the app whether a notification was
 * opened, so this adds the smallest honest signal there is: the reminder is
 * answered when Tropos is opened after it on the same local day, from the
 * notification or not, or when the person does what it asked (logs that
 * day, for the evening streak reminder; reads the review, for Monday's). A
 * tap on it always counts. Anything else is ignored. A tap alone would call
 * a reminder ignored when someone read it on the lock screen and opened the
 * app from its icon, which is how a reminder usually works; a silenced
 * reminder that was working costs more than one more that was not.
 *
 * Counted per reminder kind, and per day: the three meal reminders of one
 * day are one occasion, answered if any of them is. Three occasions running
 * with no answer and the kind goes quiet: its switch is turned off (the one
 * switch Settings → Notifications shows, so turning it back on there is
 * the way back), its count starts again from 0, and `{kind}QuietAt` on
 * `users/{uid}/settings/reminders` tells Home to say so once
 * (`RemindersQuietCard`).
 *
 * WHO COUNTS. A reminder the server sends (the streak and the review when
 * push carries them) is counted on the server, which settles each push when
 * the next one is about to go: the app writes `{kind}AnsweredAt` when it
 * opens after one the same day, or is tapped from it. A reminder the phone
 * schedules (training days, meals, and the streak and the review when push
 * does not carry them) is counted on the phone (`reminderFires.ts`): the
 * phone knows when it scheduled each to fire and when the app ran, and only
 * the phone can stop it.
 */
import type { ReminderKind } from "./reminderChoices";

/** Ignored this many times running, a reminder goes quiet. */
export const IGNORED_LIMIT = 3;

/** The reminders push can carry (`reminderChoices.ts`); the server counts
 *  those pushes. */
export const PUSH_REMINDER_KINDS: readonly ReminderKind[] = [
  "streak",
  "review",
];

/** Every reminder kind, in the order Settings → Notifications lists them. */
export const REMINDER_KINDS: readonly ReminderKind[] = [
  "meals",
  "training",
  "review",
  "streak",
];

/** The fields Q62 keeps for one kind, flat on `settings/reminders` beside
 *  the switches, so a merge write of one never touches another. */
export function reminderAttentionFields(kind: ReminderKind) {
  return {
    sentAt: `${kind}SentAt`,
    answeredAt: `${kind}AnsweredAt`,
    ignored: `${kind}Ignored`,
    quietAt: `${kind}QuietAt`,
    quietShown: `${kind}QuietShown`,
  } as const;
}

type Stored = Record<string, unknown> | null | undefined;

/** A stored time as milliseconds: a Timestamp, a Date or a number. */
export function millisOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object") {
    const time = value as { toMillis?: unknown; seconds?: unknown };
    if (typeof time.toMillis === "function") {
      const ms = (time.toMillis as () => number)();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof time.seconds === "number") {
      const nanos = Number((value as { nanoseconds?: unknown }).nanoseconds);
      const ms =
        time.seconds * 1000 + (Number.isFinite(nanos) ? nanos : 0) / 1e6;
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/**
 * The push reminders the app answers by being open now: one went earlier
 * today and nothing has answered it yet. The caller writes
 * `{kind}AnsweredAt` for each.
 */
export function pushRemindersToAnswer(
  reminders: Stored,
  now: number
): ReminderKind[] {
  if (!reminders) return [];
  return PUSH_REMINDER_KINDS.filter((kind) => {
    const fields = reminderAttentionFields(kind);
    const sentAt = millisOf(reminders[fields.sentAt]);
    if (sentAt === null || sentAt > now || !sameLocalDay(sentAt, now))
      return false;
    const answeredAt = millisOf(reminders[fields.answeredAt]);
    return answeredAt === null || answeredAt < sentAt;
  });
}

/** The kinds that went quiet and Home has not said so yet. */
export function quietToShow(reminders: Stored): ReminderKind[] {
  if (!reminders) return [];
  return REMINDER_KINDS.filter((kind) => {
    const fields = reminderAttentionFields(kind);
    return (
      millisOf(reminders[fields.quietAt]) !== null &&
      reminders[fields.quietShown] !== true
    );
  });
}

// ── The phone's count ─────────────────────────────────────────────────────

/** One time a reminder fired on this phone, and when the app was next
 *  running to see that it had. */
export interface ReminderFire {
  kind: ReminderKind;
  at: number;
  seen: number;
}

export interface AttentionCount {
  /** Occasions ignored running, per kind. */
  ignored: Partial<Record<ReminderKind, number>>;
  /** The last day counted per kind (local "yyyy-MM-dd"), so a day's
   *  reminders are one occasion even when seen at different times. */
  counted: Partial<Record<ReminderKind, string>>;
  /** The last tap on a reminder of each kind. */
  tapped: Partial<Record<ReminderKind, number>>;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Counts the fires seen since the last count. A fire is answered when the
 * app was running later the same day (`seen` on its day) or the reminder
 * was tapped after it. Returns the new count and the kinds that reached
 * the limit, whose count starts again from 0.
 */
export function countReminderFires(
  count: AttentionCount,
  fires: readonly ReminderFire[]
): { count: AttentionCount; quiet: ReminderKind[] } {
  const ignored = { ...count.ignored };
  const counted = { ...count.counted };
  const quiet: ReminderKind[] = [];
  const byOccasion = new Map<
    string,
    { kind: ReminderKind; day: string; answered: boolean }
  >();
  for (const fire of [...fires].sort((a, b) => a.at - b.at)) {
    const day = dayKey(fire.at);
    const key = `${fire.kind}:${day}`;
    const tap = count.tapped[fire.kind];
    const answered =
      sameLocalDay(fire.at, fire.seen) || (tap !== undefined && tap >= fire.at);
    const occasion = byOccasion.get(key);
    if (occasion) occasion.answered ||= answered;
    else byOccasion.set(key, { kind: fire.kind, day, answered });
  }
  const occasions = [...byOccasion.values()].sort((a, b) =>
    a.day.localeCompare(b.day)
  );
  for (const { kind, day, answered } of occasions) {
    const last = counted[kind];
    if (last !== undefined && day <= last) continue;
    counted[kind] = day;
    const run = answered ? 0 : (ignored[kind] ?? 0) + 1;
    if (run >= IGNORED_LIMIT) {
      ignored[kind] = 0;
      if (!quiet.includes(kind)) quiet.push(kind);
    } else {
      ignored[kind] = run;
    }
  }
  return { count: { ignored, counted, tapped: count.tapped }, quiet };
}

// ── What Home says ────────────────────────────────────────────────────────

const KIND_NAMES: Record<ReminderKind, string> = {
  meals: "meal",
  training: "workout",
  review: "weekly review",
  streak: "streak",
};

/**
 * Home's one line when reminders went quiet: what stopped, why, and where
 * to turn them back on. Observational, no blame (Q61: no guilt).
 */
export function quietMessage(kinds: readonly ReminderKind[]): {
  title: string;
  body: string;
} | null {
  const names = REMINDER_KINDS.filter((kind) => kinds.includes(kind)).map(
    (kind) => KIND_NAMES[kind]
  );
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const title = `${list.charAt(0).toUpperCase()}${list.slice(1)} reminders are off`;
  return {
    title,
    body: `The last ${IGNORED_LIMIT} went unopened, so we stopped them. Turn them back on in Settings.`,
  };
}

/** The reminder a server push is, from its `data.type`: the evening
 *  reminder (and the first-week return in its place), or Monday's review
 *  (its fell-behind form too). Other pushes are not reminders. */
export function pushReminderKind(type: unknown): ReminderKind | null {
  if (type === "streak") return "streak";
  if (type === "recap" || type === "fellbehind") return "review";
  return null;
}
