import type { UserProfile } from "@/lib/auth";
import { wholeWeeksBetween } from "@/lib/dateHelpers";
import { carryCompletionsAcrossRegen } from "@/lib/runCompletionCarry";
import { planningEasyPaceSPerKm } from "@/lib/runPaces";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import { profileNewRunnerUntil } from "./newRunner";
import type {
  ManualCompletion,
  RunPlan,
  ScheduledRunDay,
} from "./programTypes";
import { raceWeekFromToday } from "./racePlanContinuation";
import type { RollingGoal } from "./rollingPlan";
import type { RunningBaseline } from "./runningBaseline";
import type { RunTimeLimits } from "./runTimeLimits";
import {
  generateRollingPlan,
  runTuningFromProfile,
  type RunTuning,
} from "./runScheduler";

/** A plan with no race date (Run24 (3)) at its week `planWeek`, the week
 *  starting `weekKey`. */
export function rollingRunPlan(
  goal: RollingGoal,
  planWeek: number,
  weekKey: string
): RunPlan {
  return {
    mode: "rolling",
    rollingGoal: goal,
    currentWeek: Math.max(0, Math.trunc(planWeek)),
    rollingWeekKey: weekKey,
  };
}

/** What a plan's weeks take from the runner, whichever site builds them:
 *  Pgm6's knobs, the confirmed easy pace (RUN-EV-08), the time limits, the
 *  starting point and a new runner's first weeks. */
export interface RollingRunner {
  tuning: RunTuning;
  easyPaceSPerKm: number | null;
  runningBaseline: RunningBaseline | null;
  runTimeLimits: RunTimeLimits | null;
  newRunnerUntil: string | null;
}

/** The runner as the profile has them; `tuning` when a save is newer than
 *  the profile (`RefreshRunScheduleOverrides.tuning`). */
export function rollingRunnerOf(
  profile: UserProfile,
  tuning?: RunTuning
): RollingRunner {
  return {
    tuning: tuning ?? runTuningFromProfile(profile),
    easyPaceSPerKm: planningEasyPaceSPerKm(profile.runFitness),
    runningBaseline: profile.runningBaseline ?? null,
    runTimeLimits: profile.runTimeLimits ?? null,
    newRunnerUntil: profileNewRunnerUntil(profile),
  };
}

/**
 * A plan with no race date's week (Run24 (3), deep dive D7), built as a
 * race plan's is by `regenerateRacePlan`: what varies by site is passed,
 * and the runner's tuning, confirmed easy pace, time limits, starting point
 * and a new runner's first weeks come in one `runner`, so no site leaves
 * one out.
 *
 * With `plannedFrom` (a plan made, changed or caught up partway through a
 * week), no run is planned before that day and this week's days already
 * gone stay as `prior` has them; a week with none of its run days left
 * starts on next week's instead, one week on in the plan (Run19, as
 * `raceWeekFromToday`). Without it, the whole week is built, and a done or
 * moved run in `prior` keeps its status by date.
 */
export function regenerateRollingPlan(input: {
  runner: RollingRunner;
  goal: RollingGoal;
  /** The plan's week `weekStart` is: 0 for a plan made now. */
  planWeek: number;
  weekSchedule: ScheduleDay[];
  weeklyRunDays: number;
  currentDate: string;
  weekStart: string;
  /** Required, as on `regenerateRacePlan`: a site that forgot it would
   *  climb a returning runner's plan as if they had never stopped. */
  recentLayoff: LayoffClass;
  recentRuns: readonly DatedRun[] | null;
  recentRunsAsOf?: string;
  prior?: {
    runDays: readonly ScheduledRunDay[];
    manualCompletions?: Record<string, ManualCompletion>;
  };
  plannedFrom?: string;
}): {
  runDays: ScheduledRunDay[];
  runPlan: RunPlan;
  manualCompletions?: Record<string, ManualCompletion>;
} {
  const { runner } = input;
  const generate = (from: { currentDate: string; weekStart: string }) => ({
    weeks: generateRollingPlan({
      goal: input.goal,
      weekSchedule: input.weekSchedule,
      weeklyRunDays: input.weeklyRunDays,
      currentDate: from.currentDate,
      weekStart: from.weekStart,
      planWeek:
        input.planWeek + wholeWeeksBetween(input.weekStart, from.weekStart),
      recentLayoff: input.recentLayoff,
      tuning: runner.tuning,
      easyPaceSPerKm: runner.easyPaceSPerKm,
      runningBaseline: runner.runningBaseline,
      runTimeLimits: runner.runTimeLimits,
      newRunnerUntil: runner.newRunnerUntil,
      recentRuns: input.recentRuns,
      recentRunsAsOf: input.recentRunsAsOf,
    }),
  });
  let runDays: ScheduledRunDay[];
  let weekStart = input.weekStart;
  let manualCompletions: Record<string, ManualCompletion> | undefined;
  if (input.plannedFrom) {
    ({ runDays, weekStart } = raceWeekFromToday(
      generate,
      { currentDate: input.currentDate, weekStart: input.weekStart },
      input.plannedFrom,
      input.prior && {
        // This week's days: a week the rollover left behind isn't this one.
        runDays: input.prior.runDays.filter(
          (day) => !day.date || day.date >= input.weekStart
        ),
        manualCompletions: input.prior.manualCompletions,
      }
    ));
    // The days kept keep their ids, so their completions stay keyed to them.
    if (input.prior)
      manualCompletions = input.prior.manualCompletions ?? undefined;
  } else {
    runDays =
      generate({ currentDate: input.currentDate, weekStart }).weeks[0] ?? [];
    if (input.prior) {
      const carried = carryCompletionsAcrossRegen(
        [...input.prior.runDays],
        runDays,
        input.prior.manualCompletions
      );
      runDays = carried.runDays;
      manualCompletions = carried.manualCompletions;
    }
  }
  return {
    runDays,
    runPlan: rollingRunPlan(
      input.goal,
      input.planWeek + wholeWeeksBetween(input.weekStart, weekStart),
      weekStart
    ),
    ...(manualCompletions ? { manualCompletions } : {}),
  };
}
