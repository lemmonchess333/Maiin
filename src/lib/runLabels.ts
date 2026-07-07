/**
 * Pure label helpers for run display surfaces.
 *
 * Extracted so the format contract can be tested in isolation and
 * the same labels stay consistent across Run.tsx, RunSummary,
 * ProgrammeRunSection, History, etc. Previously each consumer
 * had its own inline copy — minor format drift was inevitable.
 */

/**
 * Format a pace value (seconds per km) as `M:SS` (no unit suffix).
 * Used by surfaces that render the unit separately ("M:SS /km" with
 * spacing, or alongside a "/km" pill, or in best-effort displays
 * where the unit is implied by context). Returns `"--:--"` for
 * missing / non-positive pace to keep the column-width stable in
 * tabular UIs.
 */
export function paceMinSec(paceSec: number): string {
  if (!paceSec || paceSec <= 0) return "--:--";
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a pace value (seconds per km) as `M:SS/km`. Returns the
 * em-dash placeholder when pace is missing or non-positive (a
 * stationary or zero-distance leg shouldn't display "0:00/km").
 */
export function paceLabel(paceSec: number): string {
  if (!paceSec || paceSec <= 0) return "—";
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
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
export function paceBandLabel(band: [number, number]): string {
  return `${paceMinSec(band[0])}–${paceMinSec(band[1])} /km`;
}

/**
 * One display rule for a session's personalized pace, shared by every
 * surface that shows one (command card, day sheet, run setup): the BAND
 * leads when the engine has one — a range is the honest coaching target
 * (tempo/interval singles are just the band midpoint) — with the single
 * target/work pace as the fallback (race paces have no band). Null when
 * nothing applies, so callers can omit the pill entirely.
 */
export function sessionPaceDisplay(paces: {
  targetPace?: number;
  workPace?: number;
  band?: [number, number];
}): string | null {
  if (paces.band) return paceBandLabel(paces.band);
  if (paces.targetPace) return `${paceMinSec(paces.targetPace)} /km`;
  if (paces.workPace) return `${paceMinSec(paces.workPace)} /km`;
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
export function distanceLabel(distanceM: number): string {
  if (!distanceM || distanceM <= 0) return "—";
  return `${(distanceM / 1000).toFixed(1)} km`;
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
