/**
 * The training week: what was done and what was planned, Monday to Sunday,
 * from the day the account began.
 *
 * Home's "This week", both finish screens' "Your week so far", the run
 * finish screen's plan row and the weekly recap read it, so no two of them
 * can count one week two ways.
 *
 *   lifts done     sessions saved for a day in the week, planned or not:
 *                  a session on a rest day happened
 *   lifts planned  the schedule's lift days from the start day; none when
 *                  the schedule plans no lifting
 *   runs done      runs that count (`isVolumeEligible`, the rule every run
 *                  total uses, so a run saved anyway counts nowhere) on a
 *                  day in the week, and planned runs marked done by hand on
 *                  a day with no such run
 *   runs planned   the plan's run days in the week, from the start day.
 *                  A free runner's plan has none, so their week is
 *                  done-only (Run9a, Rev1): there is no target to count
 *                  against
 *   km             the runs that count
 *
 * A run belongs to the day it started (Lift3, `SavedRun.day`). A planned
 * run sits on the date the plan holds it on, so a run moved to another day
 * is planned, and done, on that day.
 */
import type {
  ManualCompletion,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "./dateHelpers";
import { isVolumeEligible, type RunRecord } from "./runStatsEligibility";
import { isLegacyCompleted } from "./scheduledRunStatus";
import { beforeStart, scheduledDaysSinceStart, startDayKey } from "./startDay";
import { resolveRunDayForDate, weekScheduleFor } from "./trainingResolver";

export interface WeekCount {
  done: number;
  /** Null when nothing is planned: the count is done-only. */
  planned: number | null;
}

export interface TrainingWeek {
  /** The week's Monday, "yyyy-MM-dd". */
  weekKey: string;
  lifts: WeekCount;
  runs: WeekCount & {
    /** Kilometres the runs that count covered, to one decimal. */
    km: number;
  };
}

/** A saved run as the week counts it. */
export interface WeekRun extends RunRecord {
  /** The day the run belongs to, "yyyy-MM-dd". */
  day: string;
}

export interface TrainingWeekInput {
  /** The week's Monday, "yyyy-MM-dd". */
  weekKey: string;
  /** The schedule's fields, and when the account began. */
  profile:
    | (NonNullable<Parameters<typeof weekScheduleFor>[0]> & {
        createdAt?: unknown;
      })
    | null
    | undefined;
  programState:
    | {
        runDays?: ScheduledRunDay[];
        manualCompletions?: Record<string, ManualCompletion>;
      }
    | null
    | undefined;
  /** Saved lift sessions, by the day each belongs to. */
  workouts: readonly { date: string }[];
  runs: readonly WeekRun[];
  /**
   * When the week is read. Only an older plan's undated run days need it:
   * they belong to the week the plan was generated for, which is this one.
   */
  now?: Date;
}

/** The seven days of the week that starts on `weekKey`. */
export function weekDays(weekKey: string): string[] {
  const monday = parseLocalDate(weekKey);
  return Array.from({ length: 7 }, (_, i) =>
    localDateString(addLocalDays(monday, i))
  );
}

export function trainingWeek({
  weekKey,
  profile,
  programState,
  workouts,
  runs,
  now = new Date(),
}: TrainingWeekInput): TrainingWeek {
  const days = weekDays(weekKey);
  const inWeek = (day: string) => day >= days[0] && day <= days[6];
  const startKey = startDayKey(profile?.createdAt);

  const liftDays = scheduledDaysSinceStart(
    weekScheduleFor(profile),
    ["lift", "both"],
    weekKey,
    startKey
  );

  const counted = runs.filter(
    (run) => inWeek(run.day) && isVolumeEligible(run)
  );
  const daysWithARun = new Set(counted.map((run) => run.day));

  const plannedRuns: { date: string; runDay: ScheduledRunDay }[] = [];
  const planWeekKey = localWeekKey(now);
  for (const date of days) {
    if (beforeStart(date, startKey)) continue;
    const runDay = resolveRunDayForDate(
      date,
      programState?.runDays,
      planWeekKey
    );
    if (runDay) plannedRuns.push({ date, runDay });
  }
  const manual = programState?.manualCompletions ?? {};
  const doneByHand = plannedRuns.filter(
    ({ date, runDay }) =>
      ((runDay.id !== undefined && !!manual[runDay.id]) ||
        isLegacyCompleted(runDay.status)) &&
      !daysWithARun.has(date)
  ).length;

  const metres = counted.reduce((sum, run) => sum + (run.distance ?? 0), 0);
  return {
    weekKey,
    lifts: {
      done: workouts.filter((w) => inWeek(w.date)).length,
      planned: liftDays > 0 ? liftDays : null,
    },
    runs: {
      done: counted.length + doneByHand,
      planned: plannedRuns.length > 0 ? plannedRuns.length : null,
      km: Math.round(metres / 100) / 10,
    },
  };
}
