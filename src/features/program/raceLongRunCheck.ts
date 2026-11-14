/**
 * Run24 (11), deep dive D14: the weekly check of a race plan against the
 * long runs actually done.
 *
 * A runner who missed their long runs while doing most of their other runs
 * never tripped the fell-behind check, which counts runs, and their plan
 * quietly shrank its long runs, its taper, and then the race at five times
 * the month's longest run. This reads the race from the runs instead: the
 * farthest run of the last four weeks, built on by 2 km a week (the long
 * run's rungs, a Tropos heuristic) through the weeks left before the taper.
 * When the runner has fallen behind the long runs the plan put in their
 * week, and that reach is under half the race or under what the plan
 * itself builds to, whichever is shorter, Home opens the fell-behind sheet
 * in its race register, once a week, to say so and offer its choices.
 *
 * Measured against the plan as well as the race: a plan whose long run
 * peaks under half the race (a marathon at the long run's time ceiling for
 * a slow runner, or a short block) is everything its runner can be asked
 * to do, and no later date builds them further, so a runner who keeps up
 * with it never hears the check. Nor does anyone in the taper or race week,
 * when no week is left to build in.
 *
 * Pure and light: Home reads it on every visit, so it loads no scheduler.
 */
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { DatedRun } from "./layoffDetection";
import type { ProgramState, ScheduledRunDay } from "./programTypes";
import { DONE_RUNG_SHARE } from "./runningBaseline";
import { TAPER_WEEKS_BY_DISTANCE } from "./runPlanTiming";

/** The weeks of runs the reach is read from. */
const LOOKBACK_DAYS = 28;
/** How far a long run builds in a week, km: the plan's rungs. */
const KM_PER_WEEK = 2;
/** A plan's first weeks are its setup's to describe: the check starts once
 *  two of them are behind the runner. */
const FIRST_CHECKED_WEEK = 2;

const RACE_KM: Record<string, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.1,
  marathon: 42.2,
};

/**
 * The long run the plan put on a day, in km: its own rung, before the plan
 * fitted it to the running done (`trainingBasis`, which keeps that rung),
 * and after the runner's own time limit fitted it (`timeLimit`), whose rung
 * the plan then builds on. 0 for a day without one. A swap the runner made
 * (`userOverride`) is theirs, not the plan's.
 */
export function plannedLongRunKm(
  day: Pick<ScheduledRunDay, "templateId" | "trainingBasis">
): number {
  const id = day.trainingBasis?.originalTemplateId ?? day.templateId;
  const template = RUN_TEMPLATES.find((t) => t.id === id);
  return template?.type === "long"
    ? (template.config?.targetDistanceKm ?? 0)
    : 0;
}

/** The longest of the plan's long runs over its weeks (`plannedLongRunKm`),
 *  0 when they hold none: what the plan builds to. */
export function peakPlannedLongRunKm(
  weeks: readonly (readonly ScheduledRunDay[])[]
): number {
  let peak = 0;
  for (const week of weeks)
    for (const day of week) peak = Math.max(peak, plannedLongRunKm(day));
  return peak;
}

export interface RaceLongRunCheck {
  /** The farthest run of the last four weeks, km. */
  longestKm: number;
  /** What it builds to before the taper at `KM_PER_WEEK`, km. */
  reachKm: number;
  raceKm: number;
  /** The week the check is for: its dismissal key. */
  weekKey: string;
}

/** The check's answer for a week, set aside on Home's sheet or the weekly
 *  review (`useDismissOnce`), so neither asks again that week. */
export function raceCheckDismissKey(weekKey: string | null): string {
  return `tropos-race-check:${weekKey ?? "none"}`;
}

/**
 * The check for this week, when the runner has fallen behind the plan's
 * long runs and their running can't reach, before the taper, half the race
 * or what the plan builds to, whichever is shorter; null otherwise, and
 * whenever it is not the check's to say: no race plan, a plan in its first
 * two weeks, its taper, race week or recovery, a week with no long run in
 * the plan, a plan stored before it carried its peak (until its next
 * build), runs not yet read, or no run in four weeks, which is the run
 * return's to greet.
 */
export function raceLongRunCheck(input: {
  profile: Pick<UserProfile, "runMode" | "raceGoal"> | null | undefined;
  programState: ProgramState | null | undefined;
  recentRuns: readonly DatedRun[] | null | undefined;
  /** Local "YYYY-MM-DD". */
  today: string;
}): RaceLongRunCheck | null {
  const { profile, programState, recentRuns, today } = input;
  const goal = profile?.raceGoal;
  if (profile?.runMode !== "race_prep" || !goal || !recentRuns) return null;
  const raceKm = RACE_KM[goal.distance];
  const taperWeeks =
    TAPER_WEEKS_BY_DISTANCE[
      goal.distance as keyof typeof TAPER_WEEKS_BY_DISTANCE
    ];
  if (!raceKm || taperWeeks === undefined) return null;
  const plan = resolveRunPlan(profile, programState, today);
  if (plan.isElapsed || plan.inRecovery) return null;
  const runPlan = programState?.runPlan;
  const currentWeek = runPlan?.currentWeek;
  if (typeof currentWeek !== "number" || currentWeek < FIRST_CHECKED_WEEK)
    return null;

  // The taper and race week: the race is days off, and nothing a later
  // week builds is left to change.
  const weekKey = localWeekKey(parseLocalDate(today));
  const raceWeek = localWeekKey(parseLocalDate(goal.targetDate));
  const weeksToRace = wholeWeeksBetween(weekKey, raceWeek);
  const buildWeeks = weeksToRace - taperWeeks;
  if (buildWeeks <= 0) return null;

  // What the plan asks of the long run: this week's, and its peak.
  const plannedKm = Math.max(
    0,
    ...(programState?.runDays ?? [])
      .filter(
        (day) =>
          (day.date ? localWeekKey(parseLocalDate(day.date)) : day.weekKey) ===
          weekKey
      )
      .map(plannedLongRunKm)
  );
  const peakKm = runPlan?.peakLongRunKm;
  if (plannedKm <= 0 || typeof peakKm !== "number") return null;

  const from = localDateString(
    addLocalDays(parseLocalDate(today), -LOOKBACK_DAYS)
  );
  let longestKm = 0;
  let ran = false;
  for (const run of recentRuns) {
    if (!run.date || run.date < from || run.date > today) continue;
    if (!isVolumeEligible(run)) continue;
    ran = true;
    longestKm = Math.max(longestKm, (run.distance ?? 0) / 1000);
  }
  if (!ran) return null;

  // Kept up with the plan: a long run of the rung under this week's, the
  // one it climbs from, run to `DONE_RUNG_SHARE` of it.
  if (longestKm >= (plannedKm - KM_PER_WEEK) * DONE_RUNG_SHARE) return null;
  const reachKm = longestKm + KM_PER_WEEK * buildWeeks;
  if (reachKm >= Math.min(raceKm / 2, peakKm)) return null;
  return {
    longestKm: Math.round(longestKm * 10) / 10,
    reachKm: Math.round(reachKm),
    raceKm,
    weekKey,
  };
}
