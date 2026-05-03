/**
 * Per-exercise summary formatter.
 *
 * Used in two places:
 *   - ActivityCard rendering of workout exercises in the social feed.
 *   - SaveRoutineSheet's read-only preview.
 *
 * Rules:
 *   - Reps 0                  → "{sets} sets" (logged but no rep
 *                                target — rare but possible on
 *                                pre-PR-4 activities).
 *   - Weight 0 + BW exercise  → "{sets}×{reps} BW".
 *   - Weight 0 + weighted ex. → "{sets}×{reps}" (uncalibrated — don't
 *                                fabricate "BW" for a barbell lift).
 *   - Otherwise               → "{sets}×{reps}×{weight}kg".
 *
 * `BW` is the universal lifter shorthand and reads cleanly in feed
 * cards; "Bodyweight" is too long for the right-aligned slot.
 *
 * Pass `exerciseId` so the summary can look up the actual equipment
 * type via the static EXERCISES catalogue. Without it, weight === 0
 * defaults to "no weight shown" (not BW) — the safer guess for an
 * unidentified exercise.
 */

import { isBodyweightExerciseId } from "@/lib/exercises";

export interface ExerciseSummaryInput {
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
  /** Optional — when provided, used to disambiguate true bodyweight
   *  movements from uncalibrated weighted exercises. */
  exerciseId?: string;
}

export function formatExerciseSummary(input: ExerciseSummaryInput): string {
  const sets = Math.max(0, Math.round(input.setCount || 0));
  const reps = Math.max(0, Math.round(input.targetReps || 0));
  const weight = Math.max(0, Number(input.targetWeightKg) || 0);

  if (sets === 0 && reps === 0) return "—";
  if (reps === 0) return `${sets} set${sets === 1 ? "" : "s"}`;
  if (weight === 0) {
    // Only label as BW when the exercise is intrinsically bodyweight.
    // Otherwise weight === 0 means "no calibrated starting weight"
    // — a Leg Press at 0kg is uncalibrated, not bodyweight.
    return isBodyweightExerciseId(input.exerciseId)
      ? `${sets}×${reps} BW`
      : `${sets}×${reps}`;
  }
  // Drop trailing .0 on round weights so "100kg" doesn't become "100.0kg".
  const weightStr = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
  return `${sets}×${reps}×${weightStr}kg`;
}
