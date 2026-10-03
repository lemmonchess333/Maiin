import type { UserProfile } from "@/lib/auth";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
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
 * The week the calendar rollover moves the plan on from. A plan with run
 * days rolls over from its runs' week (runs are pinned to dates, ADR-0002,
 * and the lifts move with them); a plan without, from the lifts' own.
 */
export function weekRolloverAnchor(
  state: Pick<ProgramState, "runDays" | "liftWeekKey">,
  profile: Pick<UserProfile, "runMode">
): { side: "run" | "lift"; weekKey: string } | null {
  const runWeek = state.runDays?.[0]?.weekKey;
  if (profile.runMode && profile.runMode !== "freeform" && runWeek)
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
