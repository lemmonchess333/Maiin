/**
 * Macro Constants — single source of truth for protein multipliers
 * and calorie adjustments across all calculation modules.
 *
 * Hierarchy: phase overrides goal overrides default.
 */

import type { Goal } from "./types";

/** Protein multipliers (g per kg bodyweight) by training phase */
export const PHASE_PROTEIN: Record<string, number> = {
  strength: 2.2,
  hypertrophy: 2.0,
  deload: 1.8,
  race_prep: 1.6,
  cut: 2.4,
  base: 2.0,
};

/** Protein multipliers by user goal (fallback when phase not set) */
export const GOAL_PROTEIN: Record<string, number> = {
  cut: 2.2,
  "lean bulk": 1.8,
  recomp: 2.0,
};

/** Default protein multiplier when neither phase nor goal is known */
export const DEFAULT_PROTEIN_MULTIPLIER = 2.0;

/** Fat percentage of total calories */
export const FAT_CALORIE_FRACTION = 0.25;

/** Calorie adjustments by goal */
export const GOAL_CALORIE_OFFSET: Record<string, number> = {
  cut: -500,
  "lean bulk": 300,
  recomp: 0,
};

/** Weight change targets per week (kg) */
export const WEEKLY_WEIGHT_TARGET: Record<string, number> = {
  "lean bulk": 0.3,
  bulk: 0.3,
  cut: -0.5,
  maintain: 0,
  recomp: 0,
};

/**
 * Resolve the correct protein multiplier given phase and goal.
 * Phase takes priority, then goal, then default.
 */
export function resolveProteinMultiplier(
  phase?: string,
  goal?: string | Goal,
): number {
  if (phase && PHASE_PROTEIN[phase] !== undefined) {
    return PHASE_PROTEIN[phase];
  }
  if (goal && GOAL_PROTEIN[goal] !== undefined) {
    return GOAL_PROTEIN[goal];
  }
  return DEFAULT_PROTEIN_MULTIPLIER;
}
