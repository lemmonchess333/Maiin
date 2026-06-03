/**
 * Server-side active-date derivation (push arc #961, slice 5 — Option A).
 *
 * Mirrors the client's computeActiveDateSet (src/features/streaks/useStreaks):
 * a local date counts as "active" if ANY workout / run / meal contributes it.
 * Workout + meal `date` fields are ALREADY the user's local YYYY-MM-DD (written
 * client-side), so they're used as-is; run timestamps are UTC, so they're
 * converted to the user's tz here — that's why the server needs the tz to agree
 * with the client on which local day a run counts for. Meals need ≥1 item
 * (guards draft/empty docs), matching the client.
 *
 * This exists because the active-date set is computed client-side and never
 * persisted, so the streak-nudge cron has no stored field to read — it
 * re-derives from the last couple of days of logs (the cron bounds the query).
 *
 * Pure: plain rows (runs as epoch ms) + tz in, local date keys out.
 */
const { localDateKeyInTz } = require("./streakNudge");

/**
 * @param {{
 *   workouts?: { date?: string }[],
 *   runs?: { completedAtMs?: number }[],
 *   meals?: { date?: string, items?: unknown[] }[],
 * }} logs
 * @param {string | null | undefined} timezone
 * @returns {string[]} unique local "YYYY-MM-DD" active days
 */
function activeDateKeysFromLogs(logs, timezone) {
  const set = new Set();
  const { workouts = [], runs = [], meals = [] } = logs || {};

  for (const w of workouts) {
    if (typeof w.date === "string" && w.date) set.add(w.date);
  }
  for (const r of runs) {
    if (typeof r.completedAtMs !== "number" || !Number.isFinite(r.completedAtMs)) {
      continue;
    }
    const key = localDateKeyInTz(new Date(r.completedAtMs), timezone);
    if (key) set.add(key);
  }
  for (const m of meals) {
    if (typeof m.date !== "string" || !m.date) continue;
    if (!Array.isArray(m.items) || m.items.length === 0) continue;
    set.add(m.date);
  }

  return Array.from(set);
}

module.exports = { activeDateKeysFromLogs };
