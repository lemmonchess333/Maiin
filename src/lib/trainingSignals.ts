/**
 * trainingSignals — the single translator between the program engine's phase
 * vocabulary and the nutrition layer's.
 *
 * THE DRIFT THIS FIXES: the engine sets `ProgramState.currentPhase` to only
 * "base" | "progression" | "deload" (programEngine.ts ~line 1104), but the
 * nutrition layer (phaseNutrition.ts) switches on `phase === "strength"` and
 * resolves protein via PHASE_PROTEIN keys (strength/hypertrophy/deload/
 * race_prep/base). So the engine's "progression" matched NOTHING — the
 * strength carb-shift branch was dead, and progression-week protein silently
 * fell back to the goal/default multiplier instead of the intended phase one.
 *
 * The real source of strength-vs-hypertrophy is the user's PrimaryGoal, NOT
 * currentPhase (which only encodes progression-vs-deload). This module is the
 * one place that maps the engine's actual state into the vocabulary the
 * nutrition layer needs, so both sides agree.
 *
 * Pure + total: never throws. Absent program / absent lift workouts is a
 * valid zero state (RUN_ONLY, FREE_RUN, pre-onboarding) → liftPhase "none".
 */
import { generateWeekPrescription } from "@/features/program/programEngine";
import type {
  ProgramState,
  WorkoutDay,
  PrimaryGoal,
} from "@/features/program/programTypes";

/** Nutrition-vocabulary lift phase. "none" = the user does no lifting. */
export type LiftPhase = "strength" | "hypertrophy" | "deload" | "base" | "none";

/** Coarse planned-volume band for the heaviest lift day in the program. */
export type LiftVolumeTier = "none" | "low" | "moderate" | "high";

export interface NutritionTrainingSignals {
  liftPhase: LiftPhase;
  isDeload: boolean;
  liftVolumeTier: LiftVolumeTier;
}

/**
 * Volume-tier thresholds — total planned reps (Σ sets×reps) in a single lift
 * day. Calibrated to typical sessions: ~5 lifts × 3 sets × 8 reps ≈ 120 reps
 * sits squarely in "moderate". Exported so Prompt B (which consumes the tier)
 * and tests share the exact cut points.
 */
export const LIFT_VOLUME_LOW_MAX = 80;
export const LIFT_VOLUME_MODERATE_MAX = 160;

/**
 * PrimaryGoal → lift phase. Only strength/hypertrophy carry a distinct
 * nutrition stimulus; fat_loss / general / running lift to support other
 * goals and get baseline treatment (normal protein, no strength carb bump).
 * Deliberately NOT derived from currentPhase — see module header.
 */
function liftPhaseForGoal(primaryGoal: PrimaryGoal | undefined): LiftPhase {
  switch (primaryGoal) {
    case "strength":
      return "strength";
    case "hypertrophy":
      return "hypertrophy";
    case "fat_loss":
    case "general":
    case "running":
    default:
      return "base";
  }
}

/** Σ sets×reps for one workout day (0 for skipped / empty / malformed). */
function dayLiftVolume(day: WorkoutDay | undefined): number {
  if (!day || day.skipped || !Array.isArray(day.exercises)) return 0;
  return day.exercises.reduce((sum, ex) => {
    const sets = typeof ex?.sets === "number" && ex.sets > 0 ? ex.sets : 0;
    const reps = typeof ex?.reps === "number" && ex.reps > 0 ? ex.reps : 0;
    return sum + sets * reps;
  }, 0);
}

function tierForVolume(reps: number): LiftVolumeTier {
  if (reps <= 0) return "none";
  if (reps <= LIFT_VOLUME_LOW_MAX) return "low";
  if (reps <= LIFT_VOLUME_MODERATE_MAX) return "moderate";
  return "high";
}

/**
 * Translate the engine's program state into nutrition training signals.
 *
 * @param program full ProgramState, or undefined (run-only / free / logged
 *   out). Undefined and "no lift volume" both collapse to the zero state.
 */
export function trainingSignalsForNutrition(
  program: ProgramState | undefined
): NutritionTrainingSignals {
  const ZERO: NutritionTrainingSignals = {
    liftPhase: "none",
    isDeload: false,
    liftVolumeTier: "none",
  };

  if (!program) return ZERO;

  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const dayVolumes = workouts.map(dayLiftVolume);
  const maxDayVolume = dayVolumes.length ? Math.max(...dayVolumes) : 0;

  // No lift volume anywhere → this user is, for nutrition purposes, a
  // non-lifter (RUN_ONLY hybrid with empty lift week, etc.). Zero state, and
  // crucially isDeload false — a run-only "deload" is not a thing here.
  if (maxDayVolume <= 0) return ZERO;

  // isDeload: reconcile the two authorities.
  //  - currentPhase === "deload" is the engine's MATERIALIZED state (set on
  //    deload weeks at programEngine.ts ~1104).
  //  - generateWeekPrescription(weekNumber).deload is the deterministic RULE
  //    (every 4th week).
  // They normally agree. When they don't — e.g. an onboarding doc still on
  // currentPhase "base" while weekNumber has advanced into a deload week, or
  // vice-versa — treat EITHER as deload. Easing protein is the safe direction;
  // a stale currentPhase shouldn't suppress a deserved ease.
  const phaseDeload = program.currentPhase === "deload";
  const prescriptionDeload =
    typeof program.weekNumber === "number"
      ? generateWeekPrescription(program.weekNumber).deload
      : false;
  const isDeload = phaseDeload || prescriptionDeload;

  // Deload overrides the goal-derived phase: it eases protein (PHASE_PROTEIN
  // deload = 1.8) and drops the strength carb bump. Otherwise the user's
  // PrimaryGoal is the real strength-vs-hypertrophy source.
  const liftPhase: LiftPhase = isDeload
    ? "deload"
    : liftPhaseForGoal(program.primaryGoal);

  return {
    liftPhase,
    isDeload,
    liftVolumeTier: tierForVolume(maxDayVolume),
  };
}
