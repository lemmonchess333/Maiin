import type { UserProfile } from "./auth";

export interface DayAdjustment {
  calorieAdjustment: number;
  carbAdjustment: number;
  proteinMultiplier: number;
  reason: string;
}

type DayType = "lift" | "run" | "both" | "rest";
type Phase = string;

const PHASE_PROTEIN_MULTIPLIERS: Record<string, number> = {
  strength: 2.2,
  hypertrophy: 2.0,
  deload: 1.8,
  race_prep: 1.6,
  cut: 2.4,
  base: 2.0,
};

export function getDayAdjustment(
  dayType: DayType,
  phase: Phase,
  goal?: string
): DayAdjustment {
  const isCut = goal === "cut";

  switch (dayType) {
    case "lift":
      return {
        calorieAdjustment: isCut ? 150 : phase === "strength" ? 400 : 200,
        carbAdjustment: 20,
        proteinMultiplier: PHASE_PROTEIN_MULTIPLIERS[phase] || 2.0,
        reason: `Lift day — +${isCut ? 150 : phase === "strength" ? 400 : 200} cal for recovery`,
      };
    case "run":
      return {
        calorieAdjustment: isCut ? 100 : 200,
        carbAdjustment: 30,
        proteinMultiplier: PHASE_PROTEIN_MULTIPLIERS[phase] || 2.0,
        reason: `Run day — +${isCut ? 100 : 200} cal for fuel`,
      };
    case "both":
      return {
        calorieAdjustment: isCut ? 250 : phase === "strength" ? 500 : 350,
        carbAdjustment: 40,
        proteinMultiplier: PHASE_PROTEIN_MULTIPLIERS[phase] || 2.0,
        reason: `Lift + Run day — +${isCut ? 250 : phase === "strength" ? 500 : 350} cal for recovery & fuel`,
      };
    case "rest":
    default:
      return {
        calorieAdjustment: 0,
        carbAdjustment: 0,
        proteinMultiplier: PHASE_PROTEIN_MULTIPLIERS[phase] || 2.0,
        reason: "Rest day — baseline targets",
      };
  }
}

export function getAdjustedTargets(
  profile: UserProfile,
  dayType: DayType
): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  annotation: string;
} {
  const base = {
    calories: profile.targetCalories || 2200,
    protein: profile.targetProtein || 160,
    carbs: profile.targetCarbs || 250,
    fat: profile.targetFat || 60,
  };

  const phase = profile.program?.currentPhase || "base";
  const goal = profile.program?.goal;
  const adj = getDayAdjustment(dayType, phase, goal);

  return {
    calories: base.calories + adj.calorieAdjustment,
    protein: Math.round(adj.proteinMultiplier * (profile.weightKg || 70)),
    carbs: base.carbs + adj.carbAdjustment,
    fat: base.fat,
    annotation: adj.reason,
  };
}
