import type { BadgeTier } from "./badges";
import { THEME } from "@/lib/theme";

/**
 * The four tier metals as three-stop palettes (rim edge, base, highlight)
 * plus the ink that reads on each — shared by the badge hexagon
 * (BadgeHex) and the seal a new badge arrives in (BadgeSeal). Data only,
 * so both component files stay fast-refresh clean.
 */
export interface Palette {
  edge: string;
  base: string;
  highlight: string;
  icon: string;
}

export const TIER_PALETTES: Record<BadgeTier, Palette> = {
  bronze: {
    edge: "#7a3d0e",
    base: THEME.tier.bronze,
    highlight: "#f4b07a",
    icon: "#ffffff",
  },
  silver: {
    edge: "#6e6e6e",
    base: THEME.tier.silver,
    highlight: "#ffffff",
    icon: "#3a3a3a",
  },
  gold: {
    edge: "#a8740a",
    base: THEME.tier.gold,
    highlight: "#fff6c7",
    icon: "#4a2c00",
  },
  platinum: {
    edge: "#8a8a8a",
    base: THEME.tier.platinum,
    highlight: "#ffffff",
    icon: "#3a3a3a",
  },
};
