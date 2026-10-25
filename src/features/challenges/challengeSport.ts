import { THEME } from "@/lib/theme";

/**
 * Which sport a challenge belongs to, read from its metric, and the colour
 * that follows from it. A challenge card wears its sport: coral for a
 * running challenge, purple for a lifting one, and the brand purple for a
 * mixed or time challenge, which counts either sport. That colour is the
 * hero band, the icon, the Join button and the progress bar's fill.
 *
 * The tier metals (bronze, silver, gold) are never the fill. A bronze bar
 * beside purple and coral read as the food orange, and silver and gold
 * all but vanish on a light card. The metal belongs to the tier's marker
 * and badge, as a ring, the way the leaderboard rings its ranks.
 */
export type ChallengeSport = "running" | "lifting" | "mixed";

/** Every metric the challenges use, placed. `challengeSport.test.tsx`
 *  checks the server's challenge definitions against it. */
export const METRIC_SPORT: Readonly<Record<string, ChallengeSport>> = {
  total_km: "running",
  fastest_effort: "running",
  total_volume: "lifting",
  workout_count: "lifting",
  hybrid_score: "mixed",
  active_days: "mixed",
  training_minutes: "mixed",
};

/** The challenge's sport. A metric this table does not know counts as
 *  mixed, so a new one draws in the brand purple until it is placed. */
export function challengeSport(metric: string): ChallengeSport {
  return Object.hasOwn(METRIC_SPORT, metric) ? METRIC_SPORT[metric] : "mixed";
}

/** The sport's colour as a value, for the tints and gradients a class
 *  cannot express. Lifting and the brand are one purple. */
export const SPORT_ACCENT: Readonly<Record<ChallengeSport, string>> = {
  running: THEME.running,
  lifting: THEME.lifting,
  mixed: THEME.brand,
};

/** The progress bar's fill, as a token class. Each clears 3:1 against the
 *  bar's `bg-muted` track in both themes (`tokenContrast.test.ts`). */
export const SPORT_BAR_FILL: Readonly<Record<ChallengeSport, string>> = {
  running: "bg-running",
  lifting: "bg-lifting",
  mixed: "bg-primary",
};
