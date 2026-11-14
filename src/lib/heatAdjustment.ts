/**
 * Heat: what a hot day changes about a run (Pgm8 (E8), superseded by the
 * owner after Runna's Adapt for Heat). On a hot day a planned run can be
 * adjusted for heat before it starts. The adjustment is offered, never
 * applied by itself, and it is for that run only: it changes neither the
 * plan nor the runner's stored paces, and it can be cleared before the
 * start, which gives back the session as planned.
 *
 * How much, from the temperature + dew point ("T+DP") rule of thumb that
 * distance coaches publish (Mark Hadley's table): add the air temperature
 * and the dew point, both in °F, and read the slowdown at the same effort.
 *
 *   T+DP (°F)   slower      T+DP (°F)   slower
 *   100 or less none        141–150     3–4.5%
 *   101–110     0–0.5%      151–160     4.5–6%
 *   111–120     0.5–1%      161–170     6–8%
 *   121–130     1–2%        171–180     8–10%
 *   131–140     2–3%        over 180    hard running not recommended
 *
 * It is a published rule of thumb, labelled as one wherever it shows, not
 * physiology: the research agrees on the direction and the size (Ely 2007,
 * 1.7% off at 5–10 °C WBGT to 4.5% off at 20–25 °C for the top men, and
 * more for slower runners; El Helou 2012; Mantzios 2022;
 * docs/training-engine-2026-10/running-evidence.md §4.12), but gives no
 * slopes for training paces, so the numbers are the rule's. Each band is
 * shown as a range of paces, never as one pace.
 *
 * When: hot is a sum over 130 °F, the 2–3% band and up (`HOT_OVER_F`, a
 * Tropos heuristic): below it the rule's slowdown is 2% or less, within
 * the post-run verdict's ±10 s/km on-target allowance at most training
 * paces, so there is nothing worth offering. Over 180 °F is extreme: the
 * table says hard running is not recommended, so the app says running
 * outside isn't advised, the adjustment drops the pace targets (effort
 * only), and the run can still be started.
 *
 * What an adjustment changes, for the one run (`heatEasedPaceTable`):
 *  - a tempo's or an interval session's paces slow by the band, its work
 *    pace shown as a range;
 *  - an easy or long run's easy band slows, so the run screen's easy limit
 *    is slower;
 *  - with a live heart-rate source and a measured max heart rate, an easy,
 *    long or tempo run is held under a heart-rate ceiling instead
 *    (`heatHeartRateCeiling`) while beats arrive, and its eased paces apply
 *    when none do. Interval repeats keep their eased paces: heart rate lags
 *    on short repeats (running-evidence.md §4.13).
 * Beside it, two swaps: a tempo or interval session for an easy run of
 * the same minutes, and a structured long run (a race-pace finish or
 * race-pace blocks) for an easy long run of the same distance.
 *
 * Afterwards, a run started on a hot day is never judged slow
 * (plannedRunVerdict.ts): the evidence says not to mark a hot day's run a
 * miss.
 *
 * Today's coolest hour is not offered: the weather the app reads
 * (weather.ts, MET Norway through the getCurrentWeather callable) is the
 * current hour only, with no hourly forecast.
 *
 * Altitude, roadmap B2's other half, is not here: it needs an elevation
 * the person declares to be honest (GPS elevation is noisy).
 *
 * Pure: no fetches, no clock. Callers pass the WeatherData they have.
 */
import type { PaceBand, PaceTable } from "./runPaces";
import type { RaceTarget } from "./racePace";
import { targetZoneForRun } from "./hrZones";

/** Magnus-formula dew point, °C, from temp (°C) + relative humidity (%). */
export function dewPointC(tempC: number, humidityPct: number): number {
  const rh = Math.min(100, Math.max(1, humidityPct));
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return (b * gamma) / (a - gamma);
}

/** What the heat rule reads: the air temperature (°C) and the relative
 *  humidity (%), as `WeatherData` carries them. */
export interface HeatInput {
  temperature: number;
  humidity: number;
}

/** The air temperature plus the dew point, both in °F, or null when the
 *  weather can't be read. */
export function tdpSumF(weather: HeatInput | null | undefined): number | null {
  if (!weather) return null;
  if (!Number.isFinite(weather.temperature)) return null;
  if (!Number.isFinite(weather.humidity)) return null;
  const fahrenheit = (c: number) => c * 1.8 + 32;
  return (
    fahrenheit(weather.temperature) +
    fahrenheit(dewPointC(weather.temperature, weather.humidity))
  );
}

