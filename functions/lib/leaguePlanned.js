"use strict";

/**
 * A league week's planned sessions (Soc15 call 3): the server copy of how
 * the app counts a week's plan, src/lib/trainingWeek.ts.
 *
 * A league scores each member against their own plan, so a three-day
 * lifter who does three sessions beats a marathoner who does four of six.
 * "Their own plan" has to be the plan the app shows them: Home's "This
 * week", the finish screens and the weekly recap all read trainingWeek.ts,
 * and a league that counted "3 of 4" where Home said "3 of 5" would be a
 * second opinion on the same week. So this module is a copy of that one
 * count, pinned to it by src/lib/__tests__/leaguePlanned.cross.test.ts,
 * which runs both on the same profiles and plans (ADR-0008: the test
 * requires this file, the one the standings call).
 *
 *   lifts planned  the schedule's lift and Both days from the day the
 *                  account began (`scheduledDaysSinceStart`): the person's
 *                  own seven-day schedule, or one built from their weekly
 *                  targets when it is missing (`weekScheduleFor`,
 *                  `generateSchedule` in src/lib/scheduleUtils.ts)
 *   runs planned   the plan's run days in the week from the day the account
 *                  began, each day resolved as `resolveRunDayForDate` does:
 *                  an exact date, then the week key and day, then an older
 *                  plan's undated day, which belongs only to the week the
 *                  plan was made for
 *
 * The client's start day is the device's local date of `createdAt`; here it
 * is the account's own timezone, UTC without one, as fellBehindWeek.js
 * reads it. The two agree whenever the device is where the account says it
 * is, which the cross test arranges.
 *
 * On top of the shared count, the league's own rule (the owner's brief,
 * 3 November 2026): a free runner's plan holds no run days, so their runs
 * are their weekly target (`weeklyRunDaysTarget ?? weeklyRunsTarget ?? 0`,
 * getWeeklyRunTarget's order); and a week that still plans nothing is
 * scored out of DEFAULT_PLANNED.
 *
 * Pure: no Firestore, no clock.
 */

const { parseUtcDate, utcDateString } = require("./dateUtils");
const { localDateKeyInTz } = require("./streakNudge");

/** What a week that plans nothing is scored out of. */
const DEFAULT_PLANNED = 3;

/** The order the week's days are filled in: Mon, Wed, Fri, Tue, Thu, Sat,
 *  Sun (scheduleUtils.ts SLOT_ORDER). */
const SLOT_ORDER = Object.freeze([1, 3, 5, 2, 4, 6, 0]);

const DAY_MS = 86400000;

function addDays(dayKey, n) {
  return utcDateString(new Date(parseUtcDate(dayKey).getTime() + n * DAY_MS));
}

/** The Monday of the week holding `dayKey` (dateHelpers.localWeekKey). */
function mondayOf(dayKey) {
  const day = parseUtcDate(dayKey);
  const back = (day.getUTCDay() + 6) % 7;
  return utcDateString(new Date(day.getTime() - back * DAY_MS));
}

/** The date a day of the week falls on inside the week `weekKey` starts
 *  (dateHelpers.dateForDayOfWeek). */
function dateForDayOfWeek(weekKey, dayOfWeek) {
  const start = parseUtcDate(weekKey);
  const offset = (dayOfWeek - start.getUTCDay() + 7) % 7;
  return addDays(weekKey, offset);
}

function blankWeek() {
  return Array.from({ length: 7 }, (_, day) => ({ day, type: "rest" }));
}

function assembleSlots({ bothCount, liftOnlyCount, runOnlyCount }) {
  const schedule = blankWeek();
  const types = [
    ...Array(bothCount).fill("both"),
    ...Array(liftOnlyCount).fill("lift"),
    ...Array(runOnlyCount).fill("run"),
  ];
  for (let i = 0; i < types.length && i < SLOT_ORDER.length; i++) {
    schedule[SLOT_ORDER[i]].type = types[i];
  }
  return schedule;
}

/** A week built from lift and run day counts (scheduleUtils.generateSchedule). */
function generateSchedule(liftDays, runDays) {
  const totalActive = liftDays + runDays;
  const schedule = blankWeek();
  if (totalActive === 0) return schedule;
  if (totalActive <= 7) {
    const pattern = [];
    let l = liftDays;
    let r = runDays;
    while (l > 0 || r > 0) {
      if (l > 0) {
        pattern.push("lift");
        l--;
      }
      if (r > 0) {
        pattern.push("run");
        r--;
      }
    }
    for (let i = 0; i < pattern.length && i < SLOT_ORDER.length; i++) {
      schedule[SLOT_ORDER[i]].type = pattern[i];
    }
    return schedule;
  }
  const bothCount = Math.min(totalActive - 7, liftDays, runDays);
  const liftOnlyCount = Math.max(0, liftDays - bothCount);
  const runOnlyCount = Math.max(0, runDays - bothCount);
  const totalDaysNeeded = bothCount + liftOnlyCount + runOnlyCount;
  if (totalDaysNeeded > 7) {
    const overflow = totalDaysNeeded - 7;
    if (liftOnlyCount >= runOnlyCount) {
      return assembleSlots({
        bothCount,
        liftOnlyCount: Math.max(0, liftOnlyCount - overflow),
        runOnlyCount,
      });
    }
    return assembleSlots({
      bothCount,
      liftOnlyCount,
      runOnlyCount: Math.max(0, runOnlyCount - overflow),
    });
  }
  return assembleSlots({ bothCount, liftOnlyCount, runOnlyCount });
}

