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
 *   - `localWeekKey` → week key ("YYYY-MM-DD" of the week's first day
 *     on or before the input date). The anchor is `WEEK_STARTS_ON`.
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
 * The day a week starts on, in `Date.getDay()` numbering — 0 = Sunday,
 * 1 = Monday.
 *
 * MONDAY, per RunWk2 — the en-GB and ISO-8601 convention, and the one
 * `streakEngine.weekKey` and the coach-prompt doc ids already used while
 * everything else here anchored on Sunday.
 *
 * This is the ONE place the app decides. It was decided in six places:
 * `localWeekKey` here, plus `setDate(getDate() - getDay())` written out by
 * hand in `personalTrajectory`, `leaderboard` and twice each in two blocks
 * of `History.tsx`. Those hand-written copies are why History carries
 * comments insisting the axis "MUST use the same local-week helper" as the
 * data — a coupling real enough to be documented, held together by nothing
 * but the comment. Centralising them first is what made this a one-line
 * edit rather than an archaeology exercise.
 *
 * Changing it again is not a one-line edit, because stored data carries
 * the old anchor: `programState` week keys are migrated at schema v4, and
 * `migrateWeekKeyAnchor` documents why the remap shifts a day FORWARD
 * rather than re-deriving in place.
 */
export const WEEK_STARTS_ON = 1;

/** Local midnight on the first day of the week containing `d`.
 *  Pure local-date math — never reads UTC components. */
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
  // The key carries its own anchor. Legacy Sunday keys must still derive
  // Sun..Sat dates while migration is repairing rows before re-anchoring.
  const start = parseLocalDate(weekKey);
  const offset = (dayOfWeek - start.getDay() + 7) % 7;
  return localDateString(addLocalDays(start, offset));
}

/**
 * A weekday's POSITION inside the anchored week: 0 for the week's first
 * day, 6 for its last. This is the number to sort, compare and "is it
 * before X" on; `Date.getDay()` is not, because under any anchor but
 * Sunday the two disagree — a Sunday run is `getDay() === 0` and yet the
 * LAST run of a Monday week.
 *
 * The scheduler's race week was ordering and filtering on `getDay()`
 * directly, correct only by the Sunday coincidence; this is what it
 * compares on now.
 */
export function weekPosition(dayOfWeek: number): number {
  return (dayOfWeek - WEEK_STARTS_ON + 7) % 7;
}

/**
 * Re-anchor a week key written under the SUNDAY anchor onto the Monday
 * week it belongs to (RunWk2, schema v4).
 *
 * The direction is the whole point, and the obvious implementation is
 * wrong. `localWeekKey(parseLocalDate(sundayKey))` under Monday rules
 * resolves BACKWARD — Sun 6 Sept lands on Mon 31 Aug — so every stored
 * anchor would come out a week older than it was. Both rollovers compare
 * a stored key to a fresh one as strings and advance while the stored one
 * sorts first, so that reading hands every user a spurious week advance
 * (and possibly a deload) on their first open after the flip: work the
 * engine did on their behalf that they did not earn.
 *
 * Shifting one day FIRST maps the Sunday-anchored week onto the Monday
 * week that shares six of its seven days — Sun 6 Sept → Mon 7 Sept — which
 * is both the closest week by content and the one that leaves the rollover
 * comparisons where they were.
 *
 * Idempotent: a key already on a Monday is returned unchanged, so the
 * migration can run on every read without walking anyone's plan forward.
 */
export function migrateWeekKeyAnchor(weekKey: string): string {
  const d = parseLocalDate(weekKey);
  if (d.getDay() === WEEK_STARTS_ON) return weekKey;
  return localWeekKey(addLocalDays(d, 1));
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
