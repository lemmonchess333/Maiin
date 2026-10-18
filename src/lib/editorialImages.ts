/**
 * Editorial imagery manifest (Social uplift v3, 2026-07-11).
 *
 * Reference-app conformance: the dominant apps (Runna, Strava, Nike
 * Run Club, Apple Fitness) all use athlete photography on EDITORIAL
 * surfaces — challenges, plans, curated content the brand produces —
 * while their peer activity feeds stay user-generated content. Tropos
 * follows the same line: photography here powers editorial cards; the
 * activity feed keeps user-data imagery (route scenes, muscle
 * figures). Recorded in GLOSSARY.md under "Editorial imagery".
 *
 * HOW TO ADD PHOTOS (operator): drop licensed images (Unsplash /
 * Pexels licence or owned) into `src/assets/editorial/` using the
 * stems below — see the README in that directory. Everything is
 * resolved at build time via import.meta.glob, so a missing file
 * simply resolves to null and the surface renders its designed
 * no-photo fallback (the ghosted-icon band). No code change needed
 * when assets land.
 */

const files = import.meta.glob<string>(
  "/src/assets/editorial/*.{webp,avif,jpg,jpeg,png}",
  { eager: true, query: "?url", import: "default" }
);

function byStem(stem: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const name = path.split("/").pop() ?? "";
    if (name.replace(/\.(webp|avif|jpe?g|png)$/i, "") === stem) return url;
  }
  return null;
}

/* Each challenge the server defines has its own photo, chosen by the id
   prefix its definition stamps (functions/lib/challengeDefs.js), and a
   seasonal one by its season's name, so no two challenge cards show the
   same photo (the owner, of photos shared by metric: "these are just
   recycled"). A challenge from anywhere else falls back, by metric, to
   the definition that measures the same thing. */
const CHALLENGE_STEM_BY_PREFIX: readonly (readonly [string, string])[] = [
  ["weekly-", "challenge-weekly"],
  ["strength-monthly-", "challenge-strength"],
  ["global-monthly-", "challenge-hybrid-hero"],
  ["monthly-", "challenge-mileage"],
  ["fastest-5k-", "challenge-fastest-5k"],
  ["group-goal-", "challenge-together"],
];

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

const FEATURED_CHALLENGE_STEM_BY_METRIC: Record<string, string> = {
  active_days: "challenge-active-days",
  training_minutes: "challenge-training-minutes",
};

const CHALLENGE_STEM_BY_METRIC: Record<string, string> = {
  total_km: "challenge-mileage",
  fastest_effort: "challenge-fastest-5k",
  total_volume: "challenge-weekly",
  workout_count: "challenge-weekly",
  hybrid_score: "challenge-hybrid-hero",
  ...FEATURED_CHALLENGE_STEM_BY_METRIC,
};

export interface EditorialChallenge {
  id: string;
  metric: string;
  name?: string;
}

/** The asset stem of a challenge's photo. */
export function challengeEditorialStem(challenge: EditorialChallenge): string {
  if (challenge.id.startsWith("featured-monthly-")) {
    const featured = FEATURED_CHALLENGE_STEM_BY_METRIC[challenge.metric];
    if (featured) return featured;
  }
  if (challenge.id.startsWith("seasonal-")) {
    const name = (challenge.name ?? "").toLowerCase();
    const season = SEASONS.find((s) => name.includes(s));
    if (season) return `challenge-season-${season}`;
  }
  const byPrefix = CHALLENGE_STEM_BY_PREFIX.find(([prefix]) =>
    challenge.id.startsWith(prefix)
  );
  if (byPrefix) return byPrefix[1];
  return CHALLENGE_STEM_BY_METRIC[challenge.metric] ?? "challenge-hybrid-hero";
}

/** Editorial photo URL for a challenge, or null when its licensed asset
 *  has not been added. */
export function challengeEditorialImage(
  challenge: EditorialChallenge
): string | null {
  return byStem(challengeEditorialStem(challenge));
}

/** Editorial photo URL for a community space (Spc1 PR2) — stems are
 *  `space-<spaceId>` per the spaceDefs contract, e.g.
 *  `space-womens-running.webp`. Null until the licensed asset lands
 *  (the directory card renders its tinted fallback band). */
export function spaceEditorialImage(spaceId: string): string | null {
  return byStem(`space-${spaceId}`);
}