/** How much slower the same effort runs, as a range of shares: 0.02 to
 *  0.03 is 2–3% slower. */
export interface HeatSlowdown {
  from: number;
  to: number;
}

/** Hadley's T+DP table: each band's top (°F) and its slowdown. A published
 *  rule of thumb. */
export const TDP_TABLE: ReadonlyArray<{ upToF: number } & HeatSlowdown> = [
  { upToF: 100, from: 0, to: 0 },
  { upToF: 110, from: 0, to: 0.005 },
  { upToF: 120, from: 0.005, to: 0.01 },
  { upToF: 130, from: 0.01, to: 0.02 },
  { upToF: 140, from: 0.02, to: 0.03 },
  { upToF: 150, from: 0.03, to: 0.045 },
  { upToF: 160, from: 0.045, to: 0.06 },
  { upToF: 170, from: 0.06, to: 0.08 },
  { upToF: 180, from: 0.08, to: 0.1 },
];

/** Hot: a T+DP sum over this, °F, where the 2–3% band starts. A Tropos
 *  heuristic on the published table (see the header). */
export const HOT_OVER_F = 130;

/** Extreme: over this the table gives no number, only that hard running
 *  is not recommended. */
export const EXTREME_OVER_F = 180;

/** The table's slowdown for a T+DP sum, or null past its end (over
 *  180 °F), where it gives none. Bands include their top, as the table
 *  reads ("131–140"). */
export function heatSlowdown(sumF: number): HeatSlowdown | null {
  if (!Number.isFinite(sumF)) return null;
  for (const band of TDP_TABLE) {
    if (sumF <= band.upToF) return { from: band.from, to: band.to };
  }
  return null;
}

export type HeatLevel = "none" | "hot" | "extreme";

/** Hot, extreme, or neither, for this weather. */
export function heatLevel(weather: HeatInput | null | undefined): HeatLevel {
  const sum = tdpSumF(weather);
  if (sum === null || sum <= HOT_OVER_F) return "none";
  return sum > EXTREME_OVER_F ? "extreme" : "hot";
}

/** Hot or extreme: the one test every heat surface uses. */
export function isHotDay(weather: HeatInput | null | undefined): boolean {
  return heatLevel(weather) !== "none";
}

/** The sessions run for their pace: a tempo (progressions and sharpeners
 *  among them) and an interval session (hills, fartlek and the time trial
 *  among them). An easy or long run is run easy already; a race is the
 *  race. */
export function isQualitySession(type: string | null | undefined): boolean {
  return type === "tempo" || type === "intervals";
}

/** The run types a heat adjustment eases: the quality sessions and the
 *  easy and long runs. A race is the race. */
export function isHeatAdjustable(type: string | null | undefined): boolean {
  return isQualitySession(type) || type === "easy" || type === "long";
}

/**
 * One run's heat adjustment, as the runner accepted it: the slowdown's
 * range; on an extreme day effort only, with no pace targets; and, where
 * heart rate is live and the max is measured, a heart-rate ceiling. Held
 * on the run's own config (`RunConfig.heatAdjustment`) and nowhere else.
 */
export interface HeatAdjustment extends HeatSlowdown {
  effortOnly?: boolean;
  /** bpm: the run is held under it while beats arrive. */
  hrCeiling?: number;
}

/**
 * The heart-rate ceiling for a hot day's run: the top of the session's own
 * zone (`targetZoneForRun`, hrZones.ts), so the run is held at its usual
 * effort while heat raises the heart rate at a pace. Only for an easy, long
 * or tempo run, only from a measured max heart rate (an age estimate is out
 * by about 10 bpm, running-evidence.md §4.13), and only where a heart-rate
 * source is live. A Tropos heuristic on the zones the app already uses.
 */
export function heatHeartRateCeiling(args: {
  sessionType: string | null | undefined;
  /** A measured max heart rate; null or 0 when there is none. */
  measuredMaxHr: number | null | undefined;
  /** A heart-rate source can stream on this device
   *  (`getHeartRateSource().available`). */
  hrLive: boolean;
}): number | null {
  const { sessionType, measuredMaxHr, hrLive } = args;
  if (!hrLive || !measuredMaxHr || !(measuredMaxHr > 0)) return null;
  if (
    sessionType !== "easy" &&
    sessionType !== "long" &&
    sessionType !== "tempo"
  )
    return null;
  return targetZoneForRun(sessionType, measuredMaxHr)?.maxBpm ?? null;
}

