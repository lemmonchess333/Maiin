/**
 * TDEE Calculator using Mifflin-St Jeor equation (more accurate than Harris-Benedict).
 * Provides macro recommendations based on fitness goal.
 */

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
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
): TDEEResult {
  const sexOffset = sex === "female" ? -161 : 5;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);

  // Goal-based adjustments
  let deficit = 0;
  let proteinMultiplier = 2.0; // g per kg bodyweight

  switch (goal) {
    case "cut":
      deficit = -500; // ~0.5kg/week loss
      proteinMultiplier = 2.2; // Higher protein to preserve muscle
      break;
    case "lean bulk":
      deficit = 300; // Modest surplus
      proteinMultiplier = 1.8;
      break;
    case "recomp":
      deficit = 0;
      proteinMultiplier = 2.0;
      break;
  }

  const targetCalories = tdee + deficit;

  // Macro split
  const protein = Math.round(proteinMultiplier * weightKg);
  const proteinCals = protein * 4;

  // Fat: 25% of target calories
  const fatCals = Math.round(targetCalories * 0.25);
  const fat = Math.round(fatCals / 9);

  // Carbs: remainder
  const carbCals = Math.max(0, targetCalories - proteinCals - fatCals);
  const carbs = Math.round(carbCals / 4);

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
