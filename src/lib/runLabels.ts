import {
  type DistanceUnit,
  distanceIn,
  paceIn,
  distanceUnitLabel,
  paceUnitLabel,
  shortDistanceIn,
  shortDistanceUnitLabel,
  elevationIn,
  elevationUnitLabel,
  METRES_PER_MILE,
} from "./distanceUnits";

/**
 * Pure label helpers for run display surfaces.
 *
 * Extracted so the format contract can be tested in isolation and
 * the same labels stay consistent across Run.tsx, RunSummary,
 * ProgrammeRunSection, History, etc. Previously each consumer
 * had its own inline copy — minor format drift was inevitable.
 *
 * UNITS. Everything arriving here is METRIC — distances in metres, paces in
 * seconds per kilometre — because that is how Tropos stores them and that
 * does not change. These helpers convert at the moment of DISPLAY, per the
 * user's `preferredDistanceUnit`. `distanceUnits.ts` explains why pace
 * converts the opposite way to distance.
 *
 * The `unit` argument is REQUIRED, deliberately. An optional one defaulting
 * to `"km"` would let a call site silently stay metric for a miles user, and
 * this codebase has been bitten by that exact shape more than once — a prop
 * declared, defaulted, and passed by nobody (`initialCenter`, `belowFloor`).
 * Required means the compiler enumerates the call sites rather than me.
 */

/**
 * Format a pace value (seconds per km) as `M:SS` (no unit suffix).
 * Used by surfaces that render the unit separately ("M:SS /km" with
 * spacing, or alongside a "/km" pill, or in best-effort displays
 * where the unit is implied by context). Returns `"--:--"` for
 * missing / non-positive pace to keep the column-width stable in
 * tabular UIs.
 *
 * ROUND THE TOTAL, THEN SPLIT. Flooring the minutes while rounding the
 * seconds separately lets the two disagree: 59.6s becomes `0:60`. That was
 * unreachable while every pace was a whole number of seconds per km, and
 * miles conversion makes it reachable — 298 s/km (4:58/km, an ordinary
 * pace) is 479.58 s/mi and rendered as `7:60/mi`. Five paces between
 * 2:30/km and 15:00/km did. `finishTimeLabel` below already had the
 * correct shape; this now matches it.
 */
