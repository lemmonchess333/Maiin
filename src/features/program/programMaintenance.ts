import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import type { ProgramState } from "./programTypes";
import { areRaceRunDaysStale, raceIsInFuture } from "./raceRunDaysReconcile";

/**
 * The upkeep the programme engine does by itself, asked as questions of a
 * stored plan. The engine (`useProgram`) acts on the answers; Home's
 * snapshot (`homeProgramSnapshot`) asks the same questions to decide
 * whether to load the engine at all. Home used to ask its own copies, so a
 * change to when the engine acts could leave Home showing a plan the
 * engine would have rolled over.
 */

/**
 * Whether a race plan is past its race and not in recovery on `dateKey`,
 * with nothing left to plan. Ending race prep is the race lifecycle's
 * (PR-J): the server's daily sweep marks a no-show, exits recovery and
 * returns the person to free running, and recovery starts when the race is
 * logged, late or not. Each reads the stored plan, and all but the
 * recovery exit its race day, so the plan and its last run days stay as
 * they are until then, on their own dates (ADR-0002); dropping them left
 * the person in race prep for a race that was over.
 */
export function raceAwaitsItsEnding(
  runPlan: ProgramState["runPlan"],
  profile: Pick<UserProfile, "runMode" | "raceGoal">,
  dateKey: string
): boolean {
  return (
    profile.runMode === "race_prep" &&
    !!profile.raceGoal &&
    !!runPlan &&
    dateKey > profile.raceGoal.targetDate &&
    !isInRecoveryOn(runPlan, dateKey)
  );
}

/**
 * The week the calendar rollover moves the plan on from. A plan with run
 * days rolls over from its runs' week (runs are pinned to dates, ADR-0002,
 * and the lifts move with them); a plan without, from the lifts' own. So
 * does a race plan with nothing left to plan after its race
 * (`raceAwaitsItsEnding` on the week after its runs'), whose run days stay
 * where they are.
 */
export function weekRolloverAnchor(
  state: Pick<ProgramState, "runDays" | "liftWeekKey" | "runPlan">,
  profile: Pick<UserProfile, "runMode" | "raceGoal">
): { side: "run" | "lift"; weekKey: string } | null {
  const runWeek = state.runDays?.[0]?.weekKey;
  if (
    profile.runMode &&
    profile.runMode !== "freeform" &&
    runWeek &&
    !raceAwaitsItsEnding(
      state.runPlan,
      profile,
      localDateString(addLocalDays(parseLocalDate(runWeek), 7))
    )
  )
    return { side: "run", weekKey: runWeek };
  return state.liftWeekKey
    ? { side: "lift", weekKey: state.liftWeekKey }
    : null;
}

/**
 * Whether loading the plan has to build this week's race runs: a race plan
 * with no run days yet, or this week's runs no longer matching the race
 * (its goal or the schedule changed elsewhere) while the race is ahead and
 * recovery is not running. Earlier weeks are the rollover's.
 */
export function raceWeekNeedsBuilding(
  state: Pick<ProgramState, "runDays" | "runPlan">,
  profile: UserProfile,
  today: string
): boolean {
  if (profile.runMode !== "race_prep" || !profile.raceGoal) return false;
  if (!state.runDays) return true;
  return (
    raceIsInFuture(profile.raceGoal, today) &&
    !isInRecoveryOn(state.runPlan, today) &&
    state.runDays[0]?.weekKey === localWeekKey(parseLocalDate(today)) &&
    areRaceRunDaysStale({
      runDays: state.runDays,
      raceGoal: profile.raceGoal,
      weekSchedule: profile.weekSchedule ?? [],
      weeklyRunDays: getWeeklyRunTarget(profile) || 3,
      todayKey: today,
    })
  );
}
