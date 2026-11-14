import type { PaceInsight } from "@/lib/runPaces";

/**
 * Who may take the new paces a run offers (owner, 13 November 2026: "If
 * it's a good additional feature it should be moved into pro", which
 * narrows Run24 call 4's "for every account").
 *
 * - Faster paces are Pro: the plan keeping up with a runner who is getting
 *   fitter is the adaptive part, the part Runna and Strava charge for.
 * - Slower paces stay free: targets a runner cannot hold are a wrong plan,
 *   not a feature (deep dive D4: in plan G the frozen interval pace became
 *   faster than the detrained runner could hold in 5 sessions).
 *
 * A free account still sees a faster offer, with what it would change, and
 * Pro is one tap away; Settings' continuous insight stays Pro (§10).
 */
export function paceUpdateLocked(
  direction: PaceInsight["direction"],
  isPro: boolean
): boolean {
  return !isPro && direction === "faster";
}

/** Where a locked pace offer goes: the Pro page, counted as `paces`. */
export const PACE_UPDATE_UPGRADE_PATH = "/upgrade?from=paces";