/** The adjustment a hot day offers a run of this type, or null when the
 *  day isn't hot or the run is not one an adjustment eases. */
export function heatAdjustmentFor(args: {
  weather: HeatInput | null | undefined;
  sessionType: string | null | undefined;
  measuredMaxHr?: number | null;
  hrLive?: boolean;
}): HeatAdjustment | null {
  const sum = tdpSumF(args.weather);
  if (sum === null || sum <= HOT_OVER_F) return null;
  if (!isHeatAdjustable(args.sessionType)) return null;
  const extreme = sum > EXTREME_OVER_F;
  const slowdown = extreme
    ? {
        from: TDP_TABLE[TDP_TABLE.length - 1].from,
        to: TDP_TABLE[TDP_TABLE.length - 1].to,
      }
    : heatSlowdown(sum)!;
  const hrCeiling = heatHeartRateCeiling({
    sessionType: args.sessionType,
    measuredMaxHr: args.measuredMaxHr,
    hrLive: args.hrLive === true,
  });
  return {
    ...slowdown,
    ...(extreme ? { effortOnly: true } : {}),
    ...(hrCeiling ? { hrCeiling } : {}),
  };
}

/** A pace band slowed by the slowdown's range: its fast edge by the low
 *  share, its slow edge by the high one, so the range shows both. */
export function easeBand(band: PaceBand, slowdown: HeatSlowdown): PaceBand {
  return [
    Math.round(band[0] * (1 + slowdown.from)),
    Math.round(band[1] * (1 + slowdown.to)),
  ];
}

/** A single pace (a race pace, a goal pace) slowed by the middle of the
 *  range: where a run screen needs one pace to judge against. */
export function easePace(paceSPerKm: number, slowdown: HeatSlowdown): number {
  return Math.round(paceSPerKm * (1 + (slowdown.from + slowdown.to) / 2));
}

/**
 * The runner's pace table for one hot run: every band eased by the range
 * (`easeBand`), every race pace by its middle (`easePace`). Null on an
 * extreme day, which runs by effort with no pace targets, and with no
 * table to ease. Everything that sets a run's targets from a table (the
 * plan's prefill, the run screen's bands and easy limit) reads this one
 * for an adjusted run, so the run is eased throughout and the stored table
 * is never touched.
 */
export function heatEasedPaceTable(
  table: PaceTable | null,
  adjustment: HeatAdjustment
): PaceTable | null {
  if (!table || adjustment.effortOnly) return null;
  const race = Object.fromEntries(
    Object.entries(table.race).map(([key, pace]) => [
      key,
      easePace(pace, adjustment),
    ])
  ) as PaceTable["race"];
  return {
    vdot: table.vdot,
    easy: easeBand(table.easy, adjustment),
    marathon: easeBand(table.marathon, adjustment),
    threshold: easeBand(table.threshold, adjustment),
    interval: easeBand(table.interval, adjustment),
    repetition: easeBand(table.repetition, adjustment),
    race,
  };
}

/** A race goal's work for one hot run: its time slowed by the middle of
 *  the range, so a goal-pace tempo or a race-pace finish eases with the
 *  rest. None on an extreme day. */
export function heatEasedRaceTarget(
  target: RaceTarget | null,
  adjustment: HeatAdjustment
): RaceTarget | null {
  if (!target || adjustment.effortOnly) return null;
  return { ...target, targetTimeS: easePace(target.targetTimeS, adjustment) };
}

/* ── Words ────────────────────────────────────────────────────────── */

/** "2–3%", "0.5–1%", "4.5–6%": a slowdown's range as the table writes it. */
export function slowdownLabel(slowdown: HeatSlowdown): string {
  const pct = (share: number) =>
    String(Math.round(share * 1000) / 10).replace(/\.0$/, "");
  return `${pct(slowdown.from)}–${pct(slowdown.to)}%`;
}

/** The heading of a hot day's panel. */
export const HEAT_TITLE = "Hot today";
/** The heading on an extreme day. */
export const EXTREME_HEAT_TITLE = "Too hot to run hard";

