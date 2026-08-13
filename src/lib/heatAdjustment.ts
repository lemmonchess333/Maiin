/**
 * Heat pace adjustment (roadmap B2, heat half) — DISPLAY + explanation,
 * never a silent rewrite of the prescription.
 *
 * Model: the widely-published temperature + dew point heuristic (the
 * "T+DP" table used across distance-running coaching): sum air
 * temperature and dew point in °F, read a %-slower-at-equal-effort band.
 * Dew point comes from temperature + relative humidity via the Magnus
 * approximation. This is a published rule-of-thumb, labelled as such in
 * the copy — not a physiology claim and not a Tropos invention.
 *
 * Register rules:
 *  - The plan's paces are NEVER changed by weather. The adjustment is a
 *    displayed equivalent ("in this heat, X effort ≈ Y pace") with the
 *    why in the same line.
 *  - Below the first band the module is silent (null) — cool weather
 *    needs no caveat.
 *  - In the extreme band the honest advice is effort, not pace — the
 *    line says so instead of pretending precision.
 *
 * Altitude (the other half of B2) is deliberately NOT here — it needs a
 * user-declared elevation input to be honest (GPS elevation is noisy),
 * which is its own slice.
 *
 * Pure: no fetches, no clock — callers pass the WeatherData they have.
 */
import { paceMinSec } from "./runLabels";
import { paceUnitLabel, type DistanceUnit } from "./distanceUnits";

/** Magnus-formula dew point, °C, from temp (°C) + relative humidity (%). */
export function dewPointC(tempC: number, humidityPct: number): number {
  const rh = Math.min(100, Math.max(1, humidityPct));
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return (b * gamma) / (a - gamma);
}

/** The published T+DP bands: [threshold on tempF + dewPointF, % slower]. */
const TDP_BANDS: Array<[number, number]> = [
  [110, 0.005],
  [120, 0.01],
  [130, 0.02],
  [140, 0.03],
  [150, 0.045],
  [160, 0.06],
  [170, 0.08],
  [180, 0.1],
];
/** At/below this T+DP sum, heat costs nothing measurable. */
const TDP_QUIET = 100;

export interface HeatAdjustment {
  /** Fractional pace slowdown at equal effort (0.03 = ~3% slower). */
  pct: number;
  /** Dew point, °C (rounded for display). */
  dewPointC: number;
  /** True in the top band, where pacing precision is dishonest — run by
   *  effort. */
  effortOnly: boolean;
}

export function heatPaceAdjustment(weather: {
  temperature: number;
  humidity: number;
}): HeatAdjustment | null {
  const dp = dewPointC(weather.temperature, weather.humidity);
  const sumF = weather.temperature * 1.8 + 32 + (dp * 1.8 + 32);
  if (sumF <= TDP_QUIET) return null;
  let pct = TDP_BANDS[TDP_BANDS.length - 1][1];
  for (const [limit, bandPct] of TDP_BANDS) {
    if (sumF <= limit) {
      pct = bandPct;
      break;
    }
  }
  return {
    pct,
    dewPointC: Math.round(dp),
    effortOnly: sumF > 180,
  };
}

/** A prescribed pace's equal-effort equivalent in this heat, s/km. */
export function heatAdjustedPaceS(paceS: number, adj: HeatAdjustment): number {
  return Math.round(paceS * (1 + adj.pct));
}

/**
 * The one display line. With a prescribed pace it shows the concrete
 * equal-effort equivalent; without one it stays generic. Either way the
 * prescription itself is stated as unchanged.
 */
export function heatAdjustmentLine(
  adj: HeatAdjustment,
  unit: DistanceUnit,
  prescribedPaceS?: number
): string {
  if (adj.effortOnly) {
    return `Serious heat (dew point ${adj.dewPointC}°C) — pace targets stop meaning much today; run by effort (published heat curves).`;
  }
  const pctLabel = `~${adj.pct * 100 >= 1 ? Math.round(adj.pct * 100) : adj.pct * 100}%`;
  if (prescribedPaceS && prescribedPaceS > 0) {
    return `In this heat, ${paceMinSec(prescribedPaceS, unit)}${paceUnitLabel(unit)} effort runs ≈ ${paceMinSec(heatAdjustedPaceS(prescribedPaceS, adj), unit)}${paceUnitLabel(unit)} (dew point ${adj.dewPointC}°C, published heat curves). Your plan's paces are unchanged.`;
  }
  return `Heat check: expect ${pctLabel} slower at the same effort today (dew point ${adj.dewPointC}°C, published heat curves). Your plan's paces are unchanged.`;
}
