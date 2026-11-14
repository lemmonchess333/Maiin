/**
 * The training week: what was done and what was planned, Monday to Sunday,
 * from the day the account began.
 *
 * Every count of a week's sessions reads it (App1 Q14: "every weekly
 * count comes from one module"), so no two screens can count one week
 * two ways:
 *
 *   - Home's "This week" (`weekSummary.ts`), both finish screens' "Your
 *     week so far" and the run finish screen's plan row (`useWeekPulse`),
 *     and the weekly review (`useWeeklyReview`): `trainingWeek`;
 *   - a free run's hero line ("12.4 km this week", `homeHero.ts`), the
 *     Following feed's week card (`personalTrajectory.ts`), the weekly
 *     challenge's own lifts (`myWeekLifts.ts`) and Train's free-running
 *     week (`ProgrammeRunSection`): `weekDone`;
 *   - a weekly running goal's runs and minutes (`nonRaceGoal.ts`):
 *     `weekRunsThatCount`;
 *   - an anniversary's 50th and 100th session (`anniversaries.ts`):
 *     `countedSessions`, the sessions the week's done counts count, ever;
 *   - the league's planned sessions: `functions/lib/leaguePlanned.js`, a
 *     server copy pinned by leaguePlanned.cross.test.ts. The league's done
 *     count (`functions/lib/weekTally.js`) counts recorded sessions only,
 *     and weekTally.cross.test.ts pins it to `weekDone` for them.
 *
 * A food day is the same kind of rule, in `foodDay.ts`.
 * `oneWeekCountGuard.test.ts` fails on a new counter written elsewhere.
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
import { localWeekKey } from "./dateHelpers";
import { isLegacyCompleted } from "./scheduledRunStatus";
import { beforeStart, scheduledDaysSinceStart, startDayKey } from "./startDay";
import { resolveRunDayForDate, weekScheduleFor } from "./trainingResolver";
import { isVolumeEligible, type RunRecord } from "./runStatsEligibility";
import { weekDays, weekRunsThatCount, type WeekRun } from "./weekRuns";

// The week's days and its runs that count live in weekRuns.ts, which reads no
// plan, so a module the profile type reaches (nonRaceGoal.ts) can use them
// without an import cycle back to auth.tsx through trainingResolver.
export { weekDays, weekRunsThatCount, type WeekRun };

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

/**
 * The saved sessions a count of sessions counts: every saved lift (a
 * session on a rest day happened), and every run that counts
 * (`isVolumeEligible`, so a run saved anyway counts nowhere). The week's
 * done counts are these, in its seven days; an anniversary's 50th and
 * 100th session are these, ever (App1 Q58).
 */
export function countedSessions<
  W extends { date: string },
  R extends RunRecord,
>(
  workouts: readonly W[],
  runs: readonly R[]
): { lifts: readonly W[]; runs: R[] } {
  return { lifts: workouts, runs: runs.filter((run) => isVolumeEligible(run)) };
}

/** The week's sessions done, and the distance its runs covered. */
export interface WeekDone {
  lifts: number;
  runs: number;
  /** Metres the runs that count covered. */
  metres: number;
}

/** What `weekDone` reads: the week and its sessions, and the plan, whose
 *  runs marked done by hand count too. Without a plan, only what was
 *  recorded counts. */
export type WeekDoneInput = Omit<
  TrainingWeekInput,
  "profile" | "programState"
> & {
  profile?: TrainingWeekInput["profile"];
  programState?: TrainingWeekInput["programState"];
};

/** The plan's runs in the week: each day from the start day that the plan
 *  holds a run on. */
function plannedRunDays(
  days: readonly string[],
  programState: TrainingWeekInput["programState"],
  startKey: string | null,
  now: Date
): { date: string; runDay: ScheduledRunDay }[] {
  const planned: { date: string; runDay: ScheduledRunDay }[] = [];
  const planWeekKey = localWeekKey(now);
  for (const date of days) {
    if (beforeStart(date, startKey)) continue;
    const runDay = resolveRunDayForDate(
      date,
      programState?.runDays,
      planWeekKey
    );
    if (runDay) planned.push({ date, runDay });
  }
  return planned;
}

function countDone(
  days: readonly string[],
  workouts: readonly { date: string }[],
  runs: readonly WeekRun[],
  plannedRuns: readonly { date: string; runDay: ScheduledRunDay }[],
  manual: Record<string, ManualCompletion>
): WeekDone {
  const inWeek = (day: string) => day >= days[0] && day <= days[6];
  const sessions = countedSessions(
    workouts.filter((w) => inWeek(w.date)),
    runs.filter((run) => inWeek(run.day))
  );
  const counted = sessions.runs;
  const daysWithARun = new Set(counted.map((run) => run.day));
  const doneByHand = plannedRuns.filter(
    ({ date, runDay }) =>
      ((runDay.id !== undefined && !!manual[runDay.id]) ||
        isLegacyCompleted(runDay.status)) &&
      !daysWithARun.has(date)
  ).length;
  return {
    lifts: sessions.lifts.length,
    runs: counted.length + doneByHand,
    metres: counted.reduce((sum, run) => sum + (run.distance ?? 0), 0),
  };
}

/**
 * The week's sessions done, counted as `trainingWeek` counts them, for a
 * screen that shows what was done and not the plan beside it.
 */
export function weekDone({
  weekKey,
  profile = null,
  programState = null,
  workouts,
  runs,
  now = new Date(),
}: WeekDoneInput): WeekDone {
  const days = weekDays(weekKey);
  return countDone(
    days,
    workouts,
    runs,
    plannedRunDays(days, programState, startDayKey(profile?.createdAt), now),
    programState?.manualCompletions ?? {}
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
  const startKey = startDayKey(profile?.createdAt);

  const liftDays = scheduledDaysSinceStart(
    weekScheduleFor(profile),
    ["lift", "both"],
    weekKey,
    startKey
  );
  const plannedRuns = plannedRunDays(days, programState, startKey, now);
  const done = countDone(
    days,
    workouts,
    runs,
    plannedRuns,
    programState?.manualCompletions ?? {}
  );

  return {
    weekKey,
    lifts: {
      done: done.lifts,
      planned: liftDays > 0 ? liftDays : null,
    },
    runs: {
      done: done.runs,
      planned: plannedRuns.length > 0 ? plannedRuns.length : null,
      km: Math.round(done.metres / 100) / 10,
    },
  };
}
