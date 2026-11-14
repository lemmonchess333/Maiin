/**
 * The phone's record of the reminders it schedules, for App1 Q62's count
 * (`reminderAttention.ts` has the rule). The operating system says nothing
 * about a local notification once it is handed over: not that it fired,
 * not that it was dismissed. What the phone does know is when it asked for
 * each to fire, and when the app is running again. So `notifications.ts`
 * records each reminder it schedules here (native only: on the web a
 * reminder fires only while a tab is open, which is already the app open),
 * every time that has passed is a fire, and the count is taken whenever the
 * app comes to the front.
 *
 * Kept on the device, not the account: these are this phone's alarms, and
 * they are cleared with them at sign-out (`cancelAllNotifications`).
 */
import { readString, remove, writeString } from "./localStore";
import type { ReminderKind } from "./reminderChoices";
import {
  countReminderFires,
  type AttentionCount,
  type ReminderFire,
} from "./reminderAttention";

const LEDGER_KEY = "tropos.reminderFires.v1";
/** Bounds on what one record can hold, whatever happens to the clock. */
const MAX_OCCURRENCES = 62;
const MAX_FIRES = 200;

const KINDS: readonly ReminderKind[] = [
  "training",
  "meals",
  "streak",
  "review",
];

export function isReminderKind(value: unknown): value is ReminderKind {
  return typeof value === "string" && KINDS.includes(value as ReminderKind);
}

/** A reminder handed to the system: when it first fires, how it repeats,
 *  and how far its fires have been counted. */
interface ScheduledReminder {
  kind: ReminderKind;
  at: number;
  every: "day" | "week" | null;
  upTo: number;
}

interface Ledger extends AttentionCount {
  scheduled: Record<string, ScheduledReminder>;
  fired: ReminderFire[];
}

function emptyLedger(): Ledger {
  return { scheduled: {}, fired: [], ignored: {}, counted: {}, tapped: {} };
}

function readLedger(): Ledger {
  const raw = readString(LEDGER_KEY);
  if (!raw) return emptyLedger();
  try {
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    if (!parsed || typeof parsed !== "object") return emptyLedger();
    return {
      scheduled:
        parsed.scheduled && typeof parsed.scheduled === "object"
          ? parsed.scheduled
          : {},
      fired: Array.isArray(parsed.fired) ? parsed.fired : [],
      ignored:
        parsed.ignored && typeof parsed.ignored === "object"
          ? parsed.ignored
          : {},
      counted:
        parsed.counted && typeof parsed.counted === "object"
          ? parsed.counted
          : {},
      tapped:
        parsed.tapped && typeof parsed.tapped === "object" ? parsed.tapped : {},
    };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger: Ledger): void {
  writeString(LEDGER_KEY, JSON.stringify(ledger));
}

/** The times a scheduled reminder fired in (from, to]: its first time,
 *  then every day or week on the wall clock. */
export function occurrencesBetween(
  entry: Pick<ScheduledReminder, "at" | "every">,
  from: number,
  to: number
): number[] {
  const times: number[] = [];
  const next = new Date(entry.at);
  for (let i = 0; i < MAX_OCCURRENCES * 8 && next.getTime() <= to; i++) {
    if (next.getTime() > from) times.push(next.getTime());
    if (!entry.every) break;
    next.setDate(next.getDate() + (entry.every === "week" ? 7 : 1));
  }
  return times.slice(-MAX_OCCURRENCES);
}

function harvest(ledger: Ledger, id: string, now: number): void {
  const entry = ledger.scheduled[id];
  if (!entry) return;
  for (const at of occurrencesBetween(entry, entry.upTo, now))
    ledger.fired.push({ kind: entry.kind, at, seen: now });
  entry.upTo = Math.max(entry.upTo, now);
  if (ledger.fired.length > MAX_FIRES)
    ledger.fired = ledger.fired.slice(-MAX_FIRES);
}

/** A reminder this phone has handed to the system. */
export function recordScheduledReminder(
  id: number,
  kind: ReminderKind,
  at: Date,
  every: "day" | "week" | null,
  now: number = Date.now()
): void {
  if (!Number.isFinite(at.getTime())) return;
  const ledger = readLedger();
  // Whatever an earlier one under this id fired is counted first.
  harvest(ledger, String(id), now);
  ledger.scheduled[String(id)] = { kind, at: at.getTime(), every, upTo: now };
  writeLedger(ledger);
}

/** A reminder taken back: what it fired before now still counts. */
export function recordCancelledReminder(
  id: number,
  now: number = Date.now()
): void {
  const ledger = readLedger();
  if (!ledger.scheduled[String(id)]) return;
  harvest(ledger, String(id), now);
  delete ledger.scheduled[String(id)];
  writeLedger(ledger);
}

/** The person opened the app from a reminder of this kind. */
export function recordReminderTap(
  kind: ReminderKind,
  now: number = Date.now()
): void {
  const ledger = readLedger();
  ledger.tapped[kind] = now;
  writeLedger(ledger);
}

/** Sign-out: this phone's alarms are gone, and so is their record. */
export function clearReminderFires(): void {
  remove(LEDGER_KEY);
}

/**
 * Counts every fire since the last count, now that the app is running.
 * `permitted` is whether the system lets the app show notifications: if
 * not, nothing it scheduled was shown, so nothing is counted. Returns the
 * kinds that reached three ignored running.
 */
export function takeReminderCount(
  permitted: boolean,
  now: number = Date.now()
): ReminderKind[] {
  const ledger = readLedger();
  for (const id of Object.keys(ledger.scheduled)) harvest(ledger, id, now);
  if (ledger.fired.length === 0) {
    writeLedger(ledger);
    return [];
  }
  const fired = ledger.fired;
  ledger.fired = [];
  if (!permitted) {
    writeLedger(ledger);
    return [];
  }
  const { count, quiet } = countReminderFires(ledger, fired);
  writeLedger({ ...ledger, ...count });
  return quiet;
}
