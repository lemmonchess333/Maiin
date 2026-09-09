/**
 * Editorial imagery manifest (Social uplift v3, 2026-07-11).
 *
 * Reference-app conformance: the dominant apps (Runna, Strava, Nike
 * Run Club, Apple Fitness) all use athlete photography on EDITORIAL
 * surfaces — challenges, plans, curated content the brand produces —
 * while their peer activity feeds stay user-generated content. Tropos
 * follows the same line: photography here powers editorial cards; the
 * activity feed keeps user-data imagery (route scenes, muscle
 * figures). Recorded in CONTEXT.md under "Editorial imagery".
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

/* Challenge metric → asset stem. Sport-coded like everything else:
   run metrics share the runner shot, lift metrics the lifting shot,
   hybrid (and any future unknown metric) the general shot. */
const CHALLENGE_STEM: Record<string, string> = {
  total_km: "challenge-run",
  fastest_effort: "challenge-run",
  total_volume: "challenge-lift",
  workout_count: "challenge-lift",
  hybrid_score: "challenge-hybrid",
};

/** Editorial photo URL for a challenge metric, or null when no
 *  licensed asset has been added yet. */
export function challengeEditorialImage(metric: string): string | null {
  return byStem(CHALLENGE_STEM[metric] ?? "challenge-hybrid");
}

/** Editorial photo URL for a community space (Spc1 PR2) — stems are
 *  `space-<spaceId>` per the spaceDefs contract, e.g.
 *  `space-womens-running.webp`. Null until the licensed asset lands
 *  (the directory card renders its tinted fallback band). */
export function spaceEditorialImage(spaceId: string): string | null {
  return byStem(`space-${spaceId}`);
}