/** The weekly run target, `getWeeklyRunTarget`'s order. */
function weeklyRunTarget(profile) {
  return (
    (profile && profile.weeklyRunDaysTarget) ??
    (profile && profile.weeklyRunsTarget) ??
    0
  );
}

/** The person's seven-day schedule (trainingResolver.weekScheduleFor). */
function weekScheduleFor(profile) {
  const own = profile && profile.weekSchedule;
  return Array.isArray(own) && own.length === 7
    ? own
    : generateSchedule(
        (profile && profile.weeklyWorkoutsTarget) ?? 3,
        weeklyRunTarget(profile)
      );
}

/** The day the account began, in its own timezone (UTC without one), or
 *  null while `createdAt` is not a timestamp (startDay.startDayKey). */
function accountStartKey(profile) {
  const createdAt = profile && profile.createdAt;
  if (!createdAt || typeof createdAt.toMillis !== "function") return null;
  const ms = createdAt.toMillis();
  if (!Number.isFinite(ms)) return null;
  const began = new Date(ms);
  return localDateKeyInTz(began, profile.timezone) || utcDateString(began);
}

function beforeStart(dateKey, startKey) {
  return !!startKey && dateKey < startKey;
}

/** startDay.scheduledDaysSinceStart. */
function scheduledDaysSinceStart(schedule, types, weekKey, startKey) {
  return schedule.filter(
    (s) =>
      s &&
      typeof s.type === "string" &&
      types.includes(s.type) &&
      (typeof s.day !== "number" ||
        !beforeStart(dateForDayOfWeek(weekKey, s.day), startKey))
  ).length;
}

/** trainingResolver.resolveRunDayForDate. */
function resolveRunDayForDate(dateKey, runDays, currentWeekKey) {
  if (!Array.isArray(runDays) || runDays.length === 0) return null;
  const targetWeekKey = mondayOf(dateKey);
  const targetDow = parseUtcDate(dateKey).getUTCDay();
  const exact = runDays.find((rd) => rd && rd.date === dateKey);
  if (exact) return exact;
  const byWeekKey = runDays.find(
    (rd) =>
      rd &&
      !rd.date &&
      rd.weekKey === targetWeekKey &&
      rd.dayIndex === targetDow
  );
  if (byWeekKey) return byWeekKey;
  if (targetWeekKey !== currentWeekKey) return null;
  const legacy = runDays.find(
    (rd) => rd && !rd.date && !rd.weekKey && rd.dayIndex === targetDow
  );
  return legacy || null;
}

/**
 * The week's planned lifts and runs as trainingWeek.ts counts them, null
 * where nothing is planned. `planWeekKey` is the week an older plan's
 * undated run days belong to: the week the app reads them in, which for a
 * league standing is the group's own week.
 */
function plannedInWeek(profile, programState, weekKey, planWeekKey = weekKey) {
  const startKey = accountStartKey(profile);
  const lifts = scheduledDaysSinceStart(
    weekScheduleFor(profile),
    ["lift", "both"],
    weekKey,
    startKey
  );
  const runDays = programState && programState.runDays;
  let runs = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekKey, i);
    if (beforeStart(date, startKey)) continue;
    if (resolveRunDayForDate(date, runDays, planWeekKey)) runs += 1;
  }
  return { lifts: lifts > 0 ? lifts : null, runs: runs > 0 ? runs : null };
}

/**
 * The league's planned count for a member's week: the plan's lifts and
 * runs, a free runner's weekly target for the runs, and DEFAULT_PLANNED
 * when the week still plans nothing. `runsFromPlan` says whether the runs
 * came from the plan's own run days.
 */
function leaguePlanned(profile, programState, weekKey, planWeekKey = weekKey) {
  const week = plannedInWeek(profile, programState, weekKey, planWeekKey);
  const runsFromPlan = week.runs !== null;
  const runs = runsFromPlan ? week.runs : Math.max(0, weeklyRunTarget(profile));
  const total = (week.lifts ?? 0) + runs;
  return {
    lifts: week.lifts ?? 0,
    runs,
    runsFromPlan,
    planned: total > 0 ? total : DEFAULT_PLANNED,
  };
}

module.exports = {
  DEFAULT_PLANNED,
  generateSchedule,
  weekScheduleFor,
  accountStartKey,
  resolveRunDayForDate,
  plannedInWeek,
  leaguePlanned,
};
