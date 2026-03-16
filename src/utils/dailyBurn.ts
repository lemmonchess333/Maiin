import type { ActivityLevel, FitnessGoal } from "@/lib/tdee";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const PHASE_OFFSETS: Record<FitnessGoal, number> = {
  cut: -500,
  recomp: 0,
  "lean bulk": 300,
};

export interface DailyBurn {
  bmr: number;
  tdee: number;
  phaseAdjustedTdee: number;
  workoutCalories: number;
  runCalories: number;
  stepCalories: number;
  dailyBudget: number;
  phase: FitnessGoal;
  phaseLabel: string;
}

export function calcDailyBurn(
  bmr: number,
  activityLevel: ActivityLevel,
  phase: FitnessGoal,
  workoutCals: number,
  runCals: number,
  stepCals: number,
): DailyBurn {
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
  const phaseAdjustedTdee = tdee + PHASE_OFFSETS[phase];
  const dailyBudget = phaseAdjustedTdee + workoutCals + runCals + stepCals;

  const phaseLabel = phase === "cut" ? "cut" : phase === "lean bulk" ? "bulk" : "recomp";

  return {
    bmr,
    tdee,
    phaseAdjustedTdee,
    workoutCalories: workoutCals,
    runCalories: runCals,
    stepCalories: stepCals,
    dailyBudget,
    phase,
    phaseLabel,
  };
}

export function estimateStepCalories(steps: number, weightKg: number): number {
  const calPerStep = 0.04 * (weightKg / 70);
  return Math.round(steps * calPerStep);
}
