import type { FitnessGoal } from "./tdee";

/**
 * Human-readable nutrition phase + its calorie consequence, for the
 * onboarding review step. Surfaces the otherwise-invisible decision that
 * `goalToFitnessGoal` makes (e.g. "Build muscle" silently becomes a lean
 * bulk / small surplus). `deficitCals` is the per-day offset from
 * calculateTDEE (negative = deficit, positive = surplus, 0 = maintenance).
 */
export function nutritionPhaseLabel(
  goal: FitnessGoal,
  deficitCals: number
): string {
  const name =
    goal === "cut" ? "Cutting" : goal === "lean bulk" ? "Lean bulk" : "Recomp";
  const consequence =
    deficitCals < 0
      ? `${deficitCals} cal/day deficit`
      : deficitCals > 0
        ? `+${deficitCals} cal/day surplus`
        : "maintenance calories";
  return `${name} · ${consequence}`;
}
