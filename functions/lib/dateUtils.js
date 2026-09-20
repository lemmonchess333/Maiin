/**
 * Shared UTC date helpers for `functions/`.
 *
 * Cloud Functions run in UTC; users' local dates differ by ≤24h
 * which is well within the multi-day graces used by the
 * reconciliation triggers (3-day no-show, 7-day recovery-exit), so
 * timezone drift can't trip them early.
 *
 * The two helpers were previously inlined as `_utcDateString` /
 * `_parseUtcDate` in `index.js`. Lifted so future scheduled
 * functions can import the same conventions rather than reinvent
 * them.
 */

/** YYYY-MM-DD in UTC. Mirror of `src/lib/dateHelpers.ts:localDateString`
 *  but UTC-anchored — server-side reconciliation reads dates in UTC
 *  so that all users are evaluated against the same boundary
 *  regardless of where the function happens to wake. */
function utcDateString(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a UTC Date at 00:00. Used for
 *  grace-window math (recovery exit, no-show grace); not for
 *  user-visible date rendering. */
function parseUtcDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** The only YYYY-MM-DD shape check in `functions/`. Shape ONLY — it says
 *  nothing about whether the digits name a real day; pair it with
 *  `isCalendarDate` for that. */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Does this string name a day that exists?
 *
 * The regex alone does not answer that, and the gap is not obvious: JS
 * date parsing ROLLS OVER rather than refusing, so `2026-02-30` and
 * `2026-09-31` both parse happily (to 2 March and 1 October). A
 * `Number.isFinite(Date.parse(...))` check therefore catches only the
 * out-of-range MONTH cases (`2026-13-01` -> NaN) and waves the
 * out-of-range DAY cases straight through.
 *
 * The round trip is what closes it: parse, format back, and require the
 * result to equal the input. A rolled-over date formats as the day it
 * rolled to, so it cannot match. This is the same property
 * `dateUtils.test.js`'s round-trip block already asserts for the pair,
 * turned into a predicate.
 *
 * Lifted from `challengeActivityWindow.isValidDateKey`, which had it
 * right and kept it private to the challenge module; that export now
 * delegates here so there is one implementation rather than two.
 */
function isCalendarDate(value) {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const parsed = parseUtcDate(value);
  return Number.isFinite(parsed.getTime()) && utcDateString(parsed) === value;
}

module.exports = { utcDateString, parseUtcDate, isCalendarDate, DATE_KEY_RE };
