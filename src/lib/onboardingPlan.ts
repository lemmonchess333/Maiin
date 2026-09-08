import { buildPlan } from "@/features/program/planBuilder";
import { PROGRAM_TEMPLATES } from "@/features/program/templates";
import {
  matchTemplate,
  applyInjuryFilters,
} from "@/features/program/matchTemplate";
import { templateToProgramState } from "@/features/program/templateConversion";
import type { Goal, ProgramState } from "@/features/program/programTypes";
import type { OnboardingDraft, OnboardingActivity } from "./onboardingDraft";
import { resolveOnboardingRunMode } from "./onboardingRunMode";

/** The review and the commit consume this SAME result, including template selection. */
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
  >,
  nutritionPhase: Goal,
  currentDate: string
) {
  const runMode = resolveOnboardingRunMode({
    runFrequency: draft.runFrequency,
    runMode: draft.runMode,
    hasRaceDate: Boolean(
      draft.raceTargetDate && draft.raceTargetDate >= currentDate
    ),
  });
  const weeklyRunDays = runMode === "freeform" ? 0 : draft.weeklyRunDays;
  const match = matchTemplate(
    {
      daysPerWeek: draft.daysPerWeek,
      equipment: draft.equipment,
      gender: draft.gender,
      preferredSplit: "auto",
      primaryGoal: draft.primaryGoal,
      experience: draft.experience,
      runFrequency: draft.runFrequency,
      injuries: draft.injuries,
    } as Parameters<typeof matchTemplate>[0],
    PROGRAM_TEMPLATES
  );
  let existingState: ProgramState | undefined;
  if (draft.daysPerWeek > 0 && match.isGoalMatch) {
    const template = applyInjuryFilters(
      match.template,
      draft.injuries,
      PROGRAM_TEMPLATES
    );
    existingState = templateToProgramState(template, nutritionPhase);
    existingState.primaryGoal = draft.primaryGoal;
    existingState.templateId = template.id;
  }
  const plan = buildPlan({
    primaryGoal: draft.primaryGoal,
    nutritionPhase,
    experience: draft.experience,
    bodyweightKg: draft.weightKg,
    sex: draft.gender === "female" ? "female" : "male",
    liftDays: draft.daysPerWeek,
    preferredSplit: "auto",
    runMode,
    weeklyRunDays,
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
    existingState,
    preserveHistory: false,
  });
  if (existingState?.templateId)
    plan.programState.templateId = existingState.templateId;
  return plan;
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