export function paceMinSec(paceSec: number, unit: DistanceUnit): string {
  if (!paceSec || paceSec <= 0) return "--:--";
  const total = Math.round(paceIn(paceSec, unit));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a pace value (seconds per km) as `M:SS/km`. Returns the
 * em-dash placeholder when pace is missing or non-positive (a
 * stationary or zero-distance leg shouldn't display "0:00/km").
 */
export function paceLabel(paceSec: number, unit: DistanceUnit): string {
  if (!paceSec || paceSec <= 0) return "—";
  return `${paceMinSec(paceSec, unit)}${paceUnitLabel(unit)}`;
}

/**
 * Format an elapsed duration (seconds) as either `M:SS` or
 * `Hh MMm` once we cross the hour boundary. Used on per-leg
 * splits and on the run-summary total.
 */
export function durationLabel(durationSec: number): string {
  const m = Math.floor(durationSec / 60);
  const s = Math.round(durationSec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${String(mm).padStart(2, "0")}m`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a pace band as the coaching range Runna popularised —
 * `5:25–5:45 /km`. Bands are [fast, slow] sec/km (the runPaces contract).
 */
export function paceBandLabel(
  band: [number, number],
  unit: DistanceUnit
): string {
  return `${paceMinSec(band[0], unit)}–${paceMinSec(band[1], unit)} ${paceUnitLabel(unit)}`;
}

/**
 * One display rule for a session's personalized pace, shared by every
 * surface that shows one (command card, day sheet, run setup): the BAND
 * leads when the engine has one — a range is the honest coaching target
 * (tempo/interval singles are just the band midpoint) — with the single
 * target/work pace as the fallback (race paces have no band). Null when
 * nothing applies, so callers can omit the pill entirely.
 */
export function sessionPaceDisplay(
  paces: {
    targetPace?: number;
    workPace?: number;
    band?: [number, number];
  },
  unit: DistanceUnit
): string | null {
  if (paces.band) return paceBandLabel(paces.band, unit);
  if (paces.targetPace)
    return `${paceMinSec(paces.targetPace, unit)} ${paceUnitLabel(unit)}`;
  if (paces.workPace)
    return `${paceMinSec(paces.workPace, unit)} ${paceUnitLabel(unit)}`;
  return null;
}

/**
 * Format a race finish time (seconds) the way results are printed:
 * `m:ss` under an hour, `h:mm:ss` over (25:00 · 1:01:01). Distinct from
 * `durationLabel`'s "1h 05m" style — predictions/results read as clock
 * times, not elapsed-time prose.
 */
export function finishTimeLabel(timeS: number): string {
  if (!Number.isFinite(timeS) || timeS <= 0) return "--:--";
  const t = Math.round(timeS);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Format a distance (metres) as `K.k km`, with the em-dash
 * placeholder for missing / zero / negative values.
 */
export function distanceLabel(
  distanceM: number,
  unit: DistanceUnit
): string {
  if (!distanceM || distanceM <= 0) return "—";
  return `${distanceIn(distanceM, unit).toFixed(1)} ${distanceUnitLabel(unit)}`;
}

/**
 * The distance NUMBER alone, for surfaces that render the unit as a
 * separate element — a stat tile with its own label row, a hero figure
 * with the suffix in a smaller span. Pair it with `distanceUnitLabel`.
 *
 * `decimals` exists because the app genuinely uses both: one decimal for
 * glanceable summaries, two for a live run and for social cards where the
 * exact figure is the content. Zero is NOT a "no distance" sentinel here —
 * a caller rendering a bare number wants `0.00`, not an em-dash, so the
 * placeholder stays in `distanceLabel` where the unit implies a reading.
 */
export function distanceValue(
  distanceM: number,
  unit: DistanceUnit,
  decimals: 1 | 2 = 1
): string {
  const v = distanceIn(distanceM, unit);
  return (Number.isFinite(v) ? v : 0).toFixed(decimals);
}

/**
 * A near distance, in the unit that stays readable at that scale: metres
 * for a metric reader, feet for an imperial one, switching to the large
 * unit at a kilometre / a mile.
 *
 * The live-run chips need this. "0.02 mi to go" is not a usable number, and
 * the pre-existing metric code had already made the same judgement by
 * dropping to metres under 1 km — this only gives the imperial reader the
 * equivalent, rather than metres.
 *
 * `suffix` is the trailing phrase ("to go", "to start"); pass "" for the
 * bare figure. Rounding is to 10 of whatever the small unit is, matching
 * what the metric version already did — GPS is not accurate enough to
 * justify a finer figure while moving.
 */
export function nearDistanceLabel(
  distanceM: number,
  unit: DistanceUnit,
  suffix = ""
): string {
  const tail = suffix ? ` ${suffix}` : "";
  const threshold = unit === "mi" ? METRES_PER_MILE : 1000;
  if (distanceM < threshold) {
    const v = Math.round(shortDistanceIn(distanceM, unit) / 10) * 10;
    return `${v} ${shortDistanceUnitLabel(unit)}${tail}`;
  }
  return `${distanceValue(distanceM, unit, 1)} ${distanceUnitLabel(unit)}${tail}`;
}

/**
 * `K.kk km` — the two-decimal form, for the live run screen and the social
 * cards. Same em-dash guard as `distanceLabel`.
 */
export function distanceLabel2(
  distanceM: number,
  unit: DistanceUnit
): string {
  if (!distanceM || distanceM <= 0) return "—";
  return `${distanceValue(distanceM, unit, 2)} ${distanceUnitLabel(unit)}`;
}

/**
 * A stored-KILOMETRE quantity, in the reader's unit — shoe mileage and the
 * weekly aggregates, which are the two places this app keeps kilometres
 * rather than metres.
 *
 * A thin wrapper over `distanceIn` that exists to stop `× 1000` appearing
 * at half a dozen call sites, where a missing one is a silent 1000×
 * error that still renders as a plausible number. Rounds to whole units:
 * shoe mileage is a wear estimate, not a measurement.
 */
export function storedKmLabel(
  km: number,
  unit: DistanceUnit,
  withUnit = true
): string {
  const v = Math.round(distanceIn((km || 0) * 1000, unit));
  return withUnit ? `${v} ${distanceUnitLabel(unit)}` : `${v}`;
}

/**
 * A climb, rounded to a whole unit — `120 m` / `394 ft`.
 *
 * Rounds AFTER converting, so a metric reader still sees the stored whole
 * metres and an imperial one gets whole feet rather than a converted
 * decimal. Zero renders as `0`, not a placeholder: a flat run has genuinely
 * zero climb, which is information rather than a missing value.
 */
export function elevationLabel(
  metres: number,
  unit: DistanceUnit,
  withUnit = true
): string {
  const v = Math.round(elevationIn(metres, unit));
  return withUnit ? `${v}${elevationUnitLabel(unit)}` : `${v}`;
}

/**
 * Format the raceGoal.distance enum (`'5k'` / `'10k'` / `'half'`
 * / `'marathon'`) as a presentable label for the race-prep
 * context strip + race-progress card.
 *
 * Falls through to UPPERCASE for unknown values so a future
 * distance addition shows up legibly until this map is updated.
 */
export function formatRaceDistance(distance: string | undefined): string {
  if (!distance) return "";
  if (distance === "5k") return "5K";
  if (distance === "10k") return "10K";
  if (distance === "half") return "Half Marathon";
  if (distance === "marathon") return "Marathon";
  return distance.toUpperCase();
}
