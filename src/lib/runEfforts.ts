/**
 * A run's time over a set distance: its 1K, 5K or 10K, the one figure the
 * finish screen celebrates ("You ran 5K in 24:31, your fastest yet"),
 * Bests lists and the Running page compares (App1 Q15: whatever is
 * celebrated is visible in Bests, from the same source).
 *
 * A run saved since its best efforts were kept carries them
 * (`bestEfforts`: `detectBestEfforts` over the full track at the finish,
 * from any starting point). An older run has only its kilometre splits,
 * and its fastest whole kilometres in a row stand in. Those are cut on the
 * kilometre marks, so they can read a few seconds slower than an effort,
 * never faster. Treadmill and manual runs keep neither, so they time
 * nothing.
 *
 * No imports, so the post's moments (`postMoments.ts`), which the rules
 * tests read, can use it.
 */

/** A kilometre under 2:00 or over 30:00 is the GPS, not the runner. */
export const SPLIT_MIN_SECONDS = 120;
export const SPLIT_MAX_SECONDS = 1800;

/** The fastest `km` whole kilometres in a row in one run's splits, in
 *  seconds, or null when the run is shorter or a split in every stretch
 *  is not believable. */
export function fastestStretch(
  splits: readonly number[],
  km: number
): number | null {
  let best: number | null = null;
  for (let start = 0; start + km <= splits.length; start++) {
    let seconds = 0;
    let believable = true;
    for (let i = start; i < start + km; i++) {
      const split = splits[i];
      if (!(split >= SPLIT_MIN_SECONDS && split <= SPLIT_MAX_SECONDS)) {
        believable = false;
        break;
      }
      seconds += split;
    }
    if (believable && (best === null || seconds < best)) best = seconds;
  }
  return best === null ? null : Math.round(best);
}

/** What a run keeps that can time a distance. */
export interface EffortRun {
  /** Metres and seconds, as the run saved them. */
  bestEfforts?: readonly { distance: number; time: number }[];
  /** Each whole kilometre's seconds, in order. */
  kmSplitSeconds?: readonly number[];
}

/**
 * The run's time over `meters`, in seconds: its saved best effort at the
 * distance, else its fastest whole kilometres in a row. Null when it
 * timed none.
 */
export function runEffortSeconds(
  run: EffortRun,
  meters: number
): number | null {
  const saved = run.bestEfforts?.find(
    (effort) =>
      effort.distance === meters &&
      Number.isFinite(effort.time) &&
      effort.time > 0
  );
  if (saved) return saved.time;
  if (!Number.isInteger(meters / 1000) || meters <= 0) return null;
  const splits = run.kmSplitSeconds ?? [];
  return splits.length > 0 ? fastestStretch(splits, meters / 1000) : null;
}

/** The run that holds a distance's fastest time, and the time. */
export interface FastestEffort<T> {
  meters: number;
  seconds: number;
  run: T;
}

/**
 * Each distance's fastest time across `runs`, in the order of `meters`,
 * leaving out a distance no run timed. A tie keeps the run that comes
 * first in `runs`, as the other running records do.
 */
export function fastestEfforts<T extends EffortRun>(
  runs: readonly T[],
  meters: readonly number[]
): FastestEffort<T>[] {
  const fastest: FastestEffort<T>[] = [];
  for (const distance of meters) {
    let held: FastestEffort<T> | null = null;
    for (const run of runs) {
      const seconds = runEffortSeconds(run, distance);
      if (seconds !== null && (!held || seconds < held.seconds))
        held = { meters: distance, seconds, run };
    }
    if (held) fastest.push(held);
  }
  return fastest;
}
