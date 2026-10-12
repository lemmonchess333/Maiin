/**
 * How many reps a lifter can do at a load: Nuzzo 2024's reps to failure at
 * each share of 1RM (lifting-evidence §2.15, verified parameters), with the
 * between-person spread as one z-score per lifter (§4.4: a fixed offset in
 * reps cannot reproduce an SD that falls from 4.4 reps at 60% to 1.7 at 95%).
 *
 * Classes: "bench" for the bench press and its variants, "legPress" for the
 * leg press, "main" for everything else. Nuzzo has no table for the deadlift,
 * overhead press, rows or isolation work; reading them off "main" is this
 * harness's ASSUMPTION.
 *
 * Above 95% the tables stop. The bridge from 95% to 1 rep at 100% is linear
 * in log reps, an ASSUMPTION the evidence doc names. Below 60% the curve is
 * extended on the slope between 65% and 60%.
 */

export type RepClass = "main" | "bench" | "legPress";

/** [share of 1RM, mean reps, between-person SD]. Nuzzo 2024 Figs 2-4 [VF]. */
const NUZZO: Record<
  RepClass,
  ReadonlyArray<readonly [number, number, number]>
> = {
  main: [
    [0.6, 19.5, 4.4],
    [0.65, 17.1, 3.8],
    [0.7, 14.8, 3.3],
    [0.75, 12.4, 2.9],
    [0.8, 9.8, 2.5],
    [0.85, 7.2, 2.2],
    [0.9, 4.9, 1.9],
    [0.95, 3.3, 1.7],
  ],
  bench: [
    [0.6, 19.3, 3.7],
    [0.65, 16.6, 3.2],
    [0.7, 14.1, 2.7],
    [0.75, 11.5, 2.3],
    [0.8, 8.8, 2.0],
    [0.85, 6.2, 1.7],
    [0.9, 4.1, 1.5],
    [0.95, 2.6, 1.3],
  ],
  legPress: [
    [0.6, 26.7, 8.0],
    [0.65, 22.6, 6.9],
    [0.7, 19.0, 5.8],
    [0.75, 15.8, 5.0],
    [0.8, 13.1, 4.2],
    [0.85, 10.7, 3.6],
    [0.9, 8.7, 3.1],
    [0.95, 7.0, 2.6],
  ],
};

/** Linear interpolation of log(mean) and SD at `share` within the table. */
function cell(cls: RepClass, share: number): { mean: number; sd: number } {
  const table = NUZZO[cls];
  const first = table[0];
  const last = table[table.length - 1];
  if (share >= last[0]) {
    // Bridge: log reps falls linearly from the 95% mean to log(1) at 100%.
    if (share >= 1) return { mean: 1, sd: 0 };
    const t = (share - last[0]) / (1 - last[0]);
    return {
      mean: Math.exp(Math.log(last[1]) * (1 - t)),
      sd: last[2] * (1 - t),
    };
  }
  if (share <= first[0]) {
    // Extend on the 60-65% slope (in log reps), SD scaled with the mean.
    const next = table[1];
    const slope =
      (Math.log(next[1]) - Math.log(first[1])) / (next[0] - first[0]);
    const mean = Math.exp(Math.log(first[1]) + slope * (share - first[0]));
    return { mean, sd: first[2] * (mean / first[1]) };
  }
  for (let i = 0; i < table.length - 1; i++) {
    const [s0, m0, d0] = table[i];
    const [s1, m1, d1] = table[i + 1];
    if (share >= s0 && share <= s1) {
      const t = (share - s0) / (s1 - s0);
      return {
        mean: Math.exp(Math.log(m0) + t * (Math.log(m1) - Math.log(m0))),
        sd: d0 + t * (d1 - d0),
      };
    }
  }
  throw new Error(`no cell for ${String(share)}`);
}

/**
 * Reps to failure at `load` for a lifter whose 1RM today is `oneRepMax`,
 * `z` SDs from the mean. Never below 0; fractional (the caller floors).
 */
export function repsToFailure(
  cls: RepClass,
  load: number,
  oneRepMax: number,
  z: number
): number {
  if (load <= 0) return Infinity;
  if (oneRepMax <= 0) return 0;
  const share = load / oneRepMax;
  if (share > 1) return 0;
  const { mean, sd } = cell(cls, share);
  return Math.max(0, mean + z * sd);
}

/** The class an exercise reads its reps from (see the header). */
export function repClassOf(exerciseId: string): RepClass {
  if (/leg-press/.test(exerciseId)) return "legPress";
  if (/bench/.test(exerciseId)) return "bench";
  return "main";
}
