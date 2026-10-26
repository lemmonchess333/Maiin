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
 *   - Otherwise               → "{sets}×{reps}×{weight} kg", or lb.
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
import { isTimedExerciseId } from "@/features/program/repUnits";
import { liftUnitLabel, type LiftUnit } from "@/lib/liftLoad";
import { kitLoadIn } from "@/features/program/loadSteps";

export interface ExerciseSummaryInput {
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
  /** Optional — when provided, used to disambiguate true bodyweight
   *  movements from uncalibrated weighted exercises. */
  exerciseId?: string;
}

/** The summary for an exercise with no sets, which an older post may
 *  carry as its stored summary. */
export const NO_SETS_SUMMARY = "—";

/** `unit` is the reader's (Lift18): a post stores kg, and the summary it
 *  stores is written in kg, as the fallback for a post with no figures. */
export function formatExerciseSummary(
  input: ExerciseSummaryInput,
  unit: LiftUnit = "kg"
): string {
  const sets = Math.max(0, Math.round(input.setCount || 0));
  const reps = Math.max(0, Math.round(input.targetReps || 0));
  const weight = Math.max(0, Number(input.targetWeightKg) || 0);

  if (sets === 0 && reps === 0) return NO_SETS_SUMMARY;
  if (reps === 0) return `${sets} set${sets === 1 ? "" : "s"}`;
  const timed = isTimedExerciseId(input.exerciseId);
  const count = `${sets}×${reps}${timed ? " s" : ""}`;
  if (weight === 0) {
    if (timed) return count;
    // Only label as BW when the exercise is intrinsically bodyweight.
    // Otherwise weight === 0 means "no calibrated starting weight"
    // — a Leg Press at 0kg is uncalibrated, not bodyweight.
    return isBodyweightExerciseId(input.exerciseId)
      ? `${sets}×${reps} BW`
      : `${sets}×${reps}`;
  }
  const shown =
    unit === "lbs" ? kitLoadIn(weight, unit, input.exerciseId) : weight;
  // Drop trailing .0 on round weights so "100 kg" doesn't become "100.0 kg".
  const weightStr = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  // Spaced unit — the app's one unit treatment ("60 kg", never "60kg").
  return `${count}${timed ? " × " : "×"}${weightStr} ${liftUnitLabel(unit)}`;
}
