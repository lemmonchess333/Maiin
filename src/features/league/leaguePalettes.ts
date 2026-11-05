import { THEME } from "@/lib/theme";
import { TIER_PALETTES, type Palette } from "@/features/streaks/tierPalettes";
import type { LeagueTier } from "./leagueRules";

/**
 * The five league tiers as three-stop metals (rim edge, base, highlight)
 * plus the ink that reads on each, for the drawn tier badge. Bronze to
 * Platinum are the badges' own (TIER_PALETTES), so a Gold league and a
 * gold badge are one gold. Diamond, the leagues' alone, is the brand's
 * purple ramp, pale like the other metals: the palette is closed
 * (DESIGN_GUIDE §0), and the streak flame's tiers already rise through
 * the same ramp (flameTiers.ts). Data only, as tierPalettes.ts is, and
 * eslint's PALETTE_TABLES keeps a hex literal out of it.
 */
export const LEAGUE_PALETTES: Record<LeagueTier, Palette> = {
  bronze: TIER_PALETTES.bronze,
  silver: TIER_PALETTES.silver,
  gold: TIER_PALETTES.gold,
  platinum: TIER_PALETTES.platinum,
  diamond: {
    edge: THEME.purpleRamp[500],
    base: THEME.purpleRamp[200],
    highlight: THEME.purpleRamp[50],
    icon: THEME.purpleRamp[700],
  },
};

/**
 * Each tier's light: the one colour the card's bar, the page's glow and
 * the reveal's rays are drawn in. Bronze to Platinum are the badges'
 * metals (THEME.tier); Diamond's is a mid step of the brand's purple ramp,
 * which reads on the light card and the dark stage alike.
 */
export const LEAGUE_LIGHT: Record<LeagueTier, string> = {
  ...THEME.tier,
  diamond: THEME.purpleRamp[400],
};
