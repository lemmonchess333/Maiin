/**
 * [push] shouldSendStreakNudge — pure eligibility predicate for the
 * streak-at-risk push (#964, epic #961).
 *
 * Server-only: the hourly cron (#966) is the sole caller, so this lives in
 * functions/lib as plain JS — no TS↔JS port to keep in lockstep. Pure: no
 * Firestore, no admin SDK, no clock (nowUtc is injected).
 *
 * Locked design (#961 grill). Send iff ALL hold:
 *   - the streak logging today keeps is >= 2 (`savableStreak`)
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
const DAY_MS = 86400000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

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
 * The streak logging today keeps, from streaks/data's certificate
 * (`anchorStreak` days ending on `anchorDate`; documents from before
 * 2026-10-20 carry only {currentStreak, lastActiveDate}). Kept when it ends
 * yesterday, or the day before: yesterday is then its one forgiven day,
 * bridged by a log today. Older is already broken, so 0.
 *
 * The stored `currentStreak` is the streak as shown, and the morning after a
 * rest day shows 0 (the today/yesterday rule), so a nudge gated on it was
 * skipped on exactly the evening it exists for. Gated on nothing but it, a
 * person who stopped coming back was nudged about a dead streak every day.
 */
function savableStreak(input, nowUtc) {
  const { anchorStreak, anchorDate, timezone = null } = input || {};
  const hasAnchor =
    Number.isFinite(anchorStreak) &&
    anchorStreak > 0 &&
    typeof anchorDate === "string" &&
    DATE_KEY.test(anchorDate);
  const count = hasAnchor ? anchorStreak : input?.currentStreak;
  const endsOn = hasAnchor ? anchorDate : input?.lastActiveDate;
  if (!Number.isFinite(count) || count <= 0 || typeof endsOn !== "string") {
    return 0;
  }
  // "now - 24h / 48h formatted in tz" stays on the right local calendar day
  // across DST shifts at any daytime send hour (as shouldSendFirstWeekNudge).
  const yesterday = localDateKeyInTz(new Date(nowUtc.getTime() - DAY_MS), timezone);
  const dayBefore = localDateKeyInTz(
    new Date(nowUtc.getTime() - 2 * DAY_MS),
    timezone
  );
  return endsOn === yesterday || endsOn === dayBefore ? count : 0;
}

/**
 * @param {{
 *   currentStreak?: number,      // streaks/data: the streak as shown
 *   lastActiveDate?: string,     // streaks/data: its last active day
 *   anchorStreak?: number,       // streaks/data: the certificate's count
 *   anchorDate?: string,         // streaks/data: the day it ends on
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
    remindersOptedIn = false,
    timezone = null,
    activeDateKeys = [],
    lastNudgeDateKey = null,
  } = input || {};

  if (!remindersOptedIn) return false;
  if (savableStreak(input, nowUtc) < STREAK_NUDGE_MIN_STREAK) return false;

  const localToday = localDateKeyInTz(nowUtc, timezone);
  if (!localToday) return false; // skip-on-null-tz invariant

  if (activeDateKeys.includes(localToday)) return false; // already logged today
  if (lastNudgeDateKey === localToday) return false; // already nudged today

  return true;
}

/**
 * First-week return nudge (D-1, frontend-design-principles-2026-07) — the
 * day-1 → day-2 gap fix. The regular streak nudge is floored at
 * `currentStreak >= 2` (deliberate: loss aversion needs something to lose),
 * which leaves a brand-new user who logs once and closes the app with NO
 * return trigger at the exact moment the habit doesn't exist yet. This
 * predicate fills that gap with ONE calm nudge — not a daily alarm:
 *
 * Send iff ALL hold:
 *   - reminders opted in (consent gate stays absolute)
 *   - NEVER sent before (`firstWeekNudgeDateKey` is a once-EVER marker,
 *     not once-per-day — the anti-anxiety cadence is the point)
 *   - currentStreak < 2 (at >= 2 the regular streak nudge owns the surface;
 *     the two predicates are disjoint by construction)
 *   - timezone known (same skip-on-null invariant)
 *   - active YESTERDAY but not today — i.e. exactly the morning-after of a
 *     first (or isolated) log day. This is what makes it a day-2 RETURN
 *     trigger rather than an acquisition ping: a user who never logged
 *     anything is never targeted.
 *   - not already nudged today (≤1 push/day, shared marker with the
 *     regular nudge + recap suppression)
 *
 * Hour-bucketing (~19:00 local) stays the cron's job, as with
 * shouldSendStreakNudge.
 */
function shouldSendFirstWeekNudge(input, nowUtc) {
  const {
    remindersOptedIn = false,
    timezone = null,
    activeDateKeys = [],
    lastNudgeDateKey = null,
    firstWeekNudgeDateKey = null,
  } = input || {};

  if (!remindersOptedIn) return false;
  if (firstWeekNudgeDateKey) return false; // once EVER
  // The regular nudge owns >= 2, read the same way, so the two stay disjoint.
  if (savableStreak(input, nowUtc) >= STREAK_NUDGE_MIN_STREAK) return false;

  const localToday = localDateKeyInTz(nowUtc, timezone);
  if (!localToday) return false; // skip-on-null-tz invariant

  if (activeDateKeys.includes(localToday)) return false; // already logged today
  if (lastNudgeDateKey === localToday) return false; // already nudged today

  // Day-2 anchor: active yesterday (their first / isolated log day). The
  // "now - 24h formatted in tz" shape stays on the previous local calendar
  // day across DST shifts at any daytime send hour.
  const localYesterday = localDateKeyInTz(
    new Date(nowUtc.getTime() - 86400000),
    timezone
  );
  if (!localYesterday || !activeDateKeys.includes(localYesterday)) {
    return false;
  }

  return true;
}

module.exports = {
  savableStreak,
  shouldSendStreakNudge,
  shouldSendFirstWeekNudge,
  localDateKeyInTz,
  STREAK_NUDGE_MIN_STREAK,
};
