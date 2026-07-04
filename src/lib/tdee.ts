/**
 * TDEE Calculator using Mifflin-St Jeor equation (more accurate than Harris-Benedict).
 * Provides macro recommendations based on fitness goal.
 */

import {
  GOAL_PROTEIN,
  GOAL_CALORIE_OFFSET,
  DEFAULT_PROTEIN_MULTIPLIER,
  FAT_CALORIE_FRACTION,
  floorTargetCalories,
} from "./macroConstants";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type FitnessGoal = "cut" | "recomp" | "lean bulk";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (desk job)",
  light: "Light (1-3 days/week)",
  moderate: "Moderate (3-5 days/week)",
  active: "Active (6-7 days/week)",
  very_active: "Very Active (athlete)",
};

export interface TDEEResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  deficit: number;
}

/**
 * Calculate BMR using Mifflin-St Jeor equation.
 * Male:   10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
 * Female: 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161
 */
export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel,
  goal: FitnessGoal,
  sex: "male" | "female" = "male",
  /**
   * Tier 2 — explicit per-day calorie offset from a user-chosen goal-weight
   * rate. When provided, it overrides the per-goal default band
   * (`GOAL_CALORIE_OFFSET[goal]`). Omitted → legacy behaviour, so all
   * existing call sites are unchanged.
   */
  explicitOffset?: number
): TDEEResult {
  const sexOffset = sex === "female" ? -161 : 5;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);

  // Goal-based adjustment: explicit rate-derived offset wins, else the
  // centralized per-goal default band.
  const requestedOffset =
    explicitOffset !== undefined
      ? explicitOffset
      : (GOAL_CALORIE_OFFSET[goal] ?? 0);
  const proteinMultiplier = GOAL_PROTEIN[goal] ?? DEFAULT_PROTEIN_MULTIPLIER;

  // NUTR-L5 safety floor: a deficit can never push the target below
  // min(tdee, MIN_TARGET_CALORIES). The reported `deficit` is the EFFECTIVE
  // offset after flooring, so UI that renders "±N cal" stays honest when the
  // requested rate couldn't be applied in full.
  const targetCalories = floorTargetCalories(tdee + requestedOffset, tdee);
  const deficit = targetCalories - tdee;

  // Macro split
  const protein = Math.round(proteinMultiplier * weightKg);
  const proteinCals = protein * 4;

  const fatCals = Math.round(targetCalories * FAT_CALORIE_FRACTION);
  const fat = Math.round(fatCals / 9);

  // Carbs are the balancing macro, floored at 0 — the SAME policy as
  // getAdjustedTargets (the canonical display splitter). A 50g floor here made
  // the STORED macros overshoot targetCalories on aggressive cuts
  // (protein*4 + 50*4 + fat*9 > targetCalories) while the displayed carbs
  // floored at 0, so the two disagreed and any direct reader of
  // profile.targetCarbs (e.g. performanceEngine) saw an inflated value
  // (NUTR-M3). Floor 0 makes the stored split reconcile: protein*4 + carbs*4 +
  // fat*9 === targetCalories (modulo per-gram rounding).
  const carbCals = Math.max(0, targetCalories - proteinCals - fatCals);
  const carbs = Math.max(0, Math.round(carbCals / 4));

  return {
    bmr,
    tdee,
    targetCalories,
    protein,
    carbs,
    fat,
    deficit,
  };
}
