"use strict";

/**
 * Server mirror of the one-off run move (RUN-RESCHEDULE-01).
 *
 * Moves a planned run to another day WITHIN its generated week.
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
 * anchor (the weekday offset, not the raw index — see its docstring). Both sides parse a calendar day and emit a calendar day with no
 * wall-clock instant in between, so a consistent parse (UTC here, local on
 * the client) yields the same string, and the cross-test walks every day of
 * the week to prove it rather than asserting it.
 *
 * TESTED-COPY RULE: pinned against `src/lib/runReschedule.ts` by
 * `src/features/program/__tests__/runReschedule.cross.test.ts`.
 */

/** Mirror of programTypes.ts HARD_RUN_TYPES. */
const HARD_RUN_TYPES = Object.freeze(["long", "tempo", "intervals", "race"]);

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDayUTC(date) {
  if (typeof date !== "string") return NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  const ms = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return formatDayUTC(ms) === date ? ms : NaN;
}

function formatDayUTC(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Mirror of runReschedule.ts dateForDay — the date a getDay() weekday falls
 * on inside the week `weekKey` names.
 *
 * `dayIndex` is a weekday (0 = Sunday), NOT an offset from the week's
 * first day; the two coincide only when the week starts on Sunday. The
 * client moved its anchor to Monday (RunWk2), and this copy added the
 * index straight onto the key — so every moved run was painted on one day
 * by the client and stored on another by this transaction, which is
 * exactly the quiet drift the cross-test exists to catch.
 *
 * TRANSITIONAL: the anchor is read off the key itself rather than fixed.
 * A stored key is either a Sunday (written by a client that has not yet
 * migrated to schema v4) or a Monday (written after), and the key's own
 * weekday says which. Inferring it means an old client's move lands on
 * the day it asked for and a new client's does too, with no flag day.
 * Once every stored key is a Monday, this collapses to the fixed offset
 * `(dayIndex + 6) % 7` the client uses — RunWk2 PR 4 alongside the
 * check-in's Sunday branch.
 */
function dateForDay(weekKey, dayIndex) {
  const base = parseDayUTC(weekKey);
  if (!Number.isFinite(base)) return null;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
  // Calendar-date day-of-week is timezone-free, so UTC is safe here.
  const anchor = new Date(base).getUTCDay();
  const offset = (dayIndex - anchor + 7) % 7;
  return formatDayUTC(base + offset * DAY_MS);
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

/** Reviewed source identity/prescription. Pinned against the TS helper. */
function runMoveSourceSignature(source) {
  return JSON.stringify([
    source.id ?? "", source.weekKey ?? "", source.date ?? "", source.dayIndex,
    source.templateId, source.type, source.status || (source.completed ? "completed_exact" : "planned"),
    source.completed === true, source.userOverride ?? "",
    source.timeLimit?.minutes ?? null, source.timeLimit?.originalTemplateId ?? "",
    source.trainingBasis?.originalTemplateId ?? "",
    source.trainingBasis?.confirmedAt ?? "", source.trainingBasis?.reason ?? "",
    source.movedFromDate ?? "", source.movedToDate ?? "",
    source.clashesWithLift === true,
  ]);
}

function runMoveEvidenceWindow(runDays) {
  const dates = runDays.flatMap(run => Number.isFinite(parseDayUTC(run.date)) ? [run.date] : []).sort();
  if (!dates.length) return null;
  return { since: dates[0], until: formatDayUTC(parseDayUTC(dates[dates.length - 1]) + DAY_MS) };
}

/** Same freshness tuple as the client. NOT a claim-engine mirror. */
function runMoveCompletionEvidence(runDays, runs) {
  const window = runMoveEvidenceWindow(runDays);
  if (!window) return JSON.stringify([[], []]);
  return JSON.stringify([runDays.map(runMoveSourceSignature).sort(),
    runs.filter(run => run.day >= window.since && run.day <= window.until)
      .map(run => [run.id, run.day, run.distance, run.duration, run.avgPace,
        run.templateId ?? "", run.type ?? "", run.activityType,
        run.savedAtSeconds, run.isInvalid === true, run.savedAnyway === true])
      .sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0) ]);
}

function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.seconds === "number") return value.seconds * 1000;
  return NaN;
}

/** Only the fields used by the reviewed evidence, matching parseSavedRun. */
function runMoveSavedEvidenceRow(id, data, localDateForInstant) {
  const completedAt = timestampMs(data.completedAt);
  if (!Number.isFinite(completedAt)) return null;
  const finite = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const text = value => typeof value === "string" && value ? value : undefined;
  const savedAt = timestampMs(data.createdAt);
  return {
    id,
    day: Number.isFinite(parseDayUTC(data.date)) ? data.date : localDateForInstant(completedAt),
    distance: finite(data.distance), duration: finite(data.duration), avgPace: finite(data.avgPace),
    templateId: text(data.actualTemplateId) ?? text(data.plannedTemplateId) ?? text(data.templateId),
    type: text(data.type), activityType: data.activityType || "freerun",
    savedAtSeconds: Math.floor((Number.isFinite(savedAt) ? savedAt : completedAt) / 1000),
    isInvalid: data.isInvalid === true, savedAnyway: data.savedAnyway === true,
  };
}

module.exports = {
  HARD_RUN_TYPES,
  computeRunMove,
  dateForDay,
  runOriginDate,
  runMoveSourceSignature,
  runMoveEvidenceWindow,
  runMoveCompletionEvidence,
  runMoveSavedEvidenceRow,
};
