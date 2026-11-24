/* The wheel's drawing, in the units of its own box: `CalorieRing` draws
   from these, and the flight of a logged food lands on the arc they
   place (`foodFlight.ts`). */
/** The side of the wheel's box. */
export const WHEEL_SIZE = 160;
/** The width of its arc. */
export const WHEEL_STROKE = 12;

/** Food's view: what is left ("left") or what is logged ("eaten"; the
 *  stored key, shown as "logged"). One switch for the wheel, the macros
 *  and the Details sheet, on Food and on Home. */
export type CalorieRingMode = "left" | "eaten";

/**
 * How full the calorie wheel's first lap, and the bars beside it, are
 * drawn: 0 to 1, in the view the person has chosen.
 *
 * The drawing follows the left and logged switch, as MacroFactor's does
 * (owner, 23 November 2026, reversing Food11 call 5). In the logged view
 * it is what is logged: nothing logged is the bare grey track, and it
 * fills to the target. In the left view it is what is left: a full ring
 * with nothing logged, emptying as food is logged, and empty at the
 * target. A tap on the wheel then visibly changes it, where with one
 * drawing for both views only a number and a word changed.
 *
 * Past the target the first lap is full in the logged view and empty in
 * the left one; in both, what is over is the second lap
 * (`overshootFill`), which the wheel and the bars each draw in the deeper
 * shade. The week strip is not drawn from this: a past day only reads as
 * what was logged.
 *
 * It is one function because the wheel, the macros, the Details sheet and
 * the flight of a logged food have to agree. When one of them drew what
 * was left and another what was logged, the same protein was a 9% bar on
 * the page and an 89% bar in the sheet, one tap apart (Food10 call 1).
 */
export function ringFill(
  consumed: number,
  target: number,
  mode: CalorieRingMode
): number {
  if (!(target > 0)) return 0;
  const logged = consumed > 0 ? Math.min(consumed / target, 1) : 0;
  return mode === "left" ? 1 - logged : logged;
}

/**
 * The second lap: how far past the target the day is, as a share of the
 * target, 0 to 1 (more than one extra lap reads no differently). The same
 * in both views, drawn over the first lap in the deeper shade.
 */
export function overshootFill(consumed: number, target: number): number {
  if (!(target > 0) || !(consumed > target)) return 0;
  return Math.min((consumed - target) / target, 1);
}

/** How long the wheel's arc and the bars beside it take to move to the
 *  other view's fill when the switch is tapped, in seconds: with no
 *  wait, so the tap is answered at once, on Food and on Home alike. */
export const VIEW_SWITCH_SEC = 0.35;
