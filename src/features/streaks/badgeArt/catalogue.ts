/**
 * What each of the 30 badges is drawn as (DS4 call 4): its family, which
 * gives its colour; the sign drawn on it; and the number it is for, in the
 * art, when it is for a count or a distance (DESIGN_GUIDE §14m rule 27).
 *
 * A series shares its sign and its number tells its badges apart: the
 * streak flame for every streak, the route for every distance, plates for
 * every plate club. A plate club's number is drawn as plates rather than
 * written, so it holds in kilograms and in pounds (Lift18). Every badge
 * outside a series has a sign of its own.
 *
 * Pictures only: the names, tiers and descriptions are badges.ts's and the
 * rules the server's (functions/lib/badgeRules.js).
 */
import type { BadgeDef } from "../badges";

/** The colour a badge's art is drawn in. Purple is lifting and the brand,
 *  and the streak flame is brand purple, so consistency is purple too;
 *  coral running, orange food, teal water; gold a new best and nothing
 *  else. A hybrid badge is drawn in the colours of what it combines. */
export type ArtFamily =
  "consistency" | "lifting" | "best" | "running" | "food" | "water" | "hybrid";

export type SignId =
  | "step"
  | "flame"
  | "sunrise"
  | "bestLift"
  | "plates1"
  | "plates2"
  | "plates3"
  | "plan"
  | "route"
  | "bolt"
  | "macros"
  | "egg"
  | "plateSetting"
  | "drop"
  | "liftAndRun"
  | "fiveAndFive"
  | "week3and3"
  | "threeRings"
  | "hexes";

export interface BadgeArtSpec {
  family: ArtFamily;
  /** The sign drawn on it. A number with a unit has none: the two fill
   *  the face. */
  sign?: SignId;
  /** The figure, in the display cut. */
  numeral?: string;
  /** Its unit, under the figure ("km", "t"). */
  unit?: string;
}

export const BADGE_ART_SPECS: Record<BadgeDef["id"], BadgeArtSpec> = {
  // Consistency
  first_step: { family: "consistency", sign: "step" },
  three_day: { family: "consistency", sign: "flame", numeral: "3" },
  week_warrior: { family: "consistency", sign: "flame", numeral: "7" },
  two_week: { family: "consistency", sign: "flame", numeral: "14" },
  month_master: { family: "consistency", sign: "flame", numeral: "30" },
  two_month: { family: "consistency", sign: "flame", numeral: "60" },
  century_club: { family: "consistency", sign: "flame", numeral: "100" },
  year_long: { family: "consistency", sign: "flame", numeral: "365" },
  // Five mornings, but a "5" beside a sunrise reads as five o'clock.
  early_bird: { family: "consistency", sign: "sunrise" },
  // Lifting
  first_pr: { family: "best", sign: "bestLift" },
  plate_club: { family: "lifting", sign: "plates1" },
  two_plate: { family: "lifting", sign: "plates2" },
  three_plate: { family: "lifting", sign: "plates3" },
  programme_complete: { family: "lifting", sign: "plan" },
  tonnage_100: { family: "lifting", numeral: "100", unit: "t" },
  // Running
  first_5k: { family: "running", sign: "route", numeral: "5K" },
  "10k_club": { family: "running", sign: "route", numeral: "10K" },
  half_marathon: { family: "running", sign: "route", numeral: "21.1" },
  marathon: { family: "running", sign: "route", numeral: "42.2" },
  speed_demon: { family: "running", sign: "bolt", numeral: "5:00" },
  century_km: { family: "running", numeral: "100", unit: "km" },
  // Food and water
  macro_master: { family: "food", sign: "macros" },
  protein_pro: { family: "food", sign: "egg", numeral: "7" },
  hydration_hero: { family: "water", sign: "drop", numeral: "7" },
  meal_prep_master: { family: "food", sign: "plateSetting", numeral: "14" },
  // Hybrid
  hybrid_athlete: { family: "hybrid", sign: "liftAndRun" },
  balanced: { family: "hybrid", sign: "fiveAndFive" },
  iron_runner: { family: "hybrid", sign: "week3and3" },
  triple_threat: { family: "hybrid", sign: "threeRings" },
  ultimate_athlete: { family: "hybrid", sign: "hexes", numeral: "15" },
};
