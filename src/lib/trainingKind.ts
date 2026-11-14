/**
 * What a person trains, lifts, runs or both, read from the live plan (App1
 * Q23; the Train grill's Q30 named it).
 *
 * Setup asks "Lifting, Running or Both" and keeps the answer as
 * `athleteType`, which nothing after setup changes: a runner who added lift
 * days stayed a "Runner", and a lifter who started a race plan stayed a
 * "Lifter". The plan is what changes, so the app reads the plan:
 *
 *   lifts  the programme's lift sessions once it has loaded, and the week's
 *          layout (`weekScheduleFor`) until then
 *   runs   a run plan: a race plan in any week of it (a week with no runs,
 *          the taper, the recovery after race day), the starter goal, the
 *          retired structured mode, or run days on the plan or in the
 *          week's layout. A goal that ends leaves its run days in the
 *          layout, so someone between plans still runs.
 *          Or free running, which puts no day on the plan: a plan with no
 *          lifts in it (someone who runs only), a weekly running goal
 *          (`nonRaceGoal`), a starter goal kept from before, or a running
 *          level other than none. Free running beside lifts leaves nothing
 *          else on the plan to say it, so the running level
 *          (`runFrequency`, which the plan's running is built from) does.
 *
 * Cold start: an account with no plan yet reads the setup answer until the
 * plan exists. That is an account that has not finished setup, since setup
 * writes the profile and the plan together.
 *
 * The setup answer is otherwise kept for the first-week numbers only
 * (`setupSport`), as the server's `onboardingSport` stamp is.
 */
import type { UserProfile } from "./auth";
import type { ProgramState } from "@/features/program/programTypes";
import { isNonRaceGoal } from "./nonRaceGoal";
import { isValidWeekSchedule } from "./scheduleUtils";
import { weekScheduleFor } from "./trainingResolver";

export interface TrainingKind {
  /** Lift days on the plan. */
  lifts: boolean;
  /** Running on the plan: a run plan, or free running. */
  runs: boolean;
}

/** The profile's plan fields, and the setup answer for a cold start. */
export type TrainingKindProfile = Partial<
  Pick<
    UserProfile,
    | "athleteType"
    | "weekSchedule"
    | "weeklyWorkoutsTarget"
    | "weeklyRunDaysTarget"
    | "weeklyRunsTarget"
    | "runMode"
    | "runFrequency"
    | "nonRaceGoal"
    | "starterGoal"
  >
>;

export type TrainingKindPlan = Partial<
  Pick<ProgramState, "workouts" | "runDays">
>;

/** The run modes that are a run plan, whichever week it is in. */
const RUN_PLAN_MODES: ReadonlySet<string> = new Set([
  "race_prep",
  "starter",
  "structured",
]);

/**
 * What the plan trains. With no profile, nothing is known yet, and both are
 * false; otherwise at least one is true.
 */
export function trainingKind(
  profile: TrainingKindProfile | null | undefined,
  programState: TrainingKindPlan | null | undefined
): TrainingKind {
  if (!profile) return { lifts: false, runs: false };
  if (
    !programState &&
    !isValidWeekSchedule(profile.weekSchedule) &&
    profile.runMode === undefined
  )
    return fromSetup(setupSport(profile));

  const layout = weekScheduleFor(profile);
  const lifts = programState
    ? (programState.workouts?.length ?? 0) > 0
    : layout.some((day) => day.type === "lift" || day.type === "both");
  const runPlan =
    RUN_PLAN_MODES.has(profile.runMode ?? "") ||
    (programState?.runDays?.length ?? 0) > 0 ||
    layout.some((day) => day.type === "run" || day.type === "both");
  const freeRunning =
    !lifts ||
    isNonRaceGoal(profile.nonRaceGoal) ||
    !!profile.starterGoal ||
    (!!profile.runFrequency && profile.runFrequency !== "none");
  return { lifts, runs: runPlan || freeRunning };
}

/** Setup's answer, Lifting, Running or Both, in the first-week numbers'
 *  words. */
export type SetupSport = "lifter" | "runner" | "hybrid";

/**
 * The setup answer as setup stored it (`athleteType`). Read for the
 * first-week numbers, and for an account with no plan yet; anything about
 * what a person trains now reads `trainingKind`.
 */
export function setupSport(
  profile: Pick<TrainingKindProfile, "athleteType"> | null | undefined
): SetupSport {
  switch (profile?.athleteType) {
    case "Runner":
      return "runner";
    case "Hybrid":
      return "hybrid";
    default:
      return "lifter";
  }
}

function fromSetup(sport: SetupSport): TrainingKind {
  return { lifts: sport !== "runner", runs: sport !== "lifter" };
}
