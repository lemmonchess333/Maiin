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
