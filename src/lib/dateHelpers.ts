/**
 * Local-date helpers — P0-A · spec v7.
 *
 * All schedule dates use the user's local calendar, not UTC. Avoids
 * the late-night-PST class of bugs where `new Date().toISOString()`
 * silently rolls a day forward (e.g. 23:00 PST = 07:00 UTC = next
 * day's ISO date). Every `ScheduledRunDay.date`, `weekKey`, and
 * derived `scheduledRunId` flows through these helpers.
 *
 * Conventions:
 *   - `localDateString` → "YYYY-MM-DD" using local Date getters
 *   - `localWeekKey` → Sunday-start week key ("YYYY-MM-DD" of the
 *     Sunday on or before the input date). Matches the existing
 *     JS convention `Date.getDay()` where 0 = Sunday.
 *   - `localDayIndex` → 0=Sun..6=Sat, mirrors Date.getDay()
 *   - `generateScheduledRunId` → stable deterministic ID for a
 *     scheduled run instance; preserved across user-initiated moves
 */

/** Format a Date as local "YYYY-MM-DD". Never UTC. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sunday-start week key for the week containing `d`. Returns the
 * local YYYY-MM-DD of that Sunday. Pure local-date math — does not
 * read UTC components.
 */
export function localWeekKey(d: Date = new Date()): string {
  const dow = d.getDay(); // 0=Sun..6=Sat
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  return localDateString(sunday);
}

/** 0=Sun, 1=Mon, ..., 6=Sat. Local. */
export function localDayIndex(d: Date = new Date()): number {
  return d.getDay();
}

/**
 * Stable deterministic ID for a scheduled run. Format:
 *   "runday_{weekKey}_{dayIndex}_{templateId}"
 *
 * Critical: this is the `scheduledRunId` referenced by the spec's
 * routing primitive (`/run?scheduledRunId=...`). It must:
 *   - Stay stable across user-initiated moves (the run keeps its
 *     `id` but updates its `date` + `dayIndex`)
 *   - Be derivable from existing v1 fields during lazy migration
 *   - Be unique within a week+templateId combination
 */
export function generateScheduledRunId(
  args: { dayIndex: number; templateId: string },
  weekKey: string,
): string {
  return `runday_${weekKey}_${args.dayIndex}_${args.templateId}`;
}

/**
 * Add `days` to a local Date and return the new local Date.
 * Avoids UTC drift by going through year/month/date components.
 * Useful for building a 7-day window from a weekKey.
 */
export function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/**
 * Parse a "YYYY-MM-DD" string back into a local Date at midnight.
 * Mirror of `localDateString` — never uses UTC parsing.
 *
 * Note: `new Date("2026-05-14")` parses as UTC midnight, which
 * shifts to the previous day in negative-offset timezones. Always
 * use this helper instead.
 */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
