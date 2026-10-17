/**
 * How the run screens draw the GPS signal: how many of four bars are lit,
 * and in which colour. The screen that waits for a fix before a run and
 * the chip on the live map both read it, so the bars a runner saw while
 * waiting are the bars they see once running.
 *
 * The buckets themselves are useGPS's (`getSignalQuality`); this only
 * draws them.
 */
import type { GPSSignalQuality } from "@/hooks/useGPS";
import { THEME } from "@/lib/theme";

export interface GpsSignalBars {
  /** Bars lit, out of four. None while the first fix is awaited. */
  lit: 0 | 1 | 2 | 3 | 4;
  /** The lit bars' colour: fixed values, as the run screens are dark in
   *  both themes. */
  colour: string;
}

export function gpsSignalBars(quality: GPSSignalQuality): GpsSignalBars {
  switch (quality) {
    case "strong":
      return { lit: 4, colour: THEME.semantic.positive };
    case "good":
      return { lit: 3, colour: THEME.semantic.positive };
    case "fair":
      return { lit: 2, colour: THEME.warning };
    case "weak":
      return { lit: 1, colour: THEME.semantic.vitals };
    default:
      return { lit: 0, colour: THEME.semantic.vitals };
  }
}
