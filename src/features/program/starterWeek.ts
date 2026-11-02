import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { RunPlan, ScheduledRunDay } from "./programTypes";
import { rebuiltWeekFromToday } from "./racePlanContinuation";
import { scheduleStarterWeek } from "./runScheduler";
import { clampStarterStage, weekKeyAfter } from "./starterPlan";

/** A starter plan at `stage` for the week starting `weekKey`. */
export function starterRunPlan(stage: number, weekKey: string): RunPlan {
  return {
    mode: "starter",
    stage: clampStarterStage(stage),
    stageWeekKey: weekKey,
  };
}

/**
 * A starter's week built from `today`, as a plan is that is made, changed
 * or caught up partway through a week: this week's days already gone stay
 * as `prior` has them, and none is planned before today
 * (`rebuiltWeekFromToday`). A week with none of its run days left, done or
 * to come, starts on next week's instead, as a race plan's does (Run19);
 * the stage is then next week's to weigh.
 */
export function starterWeekFrom(input: {
  weekSchedule: ScheduleDay[];
  stage: number;
  today: string;
  prior?: readonly ScheduledRunDay[];
}): { runDays: ScheduledRunDay[]; runPlan: RunPlan } {
  const weekKey = localWeekKey(parseLocalDate(input.today));
  const runDays = rebuiltWeekFromToday(
    input.prior ?? [],
    scheduleStarterWeek({
      weekSchedule: input.weekSchedule,
      weekStart: weekKey,
      stage: input.stage,
    }),
    input.today,
    weekKey
  );
  if (runDays.length > 0)
    return { runDays, runPlan: starterRunPlan(input.stage, weekKey) };
  const next = weekKeyAfter(weekKey, 1);
  return {
    runDays: scheduleStarterWeek({
      weekSchedule: input.weekSchedule,
      weekStart: next,
      stage: input.stage,
    }),
    runPlan: starterRunPlan(input.stage, next),
  };
}
