/**
 * Computes the "on pace" trajectory label for the Food hero card.
 *
 * Linear pace model: expected intake at time T = target × (hours_elapsed / 24).
 * Compares actual consumed to that pace and returns a short descriptor.
 *
 * Suppressed before 9am and after 9pm so we don't tell users they're
 * "behind pace" first thing in the morning or last thing at night.
 *
 * Known v1 limitation: computed once per render from `now`. If the user keeps
 * the page open across the 9am/9pm boundary, the line only refreshes on the
 * next data change or mount. Acceptable because the window is wide.
 */

export function computeTrajectory(
  consumed: number,
  target: number,
  now: Date = new Date(),
): string | null {
  if (target <= 0) return null;

  const hour = now.getHours();
  if (hour < 9 || hour >= 21) return null;

  const hoursElapsed = hour + now.getMinutes() / 60;
  const expected = target * (hoursElapsed / 24);
  const diff = consumed - expected;

  // Within ±5% of pace → "On pace"
  if (Math.abs(diff) / target < 0.05) return "On pace";

  const magnitude = Math.round(Math.abs(diff) / 10) * 10;
  if (magnitude === 0) return "On pace";

  return diff > 0 ? `${magnitude} ahead` : `${magnitude} behind`;
}
