/**
 * Pure unit-resolution helpers for `RunConfig.target`.
 *
 * The canonical units contract lives on the RunConfig type
 * definition in `src/components/run/RunSetupModal.tsx`. This
 * module is the testable extraction point — Run.tsx's audio-cue
 * pipeline reads through these helpers so the unit assumptions
 * are pinnable in isolation, without mounting the page.
 *
 * Why a dedicated file: the conversion logic is tiny but the
 * regression class is severe (a "doubly-wrong" multiplier
 * silently corrected for a unit bug elsewhere — both bugs needed
 * fixing in lockstep, and the fix is easiest to verify when the
 * helper is testable on its own).
 */

interface RunTargetLike {
  type: string;
  value?: number;
}

/**
 * Returns the target distance in metres, or 0 when the target
 * isn't a distance type / is empty / is undefined.
 *
 * No conversion is performed — `target.value` for `type: "distance"`
 * is already metres per the RunConfig contract. The helper exists
 * solely as a single-point read so the pre-fix `* 1000` multiplier
 * regression can't reappear via copy-paste.
 *
 * Example:
 *   getDistanceTargetMeters({ type: "distance", value: 10000 }) → 10000
 *   getDistanceTargetMeters({ type: "pace", value: 270 })       → 0
 *   getDistanceTargetMeters(undefined)                          → 0
 */
export function getDistanceTargetMeters(
  target: RunTargetLike | undefined | null,
): number {
  if (!target || target.type !== "distance" || !target.value) return 0;
  return target.value;
}
