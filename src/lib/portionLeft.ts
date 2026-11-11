/**
 * What is left of the day after a portion, in one line for the portion
 * sheets: "1,240 kcal and 62g protein left after this".
 *
 * It counts the way the Food hero does (Food10, call 1): what is left in
 * the left view, what is logged in the logged view, so the line under a
 * portion and the ring above the diary never read one number two ways.
 * MacroFactor, MyFitnessPal, Noom and Garmin all show a portion against
 * the day's targets; Tropos says it in words, with no ring or colour of
 * its own (DESIGN_GUIDE §0.1, §0.9).
 */
import type { CalorieRingMode } from "@/components/food/CalorieRing";
import {
  CALORIE_UNIT,
  formatCalories,
  formatMacro,
} from "@/utils/formatNutrition";

/** The day as it stands without the portion in question. */
export interface DayBudget {
  /** Calories logged on the day, not counting this portion. */
  calories: number;
  /** Protein logged on the day, in grams, not counting this portion. */
  protein: number;
  calorieTarget: number;
  proteinTarget: number;
}

export interface PortionFigures {
  calories: number;
  protein: number;
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * The line, or null when there is no calorie target to count against
 * (a day the targets have not loaded for, or an account without one).
 * Protein is named only while some is still to eat, or in the logged
 * view; grams stay unspaced, the food surface's house style.
 */
export function portionLeftText(
  day: DayBudget,
  portion: PortionFigures,
  mode: CalorieRingMode
): string | null {
  const calorieTarget = finite(day.calorieTarget);
  if (calorieTarget <= 0) return null;
  const calories = finite(day.calories) + finite(portion.calories);
  const protein = finite(day.protein) + finite(portion.protein);
  const proteinTarget = finite(day.proteinTarget);

  if (mode === "eaten") {
    return `${formatCalories(calories)} ${CALORIE_UNIT} and ${formatMacro(protein)}g protein logged with this`;
  }

  const caloriesLeft = Math.round(calorieTarget - calories);
  const caloriePart =
    caloriesLeft >= 0
      ? `${formatCalories(caloriesLeft)} ${CALORIE_UNIT}`
      : `${formatCalories(-caloriesLeft)} ${CALORIE_UNIT} over`;
  const proteinLeft = Math.round(proteinTarget - protein);
  const proteinPart =
    proteinTarget > 0 && proteinLeft > 0
      ? `${formatMacro(proteinLeft)}g protein left`
      : null;

  if (caloriesLeft >= 0) {
    return proteinPart
      ? `${caloriePart} and ${proteinPart} after this`
      : `${caloriePart} left after this`;
  }
  return proteinPart
    ? `${caloriePart} and ${proteinPart} after this`
    : `${caloriePart} after this`;
}
