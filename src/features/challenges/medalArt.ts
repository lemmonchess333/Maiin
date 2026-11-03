/** A medal's metal (medals.ts `MedalTier`, spelled out here so the two
 *  modules do not import each other). */
type MedalTier = "bronze" | "silver" | "gold";

/**
 * Illustrated medals (Soc15), the seam the badges use (`BADGE_ART`,
 * docs/badges/ART_BRIEF.md): one Gemini illustration per challenge
 * DEFINITION and tier, never per edition. Every edition of a definition
 * (each month's Mileage, each week's Weekly Warrior) shares its three
 * images, and the edition ("NOV 2026") and the tier's goal ("50 km") are
 * always drawn in code over the art (MedalArt), so a new month never
 * needs a new image.
 *
 * Until a definition's art exists the procedural medal (MedalArt) is the
 * medal, as the lucide hexagon is a badge's until its WebP lands. To
 * light one up: run scripts/art/generate-medals.py (or make the art by
 * hand to docs/badges/MEDAL_ART_BRIEF.md), drop
 * `public/medals/<definition>-<tier>.webp`, and add
 * `"<definition>-<tier>"` to MEDAL_ART_KEYS below.
 *
 * Paths carry `import.meta.env.BASE_URL`, as BADGE_ART's do, so they
 * resolve on the web build (`/Maiin/`) and in the native shell (`/`).
 */

/**
 * The challenge definitions that award medals, as the server builds them
 * (functions/lib/challengeDefs.js `buildCurrentChallenges`), each named
 * once, whatever its edition. The community goal (`group-goal-…`) awards
 * none. Pinned against the server's catalogue and the generator's list by
 * medalArt.cross.test.ts.
 */
export const MEDAL_DEFINITIONS = [
  "weekly-warrior",
  "monthly-mileage",
  "strength-builder",
  "active-days",
  "training-minutes",
  "hybrid-hero",
  "fastest-5k",
  "spring-reset",
  "summer-shred",
  "autumn-push",
  "winter-bulk",
] as const;

export type MedalDefinition = (typeof MEDAL_DEFINITIONS)[number];

/** The season a seasonal edition belongs to, by the UTC month it starts
 *  in (challengeDefs.js `seasonStartUTC`: March, June, September,
 *  December). */
const SEASON_BY_START_MONTH: Readonly<Record<string, MedalDefinition>> = {
  "03": "spring-reset",
  "06": "summer-shred",
  "09": "autumn-push",
  "12": "winter-bulk",
};

/**
 * Which definition an edition is, from the id prefix the server stamps
 * on it and, for the two that rotate, its metric (the featured month) or
 * the month it starts (the season). Null for anything else, which keeps
 * the procedural medal.
 */
export function medalDefinition(medal: {
  challengeId: string;
  metric: string;
  startDate: string;
}): MedalDefinition | null {
  const id = medal.challengeId;
  if (id.startsWith("weekly-")) return "weekly-warrior";
  if (id.startsWith("monthly-")) return "monthly-mileage";
  if (id.startsWith("strength-monthly-")) return "strength-builder";
  if (id.startsWith("global-monthly-")) return "hybrid-hero";
  if (id.startsWith("fastest-5k-")) return "fastest-5k";
  if (id.startsWith("featured-monthly-")) {
    if (medal.metric === "active_days") return "active-days";
    if (medal.metric === "training_minutes") return "training-minutes";
    return null;
  }
  if (id.startsWith("seasonal-")) {
    return SEASON_BY_START_MONTH[medal.startDate.slice(5, 7)] ?? null;
  }
  return null;
}

/**
 * The definitions and tiers whose art is committed under public/medals/,
 * as `<definition>-<tier>`. Empty until the art is generated: the
 * procedural medal stands in for every one.
 */
const MEDAL_ART_KEYS: readonly `${MedalDefinition}-${MedalTier}`[] = [];

export const MEDAL_ART: Readonly<Record<string, string>> = Object.fromEntries(
  MEDAL_ART_KEYS.map((key) => [
    key,
    `${import.meta.env.BASE_URL}medals/${key}.webp`,
  ])
);

/** A medal's illustration, when its definition and tier have one. */
export function medalArtFor(
  medal: {
    challengeId: string;
    metric: string;
    startDate: string;
    tier: MedalTier;
  },
  art: Readonly<Record<string, string>> = MEDAL_ART
): string | undefined {
  const definition = medalDefinition(medal);
  return definition ? art[`${definition}-${medal.tier}`] : undefined;
}