/** The extreme day's advice: the table's "hard running not recommended",
 *  with the run still the runner's to start. */
export const EXTREME_HEAT_LINE =
  "Running outside isn’t advised in this heat. If you go, run by feel.";

/** The heat line for this weather, or null when it isn't hot: on a hot
 *  day the rule of thumb's slowdown, named as one; on an extreme day the
 *  advice not to run outside. */
export function heatLine(weather: HeatInput | null | undefined): string | null {
  const sum = tdpSumF(weather);
  if (sum === null || sum <= HOT_OVER_F) return null;
  if (sum > EXTREME_OVER_F) return EXTREME_HEAT_LINE;
  return `By a common rule of thumb, this heat slows the same effort by ${slowdownLabel(heatSlowdown(sum)!)}.`;
}

/** Home's day peek, beside the heat line: where the adjustment is. */
export const HEAT_PREVIEW_LINE =
  "You can adjust the run for heat as you start it.";

/** The offer's button: a verb and its object (DS4's words rules). */
export const HEAT_ADJUST = "Adjust for heat";
/** Clearing an accepted adjustment gives back the session as planned. */
export const HEAT_CLEAR = "Clear adjustment";

/** What an accepted adjustment set, in one line. `pace` is the eased work
 *  range or easy limit, already labelled in the reader's unit. */
export function heatAdjustedLine(
  adjustment: HeatAdjustment,
  target:
    | { kind: "range"; pace: string }
    | { kind: "easyLimit"; pace: string }
    | { kind: "none" }
): string {
  if (adjustment.hrCeiling)
    return `Adjusted for heat: keep your heart rate under ${adjustment.hrCeiling} bpm.`;
  if (adjustment.effortOnly || target.kind === "none")
    return "Adjusted for heat: no pace targets, so run by feel.";
  if (target.kind === "range")
    return `Adjusted for heat: work at ${target.pace}.`;
  return `Adjusted for heat: keep easy running slower than ${target.pace}.`;
}

/** The swap's words beside its button: an easy run of the minutes the
 *  session states (`plannedSessionMinutes`). */
export function heatSwapLine(minutes: number): string {
  return `Or run easy for the same ${Math.round(minutes)} min.`;
}

/** The swap's button where it starts the easy run (the launch card). */
export const HEAT_SWAP_START = "Run easy instead";

/** The swap's button where it changes the run being set up (the full
 *  setup, whose Start then starts it). */
export const HEAT_SWAP_SWITCH = "Switch to easy";

/** A structured long run (a race-pace finish or race-pace blocks): the
 *  swap to an easy long run of the same distance. */
export const HEAT_LONG_SWAP_LINE = "Or run it all at an easy pace.";
export const HEAT_LONG_SWAP = "Run it all easy";

/** The run summary's line for a hot day's run that ran slower than its
 *  pace (plannedRunVerdict.ts): the pace, and that slower is expected. */
export function heatSlowVerdictLine(actualPace: string): string {
  return `Slower in the heat today: ${actualPace}. That’s expected, and it still counts.`;
}

/** The run summary's line for a run adjusted to effort only. */
export const HEAT_FEEL_VERDICT_LINE =
  "Run by feel in the heat, so its pace isn’t judged.";

/* ── The heart-rate ceiling on the run ─────────────────────────────── */

/** How long a ceiling's cue waits before it speaks again, ms: once a
 *  minute and a half, so it guides without nagging. A Tropos heuristic,
 *  the easy cue's order. */
export const HEAT_HR_CUE_GAP_MS = 90_000;

/** Whether the heart-rate ceiling's cue speaks now: a live beat over the
 *  ceiling, and none spoken for `HEAT_HR_CUE_GAP_MS`. */
export function heatHeartRateCueDue(args: {
  bpm: number | null;
  ceiling: number | null | undefined;
  now: number;
  lastSpokeAt: number | null;
}): boolean {
  const { bpm, ceiling, now, lastSpokeAt } = args;
  if (bpm === null || !ceiling || !(bpm > ceiling)) return false;
  return lastSpokeAt === null || now - lastSpokeAt >= HEAT_HR_CUE_GAP_MS;
}

/** The ceiling's spoken cue: run-cue register, as the other cues are. */
export function heatHeartRateCue(ceiling: number): string {
  return `Heart rate over ${ceiling}. Ease off in the heat.`;
}
