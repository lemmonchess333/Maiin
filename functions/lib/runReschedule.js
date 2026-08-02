"use strict";

/**
 * Server mirror of the one-off run move (RUN-RESCHEDULE-01).
 *
 * Moves a planned run to another day WITHIN its generated Sunday-start week.
 * Moves the plan, not the goalposts: the stable `id`, `templateId`,
 * `userOverride`, `status`, completion truth, race identity (`type`) and the
 * `manualCompletions` map all survive — only `date` / `dayIndex` and the
 * truthful clash metadata change.
 *
 * WHY A MIRROR RATHER THAN A CLIENT-SUPPLIED PATCH. The move's OUTPUT is
 * three derived fields (`date`, the two move markers, the clash flag), and a
 * client that sent them could place a run on any date it liked — including
 * outside its own week, which is the one thing the feature is defined not to
 * do. What the client legitimately knows and the server does not is nothing
 * at all here: the target dayIndex is a user choice (a command argument), the
 * week anchor is on the runDay, and `weekSchedule` is on the profile, which
 * the command transaction already reads. So the whole computation belongs
 * here, and the command carries only "which run, which day".
 *
 * TIMEZONE NOTE. `dateForDay` adds whole days to a plain YYYY-MM-DD week
 * anchor. Both sides parse a calendar day and emit a calendar day with no
 * wall-clock instant in between, so a consistent parse (UTC here, local on
 * the client) yields the same string. Same argument as progressionHold.js,
 * and the cross-test walks every day of the week to prove it rather than
 * asserting it.
 *
 * TESTED-COPY RULE: pinned against `src/lib/runReschedule.ts` by
 * `src/features/program/__tests__/runReschedule.cross.test.ts`.
 */

/** Mirror of programTypes.ts HARD_RUN_TYPES. */
const HARD_RUN_TYPES = Object.freeze(["long", "tempo", "intervals", "race"]);

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDayUTC(date) {
  if (typeof date !== "string") return NaN;
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function formatDayUTC(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mirror of runReschedule.ts dateForDay — the Nth day of the anchored week. */
function dateForDay(weekKey, dayIndex) {
  const base = parseDayUTC(weekKey);
  if (!Number.isFinite(base)) return null;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
  return formatDayUTC(base + dayIndex * DAY_MS);
}

/**
 * Mirror of runReschedule.ts runOriginDate — the date a run snaps back to.
 * Once moved, `movedFromDate` holds the origin; before any move it is `date`.
 */
function runOriginDate(source) {
  return (source && (source.movedFromDate || source.date)) || "";
}

/**
 * Mirror of runReschedule.ts computeRunMove. Returns null when the week
 * anchor or the target day cannot resolve to a date.
 */
function computeRunMove(source, targetDayIndex, weekSchedule) {
  const weekKey = source && source.weekKey;
  if (!weekKey) return null;
  const date = dateForDay(weekKey, targetDayIndex);
  if (date === null) return null;

  const origin = runOriginDate(source);
  const returnToOrigin = date === origin;
  const schedule = Array.isArray(weekSchedule) ? weekSchedule : [];
  const match = schedule.find((d) => d && d.day === targetDayIndex);
  const dayType = (match && match.type) || "rest";
  const clashesWithLift =
    HARD_RUN_TYPES.includes(source.type) &&
    (dayType === "both" || dayType === "lift");

  return {
    date,
    dayIndex: targetDayIndex,
    // undefined (not null) on a snap-back, so the caller DELETES the markers
    // rather than leaving stale values behind — the client does the same.
    movedFromDate: returnToOrigin ? undefined : origin,
    movedToDate: returnToOrigin ? undefined : date,
    clashesWithLift,
  };
}

module.exports = {
  HARD_RUN_TYPES,
  computeRunMove,
  dateForDay,
  runOriginDate,
};
