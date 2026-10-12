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
 *     but it must never drive progression. `applyProgression` moves the
 *     plan to the load lifted, so a deliberately lighter final set would
 *     drop the prescription to the drop set's load every session. Textbook
 *     technique, punished.
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
