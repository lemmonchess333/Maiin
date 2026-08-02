import type { RepUnit } from "./programTypes";

/**
 * Warm-ups are preparation, and timed holds are duration work rather than a
 * repetition-max bucket. Neither may mutate repetition/volume PR state.
 */
export function isSetEligibleForStrengthPr(
  setType: string,
  repUnit: RepUnit | undefined
): boolean {
  return setType !== "warmup" && repUnit !== "seconds";
}

/**
 * May this set drive `applyProgression`? (D4-LIFT / D3)
 *
 * Deliberately NOT `isSetEligibleForStrengthPr`, which is a near-miss: that
 * predicate admits a **drop set** (it only excludes warm-ups and timed
 * holds), so reusing it would leave the actual defect in place. The two
 * questions differ on both axes:
 *
 *   - a **drop set** is a legitimate PR candidate on its own reduced load,
 *     but it must never drive progression. `applyProgression` scores
 *     `completed = actualReps >= reps && actualWeight >= weight`, so a
 *     deliberately lighter final set reads as a MISS every session →
 *     `consecutiveFailures` climbs → a 5% load cut every third session,
 *     forever. Textbook technique, punished as failure.
 *   - a **timed hold** is excluded from rep-max PR buckets but progresses
 *     perfectly well — the engine has a dedicated +5s axis for it — so
 *     `repUnit` is a PR concern and has no business here.
 *
 * A `failure` set DOES count: it is a working set taken to failure, which is
 * the most informative set in the session, and Schoenfeld p.131 explicitly
 * endorses failure on the last set of an exercise. The tag records how the
 * set ended, not that the lifter failed the prescription.
 */
export function isSetEligibleForProgression(setType: string): boolean {
  return setType !== "warmup" && setType !== "dropset";
}

/**
 * The set an exercise's progression should be read from: the LAST completed
 * set that is eligible, or `null` when the session produced no working-set
 * evidence at all.
 *
 * Lives here rather than in the session component because it is policy, not
 * presentation — and because the behaviour it encodes (a drop set must not
 * walk a lifter's load down 5% every third session) needs to be pinned by a
 * test that drives the real progression engine, which a component cannot be.
 *
 * `null` is a deliberate outcome, not an error: an exercise logged as
 * warm-ups only, or as a lone drop set, carries no evidence about the
 * prescription. Skipping is strictly better than inventing a data point.
 */
export function progressionSetFor<
  T extends { completed: boolean; type: string },
>(sets: readonly T[]): T | null {
  for (let i = sets.length - 1; i >= 0; i--) {
    const s = sets[i];
    if (s.completed && isSetEligibleForProgression(s.type)) return s;
  }
  return null;
}
