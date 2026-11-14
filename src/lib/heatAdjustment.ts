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
 * What a hot day does besides the line (Pgm8 (E8), kept by the owner, with
 * actions and still no number):
 *  - a quality session (a tempo, intervals, a time trial) is offered as an
 *    easy run of the same minutes (`isQualitySession`, `heatSwapLine`);
 *    the plan keeps its session, and the runner chooses;
 *  - a run started on a hot day is not judged on its pace afterwards
 *    (`HEAT_VERDICT_LINE`, plannedRunVerdict.ts): heat slows running at the
 *    same effort (Ely 2007, El Helou 2012; running-evidence.md §4.12), and
 *    the evidence says not to mark a hot-day run a miss.
 * None of it changes a pace, the runner's stored paces or the plan.
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

/** The heat line: what a hot day says before a run, wherever a run is
 *  started or looked at. No number in it. */
export const HEAT_LINE = "Hot today: run by feel, not by pace";

/** What the heat rule reads: the air temperature (°C) and the relative
 *  humidity (%), as `WeatherData` carries them. */
export interface HeatInput {
  temperature: number;
  humidity: number;
}

/** Hot by the T+DP rule: the air temperature plus the dew point, both in
 *  °F, over 130. The one test every heat surface uses. */
export function isHotDay(weather: HeatInput | null | undefined): boolean {
  if (!weather) return false;
  if (!Number.isFinite(weather.temperature)) return false;
  if (!Number.isFinite(weather.humidity)) return false;
  const fahrenheit = (c: number) => c * 1.8 + 32;
  const sumF =
    fahrenheit(weather.temperature) +
    fahrenheit(dewPointC(weather.temperature, weather.humidity));
  return sumF > HOT_OVER_F;
}

/** The heat line for this weather, or null when it isn't hot. */
export function heatLine(weather: HeatInput): string | null {
  return isHotDay(weather) ? HEAT_LINE : null;
}

/** The sessions run for their pace, which a hot day offers to swap for an
 *  easy run: a tempo (progressions and sharpeners among them) and an
 *  interval session (hills, fartlek and the time trial among them). An
 *  easy or long run is already run easy; a race is the race. */
export function isQualitySession(type: string | null | undefined): boolean {
  return type === "tempo" || type === "intervals";
}

/** The swap's words beside its button: an easy run of the minutes the
 *  session states (`plannedSessionMinutes`). The minutes are the session's
 *  own, not a pace and not an amount slower. */
export function heatSwapLine(minutes: number): string {
  return `Or run easy for the same ${Math.round(minutes)} min.`;
}

/** The swap's button where it starts the easy run (the launch card). */
export const HEAT_SWAP_START = "Run easy instead";

/** The swap's button where it changes the run being set up (the full
 *  setup, whose Start then starts it). */
export const HEAT_SWAP_SWITCH = "Switch to easy";

/** The run summary's pace line for a run started on a hot day, in place of
 *  a judgement of its pace (plannedRunVerdict.ts). No number in it, as the
 *  heat line before the run has none. */
export const HEAT_VERDICT_LINE =
  "Hot today, so this run goes by feel, not by pace.";
