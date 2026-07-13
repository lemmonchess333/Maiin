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

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

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

module.exports = {
  DATE_KEY_RE,
  isValidDateKey,
  instantToDateKey,
  sourceActivityDateKey,
  challengeContainsActivityDate,
};
