/**
 * Building and saving a person's lift plan from their setup, as the lift
 * plan editor's Save changes does and as Train's "Rebuild for 45 min" does
 * (slice 4 of `docs/training-deep-dive-2026-11/build-plan.md`). One place
 * assembles the builder's input from the stored profile, so the two never
 * build a plan from different readings of the same setup.
 */

import { rollingGoalOf } from "./programMaintenance";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import {
  describeRejection,
  isRateLimitedRejection,
  PLAN_SAVES_TOO_OFTEN,
} from "@/lib/callableErrors";
import type { UserProfile } from "@/lib/auth";
import { getNutritionPhase } from "@/lib/nutritionPhase";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import { toExperience } from "./experienceModel";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import { profileNewRunnerUntil } from "./newRunner";
import { buildPlan, type PlanBuilderInput } from "./planBuilder";
import type {
  Equipment,
  Experience,
  Goal,
  PrimaryGoal,
  ProgramState,
  RaceDistance,
} from "./programTypes";
import { runTuningFromProfile } from "./runScheduler";
import { sessionLengthOption } from "./sessionFit";

/** The split choices a stored profile may hold. The split is derived from
 *  the lift days (Pgm5 Q1); the list only normalises a legacy value, such
 *  as "bro_split", before it is threaded inertly through the builder. */
export const VALID_SPLIT_CHOICES = [
  "auto",
  "full_body",
  "upper_lower",
  "ppl",
] as const;
export type SplitChoice = (typeof VALID_SPLIT_CHOICES)[number];

/** A lift plan's setup as the profile stores it. */
export interface SavedLiftPlan {
  primaryGoal: PrimaryGoal;
  nutritionPhase: Goal;
  experience: Experience;
  liftDays: number;
  sessionMinutes: number;
  preferredSplit: SplitChoice;
  equipment: Equipment;
  barbellAtHome: boolean;
  injuries: string[];
  runMode: NonNullable<UserProfile["runMode"]>;
  weeklyRunDays: number;
  raceDistance: RaceDistance;
  raceTargetDate: string;
  raceEventName?: string;
  runVolume: ReturnType<typeof runTuningFromProfile>["volume"];
  runDifficulty: ReturnType<typeof runTuningFromProfile>["difficulty"];
}

export function savedLiftPlan(profile: UserProfile): SavedLiftPlan {
  return {
    primaryGoal: (profile.primaryGoal as PrimaryGoal) ?? "hypertrophy",
    nutritionPhase: getNutritionPhase(profile),
    experience: toExperience(profile.experience),
    liftDays: profile.weeklyWorkoutsTarget ?? 4,
    // Lift4 (5): how long a session is; the plan is fitted to it.
    sessionMinutes: sessionLengthOption(profile.liftTimeBudgetMinutes),
    preferredSplit: (VALID_SPLIT_CHOICES as readonly string[]).includes(
      profile.preferredSplit ?? ""
    )
      ? (profile.preferredSplit as SplitChoice)
      : "auto",
    equipment: (profile.equipment as Equipment) ?? "full_gym",
    // Lift4 (11): "what do you have?" beside a home gym's kit.
    barbellAtHome: profile.barbellAtHome === true,
    injuries: profile.injuries ?? [],
    runMode: profile.runMode ?? "freeform",
    weeklyRunDays: getWeeklyRunTarget(profile) || 2,
    raceDistance: (profile.raceGoal?.distance as RaceDistance) ?? "10k",
    raceTargetDate: profile.raceGoal?.targetDate ?? "",
    // Optional event name, carried through the rebuild so a lifting-only
    // edit (configurePlan) can never wipe it off the stored raceGoal.
    raceEventName: profile.raceGoal?.eventName,
    // Pgm6 knobs: missing means standard, the engine's own lazy default.
    runVolume: runTuningFromProfile(profile).volume,
    runDifficulty: runTuningFromProfile(profile).difficulty,
  };
}

/** What the lift plan editor lets a person change before a save. */
export type LiftPlanDraft = Pick<
  SavedLiftPlan,
  | "primaryGoal"
  | "experience"
  | "liftDays"
  | "sessionMinutes"
  | "equipment"
  | "barbellAtHome"
  | "injuries"
>;

/**
 * The builder's input for a save of someone's own plan: the draft over the
 * saved setup, the run plan threaded through from the saved values (D14:
 * lifting edits never disturb it), and the week kept.
 *
 * `rebuildLiftDays` builds the lift days again from the setup even when
 * their number has not changed, keeping each lift's weight where the new
 * day holds it (slice 4). Without it, a save that keeps the number of days
 * keeps the days, as Pgm5 (Q3) decided.
 */
