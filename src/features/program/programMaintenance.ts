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

/** The run plans this build makes (`race_prep`, `starter`) or retires
 *  (`structured`). A plan of any other kind was written by a newer build,
 *  and this build leaves it exactly as it is: rolling, refreshing or
 *  rebuilding it here would clear it, since every one of those paths reads
 *  a plan it does not know as free running. */
const RUN_PLAN_MODES_THIS_BUILD_KNOWS: readonly string[] = [
  "race_prep",
  "starter",
  "structured",
];

export function isRunPlanFromNewerBuild(runPlan: unknown): boolean {
  const mode =
    runPlan && typeof runPlan === "object"
      ? (runPlan as { mode?: unknown }).mode
      : undefined;
  return (
    typeof mode === "string" && !RUN_PLAN_MODES_THIS_BUILD_KNOWS.includes(mode)
  );
}

/** Whether the plan is the starter goal's, for a profile still on it. */
export function isStarterPlanRunning(
  state: Pick<ProgramState, "runPlan">,
  profile: Pick<UserProfile, "runMode">
): boolean {
  return profile.runMode === "starter" && state.runPlan?.mode === "starter";
}

/**
 * The week a plan's runs are in: its run days' week, or a starter plan's
 * own week, which it keeps when the schedule gives it no run day.
 */
export function runWeekKeyOf(
  state: Pick<ProgramState, "runDays" | "runPlan">
): string | undefined {
  if (state.runPlan?.mode === "starter" && state.runPlan.stageWeekKey)
    return state.runPlan.stageWeekKey;
  return state.runDays?.[0]?.weekKey;
}

/**
 * The week the calendar rollover moves the plan on from. A race plan with
 * run days, and a starter plan, roll over from their runs' week (runs are
 * pinned to dates, ADR-0002, and the lifts move with them); any other plan
 * from the lifts' own. So does a race plan with nothing left to plan after
 * its race (`raceAwaitsItsEnding` on the week after its runs'), whose run
 * days stay where they are. A run mode this build does not know (a newer
 * build's) is left to the lifts, so its plan is never rolled into free
 * running here.
 */
export function weekRolloverAnchor(
  state: Pick<ProgramState, "runDays" | "liftWeekKey" | "runPlan">,
  profile: Pick<UserProfile, "runMode" | "raceGoal">
): { side: "run" | "lift"; weekKey: string } | null {
  const runWeek = runWeekKeyOf(state);
  if (isStarterPlanRunning(state, profile) && runWeek)
    return { side: "run", weekKey: runWeek };
  if (
    profile.runMode === "race_prep" &&
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
 * recovery is not running. Earlier weeks are the rollover's. A week that
 * holds no runs at all is built too: a plan saved after its week's last run
 * day, before such a plan started on next week's runs (Run19), was saved
 * with one, and the rollover, which moves a race plan on from its runs'
 * week (`weekRolloverAnchor`), has nothing to move on from there.
 */
/**
 * Whether loading the plan has to build a starter week: a profile on the
 * starter goal whose plan is not yet the starter's, as when the goal has
 * just begun. A starter plan's later weeks are the rollover's.
 */
export function starterWeekNeedsBuilding(
  state: Pick<ProgramState, "runPlan">,
  profile: Pick<UserProfile, "runMode">
): boolean {
  return profile.runMode === "starter" && state.runPlan?.mode !== "starter";
}

export function raceWeekNeedsBuilding(
  state: Pick<ProgramState, "runDays" | "runPlan">,
  profile: UserProfile,
  today: string
): boolean {
  if (profile.runMode !== "race_prep" || !profile.raceGoal) return false;
  if (!state.runDays) return true;
  const raceAhead =
    raceIsInFuture(profile.raceGoal, today) &&
    !isInRecoveryOn(state.runPlan, today);
  // A recovery phase is the server's to end (`dailyRaceReconciliationSweep`),
  // however far past its end date, and a rebuild here would drop it.
  if (
    raceAhead &&
    state.runDays.length === 0 &&
    state.runPlan?.phase !== "recovery"
  )
    return true;
  return (
    raceAhead &&
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
