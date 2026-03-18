import type { UserProfile } from "./auth";
import type { DayType } from "./types";

export interface DayAdjustment {
  calorieAdjustment: number;
  carbAdjustment: number;
  proteinMultiplier: number;
  reason: string;
}

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
  phase: string,
  goal?: string
): DayAdjustment {
  // Use goal to determine cut behavior; fall back to phase if goal not provided
  const isCut = goal === "cut" || (!goal && phase === "cut");
  // Protein multiplier: prefer phase-specific, but if goal is "cut" use cut multiplier
  const proteinKey = isCut ? "cut" : phase;
  const proteinMultiplier = PHASE_PROTEIN_MULTIPLIERS[proteinKey] || 2.0;

  switch (dayType) {
    case "lift": {
      const calAdj = isCut ? 150 : phase === "strength" ? 400 : 200;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: 20,
        proteinMultiplier,
        reason: `Lift day — +${calAdj} cal for recovery`,
      };
    }
    case "run": {
      const calAdj = isCut ? 100 : 200;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: 30,
        proteinMultiplier,
        reason: `Run day — +${calAdj} cal for fuel`,
      };
    }
    case "both": {
      const calAdj = isCut ? 250 : phase === "strength" ? 500 : 350;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: 40,
        proteinMultiplier,
        reason: `Lift + Run day — +${calAdj} cal for recovery & fuel`,
      };
    }
    case "rest":
    default:
      return {
        calorieAdjustment: 0,
        carbAdjustment: 0,
        proteinMultiplier,
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
