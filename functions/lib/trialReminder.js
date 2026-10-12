/**
 * The reminder before a free trial turns into a paid subscription (Sub1,
 * STATUS 2026-10-06): when it goes and what the server records, without I/O.
 *
 * Apple documents no reminder of its own before a trial converts, and the
 * UK's subscription rules (from January 2027) want one in writing before
 * the first payment. So when RevenueCat reports a trial, planEntitlementWrite
 * records it on the profile as `subscriptionTrial`, and `trialReminderSweep`
 * (functions/trialReminders.js) emails the person at its `reminderAt`. The
 * app reads the same record for its phone notification and Home's strip.
 * The instant is worked out once, here, and stored, so the email, the
 * notification and the strip cannot disagree about the day.
 *
 * When: 10:00 in the person's timezone, two days before the last moment to
 * cancel. Apple renews in the 24 hours before a trial ends, so cancelling
 * has to happen at least a day before it ends. A reminder two days before
 * the END (the "day 5" first locked) could leave as little as 14 hours to
 * act; two days before the deadline is day 4 of a 7-day trial, and leaves
 * 38 to 62 hours.
 *
 * Pinned by functions/__tests__/trialReminder.test.js.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Apple: "cancel at least 24 hours before the trial ends". Google Play
 *  renews at the end itself, so a day's notice is safe on both stores. */
const CANCEL_LEAD_MS = DAY_MS;
/** Days between the reminder and the last day to cancel. */
const REMINDER_DAYS_BEFORE_CANCEL = 2;
/** Local hour the reminder goes out. */
const REMINDER_HOUR = 10;
/** For a profile without a timezone: the storefront the prices are written
 *  for. The app records the device's zone on boot (#962), so this is rare. */
const DEFAULT_TIMEZONE = "Europe/London";

/** Stores that bill at the end of a trial. A promotional grant or a web
 *  purchase through another store is not a trial anyone is charged for
 *  here, so it gets no reminder. */
const BILLED_STORES = new Set(["app_store", "mac_app_store", "play_store"]);

/** How often each product renews, for the email's "every month". Pinned to
 *  the app's product ids by src/lib/__tests__/subscriptionTrial.cross.test.ts. */
const PRODUCT_PERIODS = Object.freeze({
  "com.tropos.app.pro.monthly": "month",
  "com.tropos.app.pro.yearly": "year",
});

/** One formatter per zone: building one costs far more than using it. */
const WALL_FORMATS = new Map();

function wallFormat(timeZone) {
  let format = WALL_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    WALL_FORMATS.set(timeZone, format);
  }
  return format;
}

