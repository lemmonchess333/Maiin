/**
 * Progressive-overload suggestion (2026-07 audit — the lifting-logic gap;
 * competitive doc Tier-2 #6). WorkoutSession pre-fills last session's
 * numbers but SUGGESTS nothing; Fitbod's moat, Hevy/Strong's gap.
 *
 * Classic double progression, deliberately conservative:
 *   - Every completed working set last session hit the exercise's target
 *     reps at one consistent weight → suggest +INCREMENT_KG.
 *   - Otherwise → suggest repeating the weight and building reps toward
 *     target ("repeat").
 *   - No suggestion at all (null) for bodyweight rows (weight 0), missing
 *     history, unknown targets, or wildly mixed weights (pyramid schemes —
 *     a single suggested number would be wrong for most of their sets).
 *
 * Pure: UI decides where/when to show it (WorkoutSession hides it once
 * the exercise has a completed set this session).
 */

export const INCREMENT_KG = 2.5;

export interface ProgressionSuggestion {
  kind: "increase" | "repeat";
  /** The working weight to aim for this session. */
  weightKg: number;
  /** Last session's working weight the suggestion is based on. */
  lastWeightKg: number;
  targetReps: number;
}

export function suggestNextLoad(args: {
  /** Previous session's sets for this exercise (prefill data). */
  prevSets: { weight: number; reps: number }[];
  targetReps: number;
  incrementKg?: number;
}): ProgressionSuggestion | null {
  const { prevSets, targetReps } = args;
  const increment = args.incrementKg ?? INCREMENT_KG;
  if (!Number.isFinite(targetReps) || targetReps <= 0) return null;

  const working = prevSets.filter((s) => s.weight > 0);
  if (working.length === 0) return null;

  // One consistent working weight; a pyramid (60/70/80) has no single
  // honest "next weight".
  const top = Math.max(...working.map((s) => s.weight));
  const consistent = working.every((s) => Math.abs(s.weight - top) < 0.01);
  if (!consistent) return null;

  const allHitTarget = working.every((s) => s.reps >= targetReps);
  if (allHitTarget) {
    return {
      kind: "increase",
      weightKg: Math.round((top + increment) * 100) / 100,
      lastWeightKg: top,
      targetReps,
    };
  }
  return {
    kind: "repeat",
    weightKg: top,
    lastWeightKg: top,
    targetReps,
  };
}
