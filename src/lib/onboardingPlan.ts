import type { RunTimeLimits } from "@/features/program/runTimeLimits";
import type { RunFitnessInput } from "./runPaces";
import { buildPlan } from "@/features/program/planBuilder";
import type { Goal } from "@/features/program/programTypes";
import type { OnboardingDraft, OnboardingActivity } from "./onboardingDraft";
import { resolveOnboardingRunMode } from "./onboardingRunMode";
import { MIN_RACE_RUN_DAYS } from "./raceGoalPlanner";

/**
 * The review and the commit consume this SAME result. Every new plan comes
 * from the one generator (Lift4 (5)); the hand-written templates, the
 * once-a-week Bro Split among them, no longer start plans, and plans they
 * started stay as they are.
 */
export function buildOnboardingPlan(
  draft: Pick<
    OnboardingDraft,
    | "primaryGoal"
    | "daysPerWeek"
    | "equipment"
    | "gender"
    | "experience"
    | "runFrequency"
    | "runMode"
    | "weeklyRunDays"
    | "raceDistance"
    | "raceTargetDate"
    | "injuries"
    | "weightKg"
    | "sessionMinutes"
    | "barbellAtHome"
    | "smallPlates"
    | "raceLegTrim"
  >,
  nutritionPhase: Goal,
  currentDate: string,
  runningPreferences?: {
    runningBaseline?:
      | import("@/features/program/runningBaseline").RunningBaseline
      | null;
    runTimeLimits?: RunTimeLimits | null;
    runFitness?: RunFitnessInput | null;
  }
) {
  const runMode = resolveOnboardingRunMode({
    runFrequency: draft.runFrequency,
    runMode: draft.runMode,
    hasRaceDate: Boolean(
      draft.raceTargetDate && draft.raceTargetDate >= currentDate
    ),
  });
  // A race plan needs at least two run days a week (Pgm7 A7).
  const weeklyRunDays =
    runMode === "freeform"
      ? 0
      : Math.max(MIN_RACE_RUN_DAYS, draft.weeklyRunDays);
  return buildPlan({
    primaryGoal: draft.primaryGoal,
    nutritionPhase,
    experience: draft.experience,
    bodyweightKg: draft.weightKg,
    sex: draft.gender === "female" ? "female" : "male",
    liftDays: draft.daysPerWeek,
    sessionMinutes: draft.sessionMinutes,
    barbellAtHome: draft.barbellAtHome,
    smallPlates: draft.smallPlates,
    // Lift4 (10): asked with a race, of someone who lifts; yes unless
    // answered for Support my running, no unless answered otherwise.
    ...(runMode === "race_prep" && draft.daysPerWeek > 0
      ? {
          raceLegTrim: draft.raceLegTrim ?? draft.primaryGoal === "running",
        }
      : {}),
    preferredSplit: "auto",
    runMode,
    weeklyRunDays,
    runningBaseline: runningPreferences?.runningBaseline,
    runTimeLimits: runningPreferences?.runTimeLimits,
    runFitness: runningPreferences?.runFitness,
    ...(runMode === "race_prep"
      ? {
          raceGoal: {
            distance: draft.raceDistance,
            targetDate: draft.raceTargetDate,
          },
        }
      : {}),
    equipment: draft.equipment,
    injuries: draft.injuries,
    currentDate,
    preserveHistory: false,
  });
}

/** Additive draft metadata: older drafts keep the week they already chose. */
export function onboardingActivity(
  draft: OnboardingDraft | null
): OnboardingActivity {
  if (draft?.trainingActivity) return draft.trainingActivity;
  if (draft?.daysPerWeek === 0) return "running";
  if (draft && draft.runFrequency !== "none") return "both";
  return "lifting";
}

/** Stored IDs stay stable even when irrelevant lifting/running chapters are omitted. */
export function onboardingFlow(activity: OnboardingActivity): number[] {
  return [
    0,
    1,
    ...(activity !== "lifting" ? [3] : []),
    ...(activity !== "running" ? [2, 4] : []),
    5,
    7,
  ];
}
