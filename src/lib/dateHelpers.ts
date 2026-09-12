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
/**
 * The day a week starts on, in `Date.getDay()` numbering — 0 = Sunday,
 * 1 = Monday.
 *
 * This is the ONE place the app decides. It was decided in six places:
 * `localWeekKey` here, plus `setDate(getDate() - getDay())` written out by
 * hand in `personalTrajectory`, `leaderboard` and twice each in two blocks
 * of `History.tsx`. Those hand-written copies are why History carries
 * comments insisting the axis "MUST use the same local-week helper" as the
 * data — a coupling real enough to be documented, held together by nothing
 * but the comment. Changing the anchor meant finding all six and agreeing
 * with yourself six times; miss one and a chart's axis silently slides off
 * its data.
 *
 * Tropos is inconsistent about this today and this constant does not yet
 * resolve it: `streakEngine.weekKey` and the coach-prompt doc ids anchor on
 * MONDAY, which is also the en-GB and ISO-8601 convention. Moving to
 * Monday is a separate change; this one exists so that change is an edit
 * here rather than an archaeology exercise.
 */
export const WEEK_STARTS_ON = 0;

/** Local midnight on the first day of the week containing `d`. */
export function startOfLocalWeek(d: Date): Date {
  const back = (d.getDay() - WEEK_STARTS_ON + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

export function localWeekKey(d: Date = new Date()): string {
  return localDateString(startOfLocalWeek(d));
}

/**
 * The date on which a given day-of-week falls, inside the week a `weekKey`
 * names.
 *
 * Two conventions meet here and they are NOT the same number: a `weekKey`
 * is the week's FIRST day, while a `dayIndex` is a plain day-of-week from
 * `Date.getDay()` where 0 is always Sunday. They coincide only while the
 * week starts on Sunday, so call sites deriving a date as
 * `addLocalDays(parseLocalDate(weekKey), dayIndex)` are correct by
 * coincidence rather than by construction — under any other anchor each
 * shifts a scheduled run by a day, and a Sunday run by a whole week.
 */
export function dateForDayOfWeek(weekKey: string, dayOfWeek: number): string {
  const offset = (dayOfWeek - WEEK_STARTS_ON + 7) % 7;
  return localDateString(addLocalDays(parseLocalDate(weekKey), offset));
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
  weekKey: string
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