/** A timezone Intl accepts, else the default. */
function resolveTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return DEFAULT_TIMEZONE;
  try {
    wallFormat(timeZone);
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The wall clock in `timeZone` at instant `ms`, to the second. */
function wallClock(ms, timeZone) {
  const parts = Object.fromEntries(
    wallFormat(timeZone)
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** YYYY-MM-DD of instant `ms` in `timeZone`. */
function localDateKey(ms, timeZone) {
  const { year, month, day } = wallClock(ms, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A date key moved by whole calendar days. Calendar arithmetic, no zone. */
function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/** How far `timeZone` is ahead of UTC at instant `ms`. */
function offsetMs(ms, timeZone) {
  const wall = wallClock(ms, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant it is `hour`:00 on `dateKey` in `timeZone`. The offset is read
 * twice because the first guess can sit on the other side of a clock change
 * from the answer. No zone changes its clocks at 10:00, so the hour asked
 * for always exists.
 */
function instantAt(dateKey, hour, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

/** The last moment to cancel without being charged. */
function cancelByMs(endsAtMs) {
  return endsAtMs - CANCEL_LEAD_MS;
}

/**
 * When the reminder goes: 10:00 local, two days before the last day to
 * cancel. Never before 10:00 on the day after the trial began, so a short
 * trial (3 days is the shortest either store sells) is not reminded about
 * in the minute it starts.
 */
function reminderAtMs({ endsAtMs, startedAtMs, timeZone }) {
  const zone = resolveTimeZone(timeZone);
  const lastDay = localDateKey(cancelByMs(endsAtMs), zone);
  const target = instantAt(
    addDays(lastDay, -REMINDER_DAYS_BEFORE_CANCEL),
    REMINDER_HOUR,
    zone
  );
  if (!Number.isFinite(startedAtMs)) return target;
  const earliest = instantAt(
    addDays(localDateKey(startedAtMs, zone), 1),
    REMINDER_HOUR,
    zone
  );
  return Math.max(target, earliest);
}

/** "month", "year", or null for a product this file does not know. */
function periodFor(productId) {
  return Object.prototype.hasOwnProperty.call(PRODUCT_PERIODS, productId)
    ? PRODUCT_PERIODS[productId]
    : null;
}

/**
 * The local date of the payment after the first one: one period after the
 * trial ends, on the same day of the month, or the month's last day when it
 * has no such day (31 January → 28 February), as the stores renew.
 */
function nextPaymentDateKey(endsAtMs, period, timeZone) {
  if (period !== "month" && period !== "year") return null;
  const [year, month, day] = localDateKey(endsAtMs, resolveTimeZone(timeZone))
    .split("-")
    .map(Number);
  const targetYear = period === "year" ? year + 1 : year + Math.floor(month / 12);
  const targetMonth = period === "year" ? month : (month % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/**
 * The price the app reported for the plan it just sold, or null. The app
 * has the store's own price for the person's storefront; RevenueCat's
 * record of a trial carries no renewal price. It only ever reaches the
 * person's own email, but it is still checked: a number, an ISO currency
 * code, and the store's display string, short and with nothing that could
 * break out of the email's markup.
 */
function readReportedPrice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { productId, amount, currencyCode, display } = raw;
  if (typeof productId !== "string" || !productId || productId.length > 200)
    return null;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10_000
  )
    return null;
  if (typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode))
    return null;
  if (typeof display !== "string") return null;
  const text = display.trim();
  if (!text || text.length > 32 || /[\u0000-\u001f\u007f<>&"]/.test(text))
    return null;
  return { productId, amount, currencyCode, display: text };
}

function isPrice(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.amount === "number" &&
    typeof value.currencyCode === "string" &&
    typeof value.display === "string"
  );
}

/**
 * The `subscriptionTrial` record for a trial RevenueCat reports, or null
 * when there is none.
 *
 * Every key is written every time. The record goes out through a merging
 * set, and Firestore merges maps key by key, so a key left out would keep
 * the previous trial's value: a new trial would inherit the old one's
 * `reminderEmailedAt` and never be reminded.
 *
 * The price and the sent marker carry over while it is the same trial (the
 * same product ending at the same instant); a new trial starts without them.
 */
function planTrialRecord({ stored, trial, timeZone, reportedPrice }) {
  if (!trial) return null;
  const endsAt = new Date(trial.endsAtMs).toISOString();
  const same =
    !!stored &&
    typeof stored === "object" &&
    stored.productId === trial.productId &&
    stored.endsAt === endsAt;
  const reported =
    reportedPrice && reportedPrice.productId === trial.productId
      ? {
          amount: reportedPrice.amount,
          currencyCode: reportedPrice.currencyCode,
          display: reportedPrice.display,
        }
      : null;
  return {
    productId: trial.productId,
    store: trial.store,
    // "month" or "year", for every surface that says how often it renews.
    period: periodFor(trial.productId),
    startedAt: Number.isFinite(trial.startedAtMs)
      ? new Date(trial.startedAtMs).toISOString()
      : null,
    endsAt,
    cancelBy: new Date(cancelByMs(trial.endsAtMs)).toISOString(),
    reminderAt: new Date(
      reminderAtMs({
        endsAtMs: trial.endsAtMs,
        startedAtMs: trial.startedAtMs,
        timeZone,
      })
    ).toISOString(),
    willRenew: trial.willRenew === true,
    price: reported ?? (same && isPrice(stored.price) ? stored.price : null),
    reminderEmailedAt:
      same && typeof stored.reminderEmailedAt === "string"
        ? stored.reminderEmailedAt
        : null,
  };
}

const RECORD_KEYS = [
  "productId",
  "store",
  "period",
  "startedAt",
  "endsAt",
  "cancelBy",
  "reminderAt",
  "willRenew",
  "reminderEmailedAt",
];

/** Whether two records (or nulls) say the same thing, so an unchanged
 *  trial is not rewritten on every sync. */
function sameRecord(a, b) {
  if (!a || !b) return (a ?? null) === (b ?? null);
  if (RECORD_KEYS.some((key) => (a[key] ?? null) !== (b[key] ?? null)))
    return false;
  const pa = isPrice(a.price) ? a.price : null;
  const pb = isPrice(b.price) ? b.price : null;
  if (!pa || !pb) return pa === pb;
  return (
    pa.amount === pb.amount &&
    pa.currencyCode === pb.currencyCode &&
    pa.display === pb.display
  );
}

/**
 * Where a record stands for the sweep at `nowMs`:
 *   "due"       — send now
 *   "early"     — not yet
 *   "late"      — past the last moment to cancel: a reminder would only
 *                 tell them it is too late
 *   "sent"      — already emailed for this trial
 *   "cancelled" — they turned renewal off, so nothing will be charged
 *   "none"      — no trial, or a record that cannot be read
 */
function reminderStatus(record, nowMs) {
  if (!record || typeof record !== "object") return "none";
  if (typeof record.reminderEmailedAt === "string") return "sent";
  if (record.willRenew !== true) return "cancelled";
  const at = Date.parse(record.reminderAt);
  const by = Date.parse(record.cancelBy);
  if (!Number.isFinite(at) || !Number.isFinite(by)) return "none";
  if (nowMs < at) return "early";
  if (nowMs >= by) return "late";
  return "due";
}

module.exports = {
  CANCEL_LEAD_MS,
  REMINDER_DAYS_BEFORE_CANCEL,
  REMINDER_HOUR,
  DEFAULT_TIMEZONE,
  BILLED_STORES,
  PRODUCT_PERIODS,
  resolveTimeZone,
  localDateKey,
  addDays,
  instantAt,
  cancelByMs,
  reminderAtMs,
  periodFor,
  nextPaymentDateKey,
  readReportedPrice,
  planTrialRecord,
  sameRecord,
  reminderStatus,
};
