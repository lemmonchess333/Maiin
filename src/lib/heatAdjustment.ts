/**
 * The heat line before a run (Pgm8 (E8), which replaced roadmap B2's
 * heat half): on a hot day, one line saying to run by feel; on any other
 * day, nothing.
 *
 * The line carries no number: no %, no equivalent pace. Nothing gives
 * pace slopes for training runs, and the race-pace evidence is weak
 * (docs/training-engine-2026-10/running-evidence.md §4.12; Pgm8's E8).
 * The plan's paces never change: the line takes no pace and gives none,
 * and it claims nothing beyond running by feel.
 *
 * Hot comes from the temperature + dew point ("T+DP") rule of thumb used
 * across distance-running coaching: add the air temperature and the dew
 * point, both in °F, and read the slowdown at equal effort from its
 * table. Hot is the table's bands of 3% and over, a sum over 130°F. It
 * is a published rule of thumb, labelled as one here: not physiology,
 * and not a Tropos invention. The table as this module quoted it before
 * Pgm8 (sum in °F up to → % slower): 110 → 0.5, 120 → 1, 130 → 2,
 * 140 → 3, 150 → 4.5, 160 → 6, 170 → 8, 180 → 10; past 180, effort only.
 *
 * `getRunningTip` (weather.ts) leaves heat to this line, so a hot day has
 * one heat line, not two.
 *
 * Altitude, B2's other half, is not here: it needs an elevation the
 * person declares to be honest (GPS elevation is noisy).
 *
 * Pure: no fetches, no clock. Callers pass the WeatherData they have.
 */

/** Magnus-formula dew point, °C, from temp (°C) + relative humidity (%). */
export function dewPointC(tempC: number, humidityPct: number): number {
  const rh = Math.min(100, Math.max(1, humidityPct));
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return (b * gamma) / (a - gamma);
}

/** Hot: a T+DP sum over this, °F, the table's bands of 3% and over. A
 *  published rule of thumb, not physiology. */
const HOT_OVER_F = 130;

const HEAT_LINE = "Hot today: run by feel, not by pace";

/** The heat line for this weather, or null when it isn't hot. */
export function heatLine(weather: {
  temperature: number;
  humidity: number;
}): string | null {
  const fahrenheit = (c: number) => c * 1.8 + 32;
  const sumF =
    fahrenheit(weather.temperature) +
    fahrenheit(dewPointC(weather.temperature, weather.humidity));
  return sumF > HOT_OVER_F ? HEAT_LINE : null;
}
