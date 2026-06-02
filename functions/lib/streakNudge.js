/**
 * [push] shouldSendStreakNudge — pure eligibility predicate for the
 * streak-at-risk push (#964, epic #961).
 *
 * Server-only: the hourly cron (#966) is the sole caller, so this lives in
 * functions/lib as plain JS — no TS↔JS port to keep in lockstep. Pure: no
 * Firestore, no admin SDK, no clock (nowUtc is injected).
 *
 * Locked design (#961 grill). Send iff ALL hold:
 *   - currentStreak >= 2
 *   - reminders opted in
 *   - timezone known (null → SKIP — locked invariant: no overnight pings)
 *   - NOT logged today
 *   - NOT already nudged today (≤1 streak nudge/day)
 *
 * CRITICAL: "logged today" is derived from the streaks/data ACTIVE-DATE SET
 * (`activeDateKeys`) evaluated against the user's LOCAL day — NOT from
 * `lastActiveAt`, which is bumped by workout/run triggers only. A meal-only
 * logger IS active today but would be missed by lastActiveAt and get a wrong
 * nudge; passing the active-date set avoids that false positive.
 *
 * Hour-bucketing (send at ~19:00 local) is the CRON's job, not this predicate —
 * this answers pure eligibility for the user's current local day.
 */

const STREAK_NUDGE_MIN_STREAK = 2;

/**
 * The user's local "YYYY-MM-DD" for a UTC instant in an IANA timezone.
 * Returns null when the timezone is absent or invalid (→ predicate skips).
 */
function localDateKeyInTz(nowUtc, timezone) {
  if (!timezone) return null;
  try {
    // en-CA formats as ISO-style YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(nowUtc);
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   currentStreak?: number,
 *   remindersOptedIn?: boolean,
 *   timezone?: string | null,
 *   activeDateKeys?: string[],   // local YYYY-MM-DD days the user was active (streaks/data)
 *   lastNudgeDateKey?: string | null, // local YYYY-MM-DD of last streak nudge sent
 * }} input
 * @param {Date} nowUtc
 * @returns {boolean}
 */
function shouldSendStreakNudge(input, nowUtc) {
  const {
    currentStreak = 0,
    remindersOptedIn = false,
    timezone = null,
    activeDateKeys = [],
    lastNudgeDateKey = null,
  } = input || {};

  if (!remindersOptedIn) return false;
  if (currentStreak < STREAK_NUDGE_MIN_STREAK) return false;

  const localToday = localDateKeyInTz(nowUtc, timezone);
  if (!localToday) return false; // skip-on-null-tz invariant

  if (activeDateKeys.includes(localToday)) return false; // already logged today
  if (lastNudgeDateKey === localToday) return false; // already nudged today

  return true;
}

module.exports = {
  shouldSendStreakNudge,
  localDateKeyInTz,
  STREAK_NUDGE_MIN_STREAK,
};
