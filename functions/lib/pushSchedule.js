/**
 * [push] Pure scheduling helpers for the FCM senders (epic #961).
 *
 * Server-only, plain JS (matches functions/ CommonJS). Pure: no Firestore, no
 * admin SDK, clock injected — table-testable in isolation, no FCM credentials
 * required (so this lands ahead of the HITL FCM provisioning #963).
 *
 * Complements streakNudge.js (which answers pure ELIGIBILITY) with the hourly
 * cron's job (#966): HOUR-BUCKETING (fire at the type's local target hour) and
 * the QUIET-HOURS backstop (never 22:00–08:00 local — Q7 locked invariant).
 *
 * Timezone-null handling mirrors streakNudge: a missing/invalid tz yields null
 * and the caller skips the send (the "no overnight pings" invariant).
 */

// Quiet-hours window (local clock): no scheduled sends at or after START, or
// before END. 22:00–08:00. Badge pushes defer INTO this window to END.
const QUIET_HOURS_START = 22; // 10pm
const QUIET_HOURS_END = 8; // 8am

/**
 * The user's local hour (0–23) for a UTC instant in an IANA timezone.
 * Returns null when the timezone is absent or invalid (→ caller skips).
 *
 * @param {Date} nowUtc
 * @param {string | null | undefined} timezone
 * @returns {number | null}
 */
function localHourInTz(nowUtc, timezone) {
  if (!timezone) return null;
  try {
    // hourCycle h23 → "00".."23" (avoids the "24:00" midnight edge of h24).
    const hh = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(nowUtc);
    const h = parseInt(hh, 10) % 24;
    return Number.isFinite(h) ? h : null;
  } catch {
    return null;
  }
}

/**
 * True when the local hour falls in the quiet-hours window [22:00, 08:00).
 * A null hour (unknown tz) is NOT quiet — the caller skips on null-tz before
 * reaching here, so treat null as "not applicable / don't block".
 *
 * @param {number | null} localHour
 * @returns {boolean}
 */
function withinQuietHours(localHour) {
  if (localHour == null) return false;
  return localHour >= QUIET_HOURS_START || localHour < QUIET_HOURS_END;
}

/**
 * Should the hourly cron fire a scheduled send THIS hour for a user, given the
 * type's local target hour (e.g. 19 for the streak nudge, 8 for the recap)?
 * True iff the user's local hour equals the target AND it's outside quiet
 * hours. Eligibility (streak predicate, opt-in, etc.) is checked separately.
 *
 * @param {Date} nowUtc
 * @param {string | null | undefined} timezone
 * @param {number} targetHour
 * @returns {boolean}
 */
function isLocalSendHour(nowUtc, timezone, targetHour) {
  const h = localHourInTz(nowUtc, timezone);
  if (h == null) return false;
  if (withinQuietHours(h)) return false;
  return h === targetHour;
}

// Map of Intl short weekday names → 0=Sun..6=Sat (JS getDay() convention).
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * The user's local weekday (0=Sun..6=Sat) for a UTC instant in an IANA
 * timezone. Returns null when the timezone is absent or invalid (→ caller
 * skips). Used by the weekly recap (#967) to fire only on the user's LOCAL
 * Monday — distinct from `isLocalSendHour`, which only buckets the hour.
 *
 * @param {Date} nowUtc
 * @param {string | null | undefined} timezone
 * @returns {number | null}
 */
function localWeekdayInTz(nowUtc, timezone) {
  if (!timezone) return null;
  try {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(nowUtc);
    const idx = WEEKDAY_INDEX[wd];
    return idx == null ? null : idx;
  } catch {
    return null;
  }
}

module.exports = {
  QUIET_HOURS_START,
  QUIET_HOURS_END,
  localHourInTz,
  withinQuietHours,
  isLocalSendHour,
  localWeekdayInTz,
};
