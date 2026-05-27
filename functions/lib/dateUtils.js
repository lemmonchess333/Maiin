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

module.exports = { utcDateString, parseUtcDate };
