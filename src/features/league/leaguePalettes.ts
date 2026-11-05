import { THEME } from "@/lib/theme";
import { TIER_PALETTES, type Palette } from "@/features/streaks/tierPalettes";
import type { LeagueTier } from "./leagueRules";

/**
 * The five league tiers as three-stop metals (rim edge, base, highlight)
 * plus the ink that reads on each, for the drawn tier badge. Bronze to
 * Platinum are the badges' own (TIER_PALETTES), so a Gold league and a
 * gold badge are one gold; Diamond is the leagues' alone, built on
 * THEME.tier.diamond. Data only, as tierPalettes.ts is.
 */
export const LEAGUE_PALETTES: Record<LeagueTier, Palette> = {
  bronze: TIER_PALETTES.bronze,
  silver: TIER_PALETTES.silver,
  gold: TIER_PALETTES.gold,
  platinum: TIER_PALETTES.platinum,
  diamond: {
    edge: "#2f7f99",
    base: THEME.tier.diamond,
    highlight: "#f2fcff",
    icon: "#0d4456",
  },
};
