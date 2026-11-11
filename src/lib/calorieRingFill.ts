/**
 * How full the calorie wheel and the bars beside it are drawn.
 *
 * They fill with what is logged, whichever way the number counts (Food11
 * call 5). The number follows the left and logged switch; the drawing
 * does not. Nothing logged is an empty grey track, the target reached is
 * a full one, and anything past it is the second lap the wheel and the
 * bars each draw for themselves.
 *
 * It takes no mode on purpose. A drawing that follows "left" starts full
 * and empties: with 410 kcal left of 2,200 the wheel is 19% full while
 * that day's mark in the week strip is 81% full, and a day with nothing
 * logged is a fully orange wheel, the page's loudest state on the day
 * nothing has been done, which is every new account's first day. Food11's
 * row in the plan file has the counts from other apps.
 *
 * It is one function because the wheel, the macros and the Details sheet
 * have to agree: when one of them drew what was left and another what was
 * logged, the same protein was a 9% bar on the page and an 89% bar in
 * the sheet, one tap apart. The wheel and the macros call this; the
 * sheet's whole-number percentage is `clampPct`, the same share rounded.
 */
export function loggedFill(consumed: number, target: number): number {
  if (!(target > 0) || !(consumed > 0)) return 0;
  return Math.min(consumed / target, 1);
}
