import { THEME } from "@/lib/theme";

/**
 * The streak flame's tiers (`StreakFlame`), as data so the component file
 * stays fast-refresh clean and the table can be tested on its own.
 *
 * The flame is brand purple, and its tier says how long the streak has
 * run: each tier is a step further down the brand purple ramp, and at 100
 * days the flame's heart turns the platinum of the top badge tier. Gold is
 * not here: it means a new best and nothing else.
 *
 * Every colour is a THEME token. `eslint.config.js` lists this file in
 * PALETTE_TABLES, where any hex literal is an error, and
 * `flameTiers.test.ts` holds the table to the ramp.
 */

/** One flame's four colours: the body and the inner core, each a gradient
 *  from its base (the deeper step) up to its tip. */
export interface FlamePalette {
  bodyBase: string;
  bodyTip: string;
  coreBase: string;
  coreTip: string;
}

export interface FlameTier {
  /** The shortest streak, in days, that shows this tier. */
  minDays: number;
  palette: FlamePalette;
}

const RAMP = THEME.purpleRamp;

/** Shortest first. */
export const FLAME_TIERS: readonly FlameTier[] = [
  {
    minDays: 1,
    palette: {
      bodyBase: RAMP[500],
      bodyTip: RAMP[400],
      coreBase: RAMP[200],
      coreTip: RAMP[50],
    },
  },
  {
    minDays: 7,
    palette: {
      bodyBase: RAMP[600],
      bodyTip: RAMP[500],
      coreBase: RAMP[400],
      coreTip: RAMP[100],
    },
  },
  {
    minDays: 30,
    palette: {
      bodyBase: RAMP[700],
      bodyTip: RAMP[600],
      coreBase: RAMP[500],
      coreTip: RAMP[200],
    },
  },
  {
    minDays: 100,
    palette: {
      bodyBase: RAMP[700],
      bodyTip: RAMP[600],
      coreBase: THEME.tier.platinum,
      coreTip: THEME.tier.platinum,
    },
  },
];

/** The palette for a streak of `days` (a streak under a day draws no
 *  flame, so it reads as the first tier). */
export function flamePaletteFor(days: number): FlamePalette {
  let tier = FLAME_TIERS[0];
  for (const t of FLAME_TIERS) if (days >= t.minDays) tier = t;
  return tier.palette;
}
