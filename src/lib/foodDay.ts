/**
 * What a food day is, everywhere the app counts one (App1 Q14): a day
 * whose logged food reaches 800 kcal.
 *
 * Below that the day is a coffee or a forgotten dinner, not a day's
 * eating. Counted as a day logged, it told someone who logged breakfast
 * and nothing else that their week was full, and averaged in, a coffee
 * on a rest day read a cutter eating 2,000 a day as 1,471.
 *
 * Four places decided it four ways until App1: Home's week counted a day
 * with any meal, today included; Analytics' Food page any finished day
 * above 0 kcal; the weekly review and the score a day of 800 kcal or
 * more; Analytics' days logged and its averages any day with a meal.
 *
 * Today: a day that has reached 800 kcal is a food day, today too, since
 * logging only adds to it, so Home's week can read 7 of 7 on the Sunday
 * evening of a week logged every day. A day below it is not one, and
 * today below it is not yet anything: it is not over, so nothing judges
 * it short. What judges a day against its target (`foodDays.ts`) reads
 * finished days only, for the same reason.
 *
 * Readers: Home's week (`weekSummary.ts`), the weekly review
 * (`weeklyReviewViewModel.ts`), Analytics' Food page (`foodDays.ts`),
 * days logged and the averages (`historyFigures.ts`), the lifetime days
 * (`lifetimeMealDays.ts`), the calorie balance chart, the Meal Prep
 * Master badge's days (`useStreaks`) and the adaptive estimator's
 * trusted days (`adaptiveTdee.ts`). The score's server copy is
 * `FULL_FOOD_DAY_KCAL` in functions/lib/perfScoring.js, pinned to this
 * one by performanceEngineParity.cross.test.ts. `oneWeekCountGuard.test.ts`
 * fails on a new rule written anywhere else.
 *
 * Not a food day, on purpose: the streak's active day, which any logged
 * meal keeps (logging something is what a streak asks), and the first
 * meal a new account is asked for.
 */

/** The calories a day's logged food has to reach to be a food day. */
export const FOOD_DAY_KCAL = 800;

/** Whether a day's logged calories make it a food day. */
export function isFoodDay(calories: number | null | undefined): boolean {
  return (
    typeof calories === "number" &&
    Number.isFinite(calories) &&
    calories >= FOOD_DAY_KCAL
  );
}
