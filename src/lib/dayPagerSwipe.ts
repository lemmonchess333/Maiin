/**
 * Shared swipe maths for the Programme inner day-pagers (Lift + Run).
 *
 * Both the Lift session-swiper (Program.tsx) and the Run week-swiper
 * (ProgrammeRunSection.tsx) resolve a horizontal swipe to a day delta with
 * the SAME thresholds, so the two surfaces can't drift apart (the
 * "tested copy vs running copy" rule). Pure + unit-tested here; the
 * components only wire the touch refs and apply the delta.
 *
 * Pairs with useSwipeNavigation (the OUTER tab pager): when this returns 0
 * because the pager is already at its boundary in the swipe direction, the
 * outer nav reads the `data-swipe-at-start` / `data-swipe-at-end` attributes
 * and hands the gesture off to a tab change (iOS nested-pager behaviour).
 */
export const DAY_PAGER_MIN_PX = 50;
export const DAY_PAGER_DIR_RATIO = 1.5; // |dx| must exceed |dy| * this

/**
 * Resolve an inner day-pager swipe to a clamped step:
 *   +1 → next day, -1 → previous day, 0 → no change (too small / vertical /
 *   already at the boundary in that direction).
 */
export function resolveDayPagerDelta(
  dx: number,
  dy: number,
  index: number,
  count: number
): -1 | 0 | 1 {
  if (
    Math.abs(dx) <= DAY_PAGER_MIN_PX ||
    Math.abs(dx) <= Math.abs(dy) * DAY_PAGER_DIR_RATIO
  ) {
    return 0; // not a deliberate horizontal swipe
  }
  if (dx < 0 && index < count - 1) return 1; // swipe left → next
  if (dx > 0 && index > 0) return -1; // swipe right → previous
  return 0; // at the boundary in this direction — let the outer nav take over
}