export function liftPlanInput({
  profile,
  programState,
  saved,
  draft,
  recentLayoff,
  recentRuns,
  rebuildLiftDays = false,
}: {
  profile: UserProfile;
  programState: ProgramState | null;
  saved: SavedLiftPlan;
  draft: LiftPlanDraft;
  recentLayoff: LayoffClass;
  recentRuns: readonly DatedRun[] | null;
  rebuildLiftDays?: boolean;
}): PlanBuilderInput {
  // Free running has no run days, unless it holds a plan with no race date
  // (Run24 (3)), which buildPlan keeps through a lifting save.
  const effectiveRunDays =
    saved.runMode === "freeform" && !rollingGoalOf(programState, profile)
      ? 0
      : saved.weeklyRunDays;
  return {
    // Blk2 / H2: the STANDING focus, never a block's; `buildPlan` pins
    // `programState.primaryGoal` from a carried block itself.
    primaryGoal: draft.primaryGoal,
    nutritionPhase: saved.nutritionPhase,
    experience: draft.experience,
    // A save of someone's own plan: the experience gate leaves its
    // exercises alone, and a level change keeps the week (Lift4).
    previousExperience: saved.experience,
    // D-LIFT-5: bodyweight-relative first loads on a rebuild.
    bodyweightKg: profile.weightKg,
    sex: profile.sex,
    liftDays: draft.liftDays,
    // Lift4 (5): a new plan is fitted to the session length; a changed one
    // re-fits the plan the person has, sets only.
    sessionMinutes: draft.sessionMinutes,
    previousSessionMinutes: saved.sessionMinutes,
    // Pgm5 (Q1): the split is not chosen here; the stored value is threaded
    // inertly so the profile updates stay consistent.
    preferredSplit:
      saved.preferredSplit === "auto" ? "full_body" : saved.preferredSplit,
    runMode: saved.runMode,
    weeklyRunDays: effectiveRunDays,
    runTuning: { volume: saved.runVolume, difficulty: saved.runDifficulty },
    // Run17: the long-run ceiling is measured at the confirmed easy pace.
    runFitness: profile.runFitness ?? null,
    runningBaseline: profile.runningBaseline ?? null,
    runTimeLimits: profile.runTimeLimits ?? null,
    recentLayoff,
    recentRuns,
    newRunnerUntil: profileNewRunnerUntil(profile),
    weekSchedule: profile.weekSchedule,
    ...(saved.runMode === "race_prep" && saved.raceTargetDate
      ? {
          raceGoal: {
            distance: saved.raceDistance,
            targetDate: saved.raceTargetDate,
            ...(saved.raceEventName ? { eventName: saved.raceEventName } : {}),
          },
        }
      : {}),
    equipment: draft.equipment,
    barbellAtHome: draft.barbellAtHome,
    injuries: draft.injuries,
    currentDate: localDateString(new Date()),
    existingState: programState ?? undefined,
    preserveHistory: true,
    ...(rebuildLiftDays ? { rebuildLiftDays: true } : {}),
  } as PlanBuilderInput;
}

/**
 * Saves a built plan through the `configurePlan` callable, against the
 * programme and profile it was built on, so a change made elsewhere in
 * between is refused rather than overwritten.
 */
export async function configureLiftPlan(
  plan: ReturnType<typeof buildPlan>,
  profile: UserProfile,
  programState: ProgramState | null
): Promise<void> {
  // A lift plan save never changes the race. configurePlan stores the goal
  // it is sent whole, so it gets the stored one, with the race link and goal
  // time buildPlan does not carry.
  if (plan.profileUpdates.raceGoal && profile.raceGoal) {
    plan.profileUpdates.raceGoal = profile.raceGoal;
  }
  const configurePlan = httpsCallable(functions, "configurePlan");
  await configurePlan({
    baseProgramState: programState ?? null,
    baseProfile: Object.fromEntries(
      Object.keys(plan.profileUpdates)
        .filter(
          (key) =>
            (profile as unknown as Record<string, unknown>)[key] !== undefined
        )
        .map((key) => [
          key,
          (profile as unknown as Record<string, unknown>)[key],
        ])
    ),
    profileUpdates: plan.profileUpdates,
    programState: plan.programState,
    weekSchedule: plan.weekSchedule,
  });
}

/**
 * Train's "Rebuild for N min" (slice 4): the lift days built again from the
 * saved setup to fit `length`, the session length the plan is fitted to,
 * and saved. The week, its done days and the history stay; each lift keeps
 * its weight where a new day holds it. `length` is the one the notice
 * names, so the button builds what it says.
 */
export async function rebuildLiftDaysFor(
  length: number,
  {
    profile,
    programState,
    recentLayoff,
    recentRuns,
  }: {
    profile: UserProfile;
    programState: ProgramState;
    recentLayoff: LayoffClass;
    recentRuns: readonly DatedRun[] | null;
  }
): Promise<void> {
  const saved = savedLiftPlan(profile);
  const plan = buildPlan(
    liftPlanInput({
      profile,
      programState,
      saved,
      draft: { ...saved, sessionMinutes: length },
      recentLayoff,
      recentRuns,
      rebuildLiftDays: true,
    })
  );
  await configureLiftPlan(plan, profile, programState);
}

/**
 * What a refused plan save says, for the lift plan editor and Train's
 * rebuild alike. A plan changed elsewhere since it was read (`refresh`)
 * reloads the profile first; the server's own sentence wins when it wrote
 * one, else `changed`, the caller's words for that case.
 */
export function planSaveRejection(
  err: unknown,
  changed: string
): { message: string; refresh: boolean } {
  const code = (err as { code?: string } | null)?.code;
  if (code === "functions/unauthenticated" || code === "unauthenticated") {
    return { message: "Sign in again to update your plan.", refresh: false };
  }
  if (code?.endsWith("failed-precondition")) {
    return { message: describeRejection(err) ?? changed, refresh: true };
  }
  if (code === "functions/invalid-argument" || code === "invalid-argument") {
    return {
      message: "Plan didn’t validate. Try a different combination.",
      refresh: false,
    };
  }
  if (isRateLimitedRejection(err)) {
    return { message: PLAN_SAVES_TOO_OFTEN, refresh: false };
  }
  return { message: "Couldn’t save your plan. Try again.", refresh: false };
}
