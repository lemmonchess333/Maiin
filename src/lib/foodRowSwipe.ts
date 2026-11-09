/**
 * Where a food row's swipe settles when the finger lifts: open on its
 * Delete panel, or closed. It reads where the row is and how fast it was
 * moving, not how far this one drag travelled: from distance alone a slow
 * 40 px drag counted as "closed", left the row at -40 with red showing
 * (nothing animated, as the state had not changed), and nudging an open
 * row further left closed it.
 *
 * `position` is the row's x (0 closed, negative open); `velocity` is the
 * release speed in px/s, negative leftwards. A flick decides by its
 * direction; otherwise the row goes where it would coast to.
 */
export function swipeSettlesOpen(
  position: number,
  velocity: number,
  openThreshold: number
): boolean {
  const FLICK = 500;
  if (velocity < -FLICK) return true;
  if (velocity > FLICK) return false;
  return position + velocity * 0.15 < openThreshold;
}
