"use strict";

/**
 * Challenge activity-window predicate.
 *
 * A workout or run contributes to a challenge only when the SOURCE ACTIVITY
 * DAY falls inside the challenge's half-open date window
 * `startDate <= activityDate < endDate`. Offline delivery time, Cloud
 * Function retry time, and import time must never decide which challenge
 * receives progress — the pre-fix engines compared the challenge to
 * function-execution `new Date()` and checked only `endDate`, so a June
 * session flushed in July could credit July's challenge and a future
 * challenge could receive progress.
 *
 * All boundaries are normalised to a UTC YYYY-MM-DD key and compared as
 * strings. Missing/invalid source day fails CLOSED (the caller skips the
 * write and logs) rather than falling back to `new Date()`.
 */

const { isCalendarDate, DATE_KEY_RE } = require("./dateUtils");

/* Kept as a named export because this module's callers and tests use it;
   the implementation moved to dateUtils so the Circle target-date paths
   could share it instead of growing a second copy. */
const isValidDateKey = isCalendarDate;

function instantToDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value && typeof value.toMillis === "function") {
    return new Date(value.toMillis());
  }
  if (typeof value === "number" || typeof value === "string") {
    return new Date(value);
  }
  return null;
}

function instantToDateKey(value) {
  const date = instantToDate(value);
  if (!date || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Workout and run documents use a local YYYY-MM-DD `date` when available.
 * Preserve that explicit calendar day. Legacy docs fall back to their
 * persisted completion instant, never to trigger execution time.
 */
function sourceActivityDateKey(data) {
  if (data && isValidDateKey(data.date)) {
    return data.date;
  }
  return (
    instantToDateKey(data && data.completedAt) ||
    instantToDateKey(data && data.createdAt) ||
    null
  );
}

/** Challenge definitions are server-owned UTC-midnight [start, end) ranges. */
function challengeContainsActivityDate(challenge, activityDateKey) {
  if (!isValidDateKey(activityDateKey)) return false;
  const startKey = instantToDateKey(challenge && challenge.startDate);
  const endKey = instantToDateKey(challenge && challenge.endDate);
  if (!startKey || !endKey || startKey >= endKey) return false;
  return startKey <= activityDateKey && activityDateKey < endKey;
}

/**
 * The bound for reading only the challenges that can contain a day:
 * query `endDate > openOnDayBound(day)`.
 *
 * challengeContainsActivityDate accepts a challenge only when its end
 * falls on a later UTC day than `day`, so every challenge it accepts ends
 * after UTC midnight of `day`, and the query returns all of them. It also
 * returns some the predicate then rejects (one ending later that same day,
 * one not started yet), which is why callers still apply it. A challenge
 * with no end date is left out by the query and rejected by the predicate
 * alike. Challenge dates are written as Timestamps (rolloverChallenges),
 * which a Date bound compares against. Null for an invalid day.
 */
function openOnDayBound(activityDateKey) {
  if (!isValidDateKey(activityDateKey)) return null;
  return new Date(`${activityDateKey}T00:00:00.000Z`);
}

module.exports = {
  DATE_KEY_RE,
  isValidDateKey,
  instantToDateKey,
  sourceActivityDateKey,
  challengeContainsActivityDate,
  openOnDayBound,
};
