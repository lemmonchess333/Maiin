/**
 * The finish screens' way into Food (FOOD-02; App1 Q30, 13 November 2026:
 * a finished lift gets what a finished run gets). Both finish screens open
 * the food log with the sport they finished, and Food frames its composer
 * with one refuel line for it. The address is spelled here once, so the
 * link and the page that reads it cannot drift apart.
 */
export type RecoverySport = "lift" | "run";

/** Where "Log recovery food" goes after a session of this sport. */
export function recoveryFoodPath(sport: RecoverySport): string {
  return `/food?context=post-${sport}`;
}

/** The sport a visit to Food came from a finish screen for, if it did. */
export function recoverySportOf(context: string | null): RecoverySport | null {
  if (context === "post-run") return "run";
  if (context === "post-lift") return "lift";
  return null;
}
