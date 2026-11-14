/**
 * Coming back after a break: one check for both sports (App1 Q35,
 * 13 November 2026).
 *
 * Before it, each sport found its own break: the lifter's from the logged
 * sessions (`liftLayoff.ts`, Lift4 (11)), the runner's from saved runs by a
 * rule of its own (`layoffDetection.ts`, Run15), and Home asked the two
 * separately. They agreed on the lines, by sharing the thresholds, and on
 * little else: the run side greeted only someone whose plan has running in
 * it, the lift side anyone with an old lift, so a person who had dropped
 * lifting from their plan was still offered to ease weights back in, and a
 * runner's return stayed a return for three weeks after the first run back
 * where a lifter's ended with the first lift.
 *
 * Now one check reads both sports' sessions and measures each the same way
 * (`absenceFromDays`): the days since that sport was last trained, the
 * shared lines (`classifyLayoff`) and the re-entry window after a long
 * break. Each side's easing reads its own sport from it: Home's Welcome
 * back for the weights (`liftReturnFrom`), Home's run return
 * (`runReturnFrom`), and the race plan's re-entry weeks, which read the
 * same rule over the same runs (`layoffFromRuns`). A sport the plan does
 * not hold is never a return.
 *
 * What a break is, decided here: a break from a sport is time away from
 * that sport. Someone who stopped lifting but kept running comes back to
 * the weights eased, and their running carries on; someone who stopped
 * running but kept lifting comes back to running eased, and their lifting
 * carries on; someone who stopped both is eased back into both. The other
 * reading, that training in one sport means no break from either, was
 * declined: it would hand a race runner who lifted through a month without
 * running the full-volume week Run15 exists to prevent, and the weights a
 * month-old load. The easing itself is unchanged.
 *
 * This module REPORTS. Home shows the sheets, and the plan changes only
 * when the person chooses it there or the race plan is rebuilt.
 */
import { weekScheduleFor } from "@/lib/trainingResolver";
import {
  absenceFromDays,
  runSessionDays,
  type DatedRun,
  type SportAbsence,
} from "./layoffDetection";
import {
  liftReturnFrom,
  liftSessionDays,
  type DatedWorkout,
  type LiftReturnAssessment,
} from "./liftLayoff";
import {
  runReturnFrom,
  type RunningPlan,
  type RunReturnAssessment,
} from "./runReturn";

export interface TrainingReturn {
  /** The weights: whether Home's Welcome back is offered, and its easing. */
  lift: LiftReturnAssessment;
  /** Running: whether Home's run return is offered, and what. */
  run: RunReturnAssessment;
}

/** A sport never trained, or not in the plan: not a return. */
const NOT_A_RETURN: SportAbsence = {
  lastDay: null,
  daysAway: null,
  layoff: "none",
};

/**
 * Whether the plan holds lifting: a lifting day in the person's week
 * (`weekScheduleFor`, the week Home and Train show). The lifting twin of
 * `runningPlan`: a plan with no lifting has no weights to ease back into.
 */
export function liftingPlan(
  profile: Parameters<typeof weekScheduleFor>[0]
): boolean {
  if (!profile) return false;
  return weekScheduleFor(profile).some(
    (day) => day.type === "lift" || day.type === "both"
  );
}

/**
 * The one return check. `runs` is null until they are read and confirmed
 * (`useTrainingReturn`), and the run side answers nothing until then.
 */
export function assessTrainingReturn(input: {
  workouts: readonly DatedWorkout[];
  runs: readonly DatedRun[] | null;
  todayKey: string;
  /** The plan holds lifting (`liftingPlan`). */
  lifting: boolean;
  /** The plan's running (`runningPlan`). */
  running: RunningPlan;
}): TrainingReturn {
  const { workouts, runs, todayKey, lifting, running } = input;
  const lift = lifting
    ? absenceFromDays(liftSessionDays(workouts), todayKey)
    : NOT_A_RETURN;
  const run =
    running === "none"
      ? NOT_A_RETURN
      : runs === null
        ? null
        : absenceFromDays(runSessionDays(runs), todayKey);
  return { lift: liftReturnFrom(lift), run: runReturnFrom(running, run) };
}
