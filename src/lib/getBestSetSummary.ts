import type { ProgramExercise } from "@/features/program/programTypes";
import { getExerciseById } from "@/lib/exercises";

/**
 * Returns a display string for the best set of a completed exercise.
 * Uses lastPerformance data. Falls back to prescription.
 */
export function getBestSetSummary(ex: ProgramExercise): string {
  const lp = ex.lastPerformance;
  if (lp && lp.completed) {
    if (lp.weight > 0) return `${lp.weight}kg × ${lp.reps}`;
    return `BW × ${lp.reps}`;
  }
  // Fallback to prescription
  return getExercisePrescription(ex);
}

/**
 * Returns a prescription display string for an exercise.
 * e.g. "3×10 · 60kg" or "4×6" (bodyweight)
 */
export function getExercisePrescription(ex: ProgramExercise): string {
  const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
  if (isBW || ex.weight <= 0) return `${ex.sets}×${ex.reps}`;
  return `${ex.sets}×${ex.reps} · ${ex.weight}kg`;
}
