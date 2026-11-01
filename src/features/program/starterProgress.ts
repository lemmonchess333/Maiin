import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "./programTypes";
import {
  clampStarterStage,
  runsInWeek,
  STARTER_RUNS_FOR_A_DONE_WEEK,
  STARTER_STAGES,
  starterWeekDone,
  weekKeyAfter,
} from "./starterPlan";

/** The starter goal's name, as Train, Home and setup say it. */
export const STARTER_GOAL_NAME = "30 minutes without stopping";

/** Where a running starter goal stands this week, as Train shows it. */
export interface StarterProgress {
  stage: number;
  /** "Week 3 of 9". */
  weekLabel: string;
  /** "about 7 weeks to go", or "the last week". The end moves when a
   *  week repeats, so it is said in weeks, never as a date. */
  toGoLabel: string;
  /** Saved runs in the plan's week so far, and how many make it done. */
  runsThisWeek: number;
  runsForTheWeek: number;
  /** The stage is last week's again: last week was not done. */
  repeated: boolean;
  /** The last stage's week is done: the goal is reached, though the
   *  rollover writes it as finished only once the week is over. */
  reached: boolean;
}

/**
 * A running starter's week: its stage, weeks to go, the runs saved in it,
 * whether it repeats last week's stage and whether it reaches the goal.
 * `runDays` are the days of the saved runs. Null for a plan that is not the
 * starter's.
 */
export function starterProgress(
  programState: Pick<ProgramState, "runPlan"> | null | undefined,
  starterGoal: UserProfile["starterGoal"],
  runDays: readonly string[]
): StarterProgress | null {
  const plan = programState?.runPlan;
  if (plan?.mode !== "starter" || !plan.stageWeekKey) return null;
  const stage = clampStarterStage(plan.stage ?? 1);
  const weekKey = plan.stageWeekKey;
  const weeksToGo = STARTER_STAGES - stage + 1;
  const lastWeek = weekKeyAfter(weekKey, -1);
  // A week repeats when the one before it was in the goal and not done.
  const goalLastWeek =
    !!starterGoal?.startedOn && starterGoal.startedOn < weekKey;
  return {
    stage,
    weekLabel: `Week ${stage} of ${STARTER_STAGES}`,
    toGoLabel:
      weeksToGo <= 1 ? "the last week" : `about ${weeksToGo} weeks to go`,
    runsThisWeek: runsInWeek(runDays, weekKey),
    runsForTheWeek: STARTER_RUNS_FOR_A_DONE_WEEK,
    repeated: goalLastWeek && !starterWeekDone(runDays, lastWeek),
    reached: stage >= STARTER_STAGES && starterWeekDone(runDays, weekKey),
  };
}

/**
 * Whether the starter goal has been reached and its Done is still to be
 * said: finished (the rollover has written it), or running with its last
 * week done. Nothing after a newer goal: a race goal set since takes over
 * Train and Home.
 */
export function starterGoalReached(
  profile: Pick<UserProfile, "runMode" | "starterGoal"> | null | undefined,
  programState: Pick<ProgramState, "runPlan"> | null | undefined,
  runDays: readonly string[]
): boolean {
  const goal = profile?.starterGoal;
  if (!goal) return false;
  if (goal.finishedOn) return profile?.runMode !== "race_prep";
  if (profile?.runMode !== "starter") return false;
  return !!starterProgress(programState, goal, runDays)?.reached;
}
