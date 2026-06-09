import { THEME } from "./theme";

/**
 * REVIEW: this palette has no production consumer (grep: only colorUtils.test
 * references it) and DIVERGES from the canonical `THEME.macros`
 * (calories/protein/carbs/fat = red/pink/yellow/sage). Candidate for deletion.
 * `calories` was the legacy #e87316 "nutrition orange" — repointed to the
 * canonical nutrition orange (#D9884E, the deliberate #E87316→#D9884E conflict
 * resolution). The other three are left as-is pending the deletion review.
 */
export const macroColors = {
  calories: THEME.semantic.nutrition, // #D9884E (canonical nutrition orange)
  protein: "#3b7ee6",
  carbs: "#e09510",
  fat: "#9855e0",
};

export function tint(hex: string, opacity = 0.12) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
