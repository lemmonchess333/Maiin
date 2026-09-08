/**
 * One sentence for a calorie target the macro split cannot reconcile —
 * the target sits below what the essential fat floor alone costs at the
 * user's bodyweight, so protein and carb targets read 0 g and fat alone
 * exceeds the budget (`TDEEResult.infeasible`, `EffectiveTargets.
 * targetInfeasible`).
 *
 * Shared by Settings → Nutrition, Home's energy card and the Food hero so
 * the three surfaces say the same thing. Before this only Settings warned;
 * Food and Home rendered "125 / 0g PROTEIN" as if 0 g were the goal
 * (reproduced with a 100 kcal manual target).
 *
 * Deliberately NOT a rule about what the target should be: the number is
 * the user's, the app keeps it, and this line says what it can and cannot
 * fund. The policy question (refuse, clamp, or keep-and-explain) is open
 * and is the owner's; keep-and-explain is what ships meanwhile.
 */
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";

export function macroInfeasibilityMessage(minFeasibleKcal: number): string {
  return (
    `Below ${formatCalories(minFeasibleKcal)} ${CALORIE_UNIT}, essential fat ` +
    "alone exceeds this target at your weight, so protein and carb targets " +
    "read 0 g. Raise the target in Settings → Nutrition for a usable split."
  );
}
