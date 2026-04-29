/**
 * Per-exercise summary formatter.
 *
 * Used in two places:
 *   - ActivityCard rendering of workout exercises in the social feed.
 *   - SaveRoutineSheet's read-only preview.
 *
 * Replaces a previous pattern that built the summary inline as
 *   `${setCount}×${targetReps}×${targetWeightKg}kg`
 * which produced things like "1×8×0kg" for bodyweight or unlogged
 * lifts — visible junk on activity cards.
 *
 * Rules:
 *   - Weight 0 with reps > 0  → "{sets}×{reps} BW" (bodyweight).
 *   - Reps 0                  → "{sets} sets" (logged but no rep
 *                                target — rare but possible on
 *                                pre-PR-4 activities).
 *   - Otherwise               → "{sets}×{reps}×{weight}kg".
 *
 * `BW` is the universal lifter shorthand and reads cleanly in feed
 * cards; "Bodyweight" is too long for the right-aligned slot.
 */

export interface ExerciseSummaryInput {
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
}

export function formatExerciseSummary(input: ExerciseSummaryInput): string {
  const sets = Math.max(0, Math.round(input.setCount || 0));
  const reps = Math.max(0, Math.round(input.targetReps || 0));
  const weight = Math.max(0, Number(input.targetWeightKg) || 0);

  if (sets === 0 && reps === 0) return "—";
  if (reps === 0) return `${sets} set${sets === 1 ? "" : "s"}`;
  if (weight === 0) return `${sets}×${reps} BW`;
  // Drop trailing .0 on round weights so "100kg" doesn't become "100.0kg".
  const weightStr = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
  return `${sets}×${reps}×${weightStr}kg`;
}
