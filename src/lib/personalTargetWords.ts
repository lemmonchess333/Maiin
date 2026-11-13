import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { MAX_WEEKLY_STEP_KCAL } from "@/lib/adaptiveTarget";

/** Within this many kcal the personal target reads as the same as now. */
export const PERSONAL_TARGET_CLOSE_KCAL = 50;

/** The card's two sentences, apart from the drawing so they can be tested
 *  for every case (whole-app grill Q49, Q71, Q87). */
export function personalTargetWords(
  personalTarget: number,
  currentTarget: number,
  trialOffered: boolean
): { line: string; pro: string } {
  const diff = Math.round(personalTarget - currentTarget);
  const gap = Math.abs(diff);
  const amount = `${formatCalories(personalTarget)} ${CALORIE_UNIT} a day`;
  const line =
    gap < PERSONAL_TARGET_CLOSE_KCAL
      ? `${amount}, from your meals and weigh-ins: close to your target now.`
      : `${amount}, from your meals and weigh-ins: ${formatCalories(gap)} ${
          diff > 0 ? "more" : "less"
        } than your target now.`;
  const move =
    gap < PERSONAL_TARGET_CLOSE_KCAL
      ? "Pro keeps it up to date as your body changes."
      : gap <= MAX_WEEKLY_STEP_KCAL
        ? "Pro switches you to it today and keeps it up to date."
        : `Pro moves you to it, at most ${MAX_WEEKLY_STEP_KCAL} ${CALORIE_UNIT} a week, and keeps it up to date.`;
  return {
    line,
    pro: trialOffered ? `${move} The first 7 days are free.` : move,
  };
}
