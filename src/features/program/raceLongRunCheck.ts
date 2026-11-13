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
 * When that reach is under half the race, Home opens the fell-behind sheet
 * in its race register, once a week, to say so and offer its choices.
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
import type { DatedRun } from "./layoffDetection";
import type { ProgramState } from "./programTypes";
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

export interface RaceLongRunCheck {
  /** The farthest run of the last four weeks, km. */
  longestKm: number;
  /** What it builds to before the taper at `KM_PER_WEEK`, km. */
  reachKm: number;
  raceKm: number;
  /** The week the check is for: its dismissal key. */
  weekKey: string;
}

/**
 * The check for this week, when the race is past twice what the runner's
 * running can reach before the taper; null otherwise, and whenever it is not
 * the check's to say: no race plan, a plan in its first two weeks or its
 * recovery, runs not yet read, or no run in four weeks, which is the run
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
  const currentWeek = programState?.runPlan?.currentWeek;
  if (typeof currentWeek !== "number" || currentWeek < FIRST_CHECKED_WEEK)
    return null;

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

  const weekKey = localWeekKey(parseLocalDate(today));
  const raceWeek = localWeekKey(parseLocalDate(goal.targetDate));
  const weeksToRace = wholeWeeksBetween(weekKey, raceWeek);
  const buildWeeks = Math.max(0, weeksToRace - taperWeeks);
  const reachKm = longestKm + KM_PER_WEEK * buildWeeks;
  if (reachKm >= raceKm / 2) return null;
  return {
    longestKm: Math.round(longestKm * 10) / 10,
    reachKm: Math.round(reachKm),
    raceKm,
    weekKey,
  };
}
