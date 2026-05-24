/**
 * Pure label helpers for run display surfaces.
 *
 * Extracted so the format contract can be tested in isolation and
 * the same labels stay consistent across Run.tsx, RunSummary,
 * ProgrammeRunSection, History, etc. Previously each consumer
 * had its own inline copy — minor format drift was inevitable.
 */

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
