/**
 * Has the calorie target drifted away from the pace it was set to deliver?
 *
 * The target is chosen once, from the body you had at the time. Maintenance
 * then moves as the body does — roughly 15 kcal/day per kilogram at moderate
 * activity — but the stored target does not. So the deficit quietly erodes
 * and the app keeps naming a pace it is no longer producing.
 *
 * Measured on a 90 → 78 kg cut set to −0.5 kg/wk with the target held:
 *
 *   90 kg   maintenance 2875   target 2325   −0.50 kg/wk
 *   82 kg   maintenance 2751   target 2325   −0.39 kg/wk
 *   78 kg   maintenance 2689   target 2325   −0.33 kg/wk
 *
 * A third slower than the figure on screen. That is the plateau the
 * adaptive-TDEE layer exists to answer — but adaptive is Pro-gated
 * (`isAdaptiveActive` requires `isPro`), so for a free user nothing closes
 * the gap and nothing mentions it.
 *
 * Owner decision 2026-08-12: surface it, offer a recalculation, and do NOT
 * silently move anyone's target. Re-cutting calories on every weigh-in would
 * be making a training decision by accident; saying nothing leaves the app
 * asserting a pace it is not delivering. The number stays the user's; the
 * words become true.
 */

import { KCAL_PER_KG } from "./macroConstants";

/** Below this the drift is not worth a line — it is inside the noise of
 *  weekly weight fluctuation and would nag rather than inform. A fifth of the
 *  default 0.5 kg/wk pace, and ~110 kcal/day. */
export const MATERIAL_DRIFT_KG_PER_WEEK = 0.1;

export interface TargetDrift {
  /** The pace the held target actually produces against today's maintenance. */
  effectiveRateKgPerWeek: number;
  /** The pace the plan says it is delivering. */
  intendedRateKgPerWeek: number;
  /** effective − intended. Negative means losing slower / gaining faster than
   *  intended; the sign is only meaningful alongside the direction. */
  driftKgPerWeek: number;
  /** Worth telling the user about. */
  material: boolean;
}

/**
 * @param storedTargetCalories  what the profile currently holds
 * @param currentMaintenance    TDEE at today's weight and activity
 * @param intendedRateKgPerWeek SIGNED — negative to lose, positive to gain,
 *                              0 to maintain
 */
export function resolveTargetDrift(
  storedTargetCalories: number | null | undefined,
  currentMaintenance: number | null | undefined,
  intendedRateKgPerWeek: number | null | undefined
): TargetDrift | null {
  if (
    typeof storedTargetCalories !== "number" ||
    !Number.isFinite(storedTargetCalories) ||
    storedTargetCalories <= 0 ||
    typeof currentMaintenance !== "number" ||
    !Number.isFinite(currentMaintenance) ||
    currentMaintenance <= 0
  ) {
    return null;
  }

  const intended =
    typeof intendedRateKgPerWeek === "number" &&
    Number.isFinite(intendedRateKgPerWeek)
      ? intendedRateKgPerWeek
      : 0;

  // Daily surplus/deficit the held target produces right now, converted to a
  // weekly rate through the same energy density the plan was built with.
  const dailyOffset = storedTargetCalories - currentMaintenance;
  const effective = (dailyOffset * 7) / KCAL_PER_KG;
  const drift = effective - intended;

  return {
    effectiveRateKgPerWeek: effective,
    intendedRateKgPerWeek: intended,
    driftKgPerWeek: drift,
    material: Math.abs(drift) >= MATERIAL_DRIFT_KG_PER_WEEK,
  };
}

/**
 * Should the drift be SHOWN, given who is looking?
 *
 * Two populations already have an answer and must not be nagged:
 * - a manual override is the user pinning a number on purpose, and
 *   recalculating would overwrite the thing they chose;
 * - an engaged adaptive target is already tracking maintenance, which is the
 *   whole feature — telling that user their target has drifted would be
 *   describing a problem the app is actively solving.
 */
export function shouldShowTargetDrift(args: {
  drift: TargetDrift | null;
  isManualOverride: boolean;
  isAdaptiveEngaged: boolean;
}): boolean {
  if (!args.drift || !args.drift.material) return false;
  if (args.isManualOverride) return false;
  if (args.isAdaptiveEngaged) return false;
  return true;
}
