import type { UserProfile } from "./auth";
import type { DayType } from "./types";
import { resolveProteinMultiplier } from "./macroConstants";

export interface DayAdjustment {
  calorieAdjustment: number;
  carbAdjustment: number;
  proteinMultiplier: number;
  reason: string;
}

export function getDayAdjustment(
  dayType: DayType,
  phase: string,
  goal?: string
): DayAdjustment {
  const isCut = goal === "cut" || (!goal && phase === "cut");
  const proteinMultiplier = resolveProteinMultiplier(
    isCut ? "cut" : phase,
    goal
  );

  // Extra training-day calories are funnelled entirely into carbs
  // (fuel + recovery). Derive `carbAdjustment` from `calorieAdjustment`
  // so the rendered total never disagrees with `protein*4 + carbs*4 +
  // fat*9` — pre-fix the two were tuned independently (e.g. +400 cal
  // but only +80 cal worth of carbs on a strength-phase lift day, the
  // remaining 320 cal had no macro home).
  const calAdjToCarbs = (cal: number): number => Math.round(cal / 4);

  switch (dayType) {
    case "lift": {
      const calAdj = isCut ? 150 : phase === "strength" ? 400 : 200;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: calAdjToCarbs(calAdj),
        proteinMultiplier,
        reason: `Lift day — +${calAdj} cal for recovery`,
      };
    }
    case "run": {
      const calAdj = isCut ? 100 : 200;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: calAdjToCarbs(calAdj),
        proteinMultiplier,
        reason: `Run day — +${calAdj} cal for fuel`,
      };
    }
    case "both": {
      const calAdj = isCut ? 250 : phase === "strength" ? 500 : 350;
      return {
        calorieAdjustment: calAdj,
        carbAdjustment: calAdjToCarbs(calAdj),
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

  const calories = base.calories + adj.calorieAdjustment;
  const protein = Math.round(adj.proteinMultiplier * (profile.weightKg || 70));
  const fat = base.fat;
  // Carbs are the balancing macro. They absorb BOTH the training-day calorie
  // surplus AND any gap between the bodyweight-derived protein above and the
  // stored base protein target, so the rendered macros always reconcile with
  // the rendered calorie goal (protein*4 + carbs*4 + fat*9 === calories, modulo
  // ≤2 cal of per-gram rounding). Pre-fix, carbs only tracked the calorie
  // surplus (`base.carbs + adj.carbAdjustment`) while protein was recomputed
  // from bodyweight independently — so whenever the stored base protein target
  // differed from `proteinMultiplier * weightKg` (stale onboarding value,
  // weight change, or a different phase multiplier upstream), the macros shown
  // on Home/Food silently summed to a different number than the calorie goal.
  // Clamped at 0 for aggressive cuts where protein + fat alone already meet the
  // budget.
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbs, fat, annotation: adj.reason };
}
