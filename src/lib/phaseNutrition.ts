import type { UserProfile } from "./auth";
import type { DayType } from "./types";
import { resolveProteinMultiplier } from "./macroConstants";

export interface DayAdjustment {
  /**
   * Calories of fat redirected INTO carbs on training days (0 on rest).
   * NOT a calorie surplus — Nutr1 holds the daily calorie target flat
   * (expenditure-inclusive). This is the magnitude of the net-neutral
   * fat→carb fuelling shift; getAdjustedTargets clamps it at the
   * essential-fat floor.
   */
  fuelShiftCalories: number;
  proteinMultiplier: number;
  reason: string;
}

/**
 * Essential-fat floor. Fat is never periodized below this many grams per kg
 * bodyweight when shifting calories into carbs for training-day fuelling.
 */
export const ESSENTIAL_FAT_FLOOR_PER_KG = 0.6;

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

  // Nutr1 (expenditure-inclusive): training days carry NO net calorie
  // surplus — the stored TDEE already accounts for activity, and completed
  // exercise is never eaten back. Fuelling is instead a NET-NEUTRAL macro
  // shift: `fuelShiftCalories` worth of fat is moved into carbs (glycogen
  // for the work), holding total calories constant. The magnitudes mirror
  // the pre-Nutr1 net-additive bumps so training-day CARB levels are
  // preserved (where the essential-fat floor allows) — only the calorie
  // total and fat now stay flat instead of climbing.
  switch (dayType) {
    case "lift": {
      const shift = isCut ? 150 : phase === "strength" ? 400 : 200;
      return {
        fuelShiftCalories: shift,
        proteinMultiplier,
        reason: "Lift day — extra carbs for recovery",
      };
    }
    case "run": {
      const shift = isCut ? 100 : 200;
      return {
        fuelShiftCalories: shift,
        proteinMultiplier,
        reason: "Run day — extra carbs for fuel",
      };
    }
    case "both": {
      const shift = isCut ? 250 : phase === "strength" ? 500 : 350;
      return {
        fuelShiftCalories: shift,
        proteinMultiplier,
        reason: "Lift + Run day — extra carbs for fuel & recovery",
      };
    }
    case "rest":
    default:
      return {
        fuelShiftCalories: 0,
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

  // Nutr1: calories are FLAT across day types (expenditure-inclusive) — no
  // training-day surplus. Day-type fuelling is the net-neutral fat→carb shift
  // below, NOT a calorie bump.
  const calories = base.calories;
  const protein = Math.round(adj.proteinMultiplier * (profile.weightKg || 70));

  // Net-neutral carb periodization: move `fuelShiftCalories` of fat into
  // carbs on training days, clamped so fat never drops below the essential
  // floor (and never goes negative when stored fat is already below it). The
  // lowered fat is absorbed by the balancing-carbs formula below as extra
  // carbs at constant calories — so a +200-cal lift day yields the SAME carb
  // grams it did under the old net-additive model, just without the surplus.
  const weightKg = profile.weightKg || 70;
  const fatFloorG = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * weightKg);
  const desiredFatCutG = Math.round(adj.fuelShiftCalories / 9);
  const fatCutG = Math.max(0, Math.min(desiredFatCutG, base.fat - fatFloorG));
  const fat = base.fat - fatCutG;

  // Carbs are the balancing macro. They absorb the fat reduction above AND
  // any gap between the bodyweight-derived protein and the stored base
  // protein target, so the rendered macros always reconcile with the (flat)
  // calorie goal (protein*4 + carbs*4 + fat*9 === calories, modulo ≤2 cal of
  // per-gram rounding). Clamped at 0 for aggressive cuts where protein + fat
  // alone already meet the budget.
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbs, fat, annotation: adj.reason };
}
