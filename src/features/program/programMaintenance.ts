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
/** The run plans this build makes (`race_prep`) or retires (`structured`).
 *  A plan of any other kind was written by a newer build (Run9's
 *  reopening adds one), and this build leaves it exactly as it is:
 *  rolling, refreshing or rebuilding it here would clear it, since every
 *  one of those paths reads a plan that is not a race as free running. */
const RUN_PLAN_MODES_THIS_BUILD_KNOWS: readonly string[] = [
  "race_prep",
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

export function weekRolloverAnchor(
  state: Pick<ProgramState, "runDays" | "liftWeekKey" | "runPlan">,
  profile: Pick<UserProfile, "runMode" | "raceGoal">
): { side: "run" | "lift"; weekKey: string } | null {
  const runWeek = state.runDays?.[0]?.weekKey;
  // The runs lead only for a race plan, the one plan this build rolls. A
  // run mode it does not know (a newer build's) is left to the lifts, so
  // its plan is never rolled into free running here.
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
