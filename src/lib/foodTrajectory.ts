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
 *
 * @unwired: the trajectory line is SUPPRESSED on the Food hero card, not
 *   removed — `FoodHeroCard.tsx` sets `trajectoryLabel = null` with a note
 *   on how to reinstate it (import this and pass its result). Kept as cheap
 *   optionality for a decision that may be revisited.
 *
 *   Recorded HERE because the reason previously lived only at the call site.
 *   A reachability sweep reads the module, finds no consumer, and cannot
 *   tell a suppressed feature from rot — which is how deliberate work gets
 *   deleted. If the suppression becomes permanent, delete this and its
 *   test; don't leave it half-true.
 */

export function computeTrajectory(
  consumed: number,
  target: number,
  now: Date = new Date()
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

  const formatted = magnitude.toLocaleString();
  return diff > 0 ? `${formatted} ahead of pace` : `${formatted} behind pace`;
}
