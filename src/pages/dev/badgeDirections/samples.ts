/**
 * The six badges the two directions are drawn for (DS4 call 4's prototype):
 * one per family and every tier, numbers from one figure to four and one
 * badge whose count is drawn rather than written.
 */
import { THEME } from "@/lib/theme";
import type { BadgeTier } from "@/features/streaks/badges";
import { mix } from "@/features/streaks/badgeArt/svg";

export type Family = "consistency" | "lifting" | "running" | "food" | "water";

export type SampleId =
  | "week_warrior"
  | "two_plate"
  | "first_5k"
  | "marathon"
  | "meal_prep_master"
  | "hydration_hero";

export interface Sample {
  id: SampleId;
  family: Family;
  tier: BadgeTier;
  /** The number the badge is for, in the art (§14m rule 27). */
  numeral?: string;
}

export const SAMPLES: readonly Sample[] = [
  { id: "week_warrior", family: "consistency", tier: "silver", numeral: "7" },
  { id: "two_plate", family: "lifting", tier: "gold" },
  { id: "first_5k", family: "running", tier: "bronze", numeral: "5K" },
  { id: "marathon", family: "running", tier: "platinum", numeral: "42.2" },
  {
    id: "meal_prep_master",
    family: "food",
    tier: "gold",
    numeral: "14",
  },
  { id: "hydration_hero", family: "water", tier: "silver", numeral: "7" },
];

export interface Hue {
  /** The token itself. */
  base: string;
  /** A step lighter, for a line lit on a dark ground. */
  light: string;
  /** A step deeper, for the shaded side of a form. */
  deep: string;
}

const BLACK = "#000000";
const WHITE = "#ffffff";

const hue = (base: string): Hue => ({
  base,
  light: mix(base, WHITE, 0.35),
  deep: mix(base, BLACK, 0.3),
});

/** One colour per family, the meaning it has everywhere else: purple is
 *  lifting and the brand (the streak flame is brand purple), coral
 *  running, orange food, teal water. */
export const FAMILY_HUE: Record<Family, Hue> = {
  consistency: hue(THEME.brand),
  lifting: hue(THEME.lifting),
  running: hue(THEME.running),
  food: hue(THEME.semantic.nutrition),
  water: hue(THEME.semantic.hydration),
};

export type BadgeState = "earned" | "locked";

export interface Direction {
  key: "enamel" | "drawn";
  name: string;
  /** One line on what the direction is. */
  summary: string;
  draw(sample: Sample, state: BadgeState): string;
}
