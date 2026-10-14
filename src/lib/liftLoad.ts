/**
 * Lifting loads in the lifter's unit (Lift18).
 *
 * Every load is STORED in kg — set logs, saved workouts, the programme, the
 * engine, the server — and that does not change. This module converts where
 * a load is shown or typed, the split `weightUnits.ts` already makes for
 * body weight and `distanceUnits.ts` for runs.
 *
 * The unit has its own setting, `liftingWeightUnit`, rather than following
 * body weight: a British lifter weighs in in stone (stored as "lbs") and
 * lifts in kg, so one switch for both is wrong for exactly the people most
 * likely to use stone.
 *
 * A load typed in lb is stored as its exact kg, unrounded, so 135 lb reads
 * back as 135 lb. Rounding happens only on the way to the screen: kg to two
 * decimals, which keeps a 1.25 kg step ("61.25") and drops float noise, and
 * lb to one, so a kg load from before the switch reads "132.3 lb".
 */
import { kgToLb, lbToKg } from "./weightUnits";

/** The unit a lifter reads and types loads in. Storage is always kg. */
export type LiftUnit = "kg" | "lbs";

/** A profile's lifting unit; anything but "lbs" (missing included) is kg. */
export function resolveLiftUnit(value: unknown): LiftUnit {
  return value === "lbs" ? "lbs" : "kg";
}

/** Setup's lifting unit, from the body-weight unit picked there: lb for lb.
 *  Stone is kg, since the people who weigh in in stone lift in kg (the
 *  reason the setting is its own). Settings → Units changes it. */
export function liftUnitForBodyWeight(
  bodyWeightUnit: "kg" | "lbs" | "st" | undefined
): LiftUnit {
  return bodyWeightUnit === "lbs" ? "lbs" : "kg";
}

/** How the unit is written after a number: "kg" or "lb". */
export function liftUnitLabel(unit: LiftUnit): "kg" | "lb" {
  return unit === "lbs" ? "lb" : "kg";
}

/** A stored kg load as the number the lifter reads. */
export function loadIn(kg: number, unit: LiftUnit): number {
  if (!Number.isFinite(kg)) return 0;
  if (unit === "lbs") return Math.round(kgToLb(kg) * 10) / 10;
  return Math.round(kg * 100) / 100;
}

/** A load the lifter typed, as the kg it is stored as. */
export function loadToKg(value: number, unit: LiftUnit): number {
  return unit === "lbs" ? lbToKg(value) : value;
}

/** A load with its unit: "60 kg", "62.5 kg", "135 lb", "132.3 lb". */
export function formatLoad(kg: number, unit: LiftUnit): string {
  return `${loadIn(kg, unit)} ${liftUnitLabel(unit)}`;
}

/** A load as a whole number in the lifter's unit, rounded once from the
 *  exact conversion: an estimate (a 1RM), or a kettlebell in lb
 *  (`kitLoadIn`). Through `loadIn`'s tenth, 100 kg read 221 lb. */
export function wholeLoadIn(kg: number, unit: LiftUnit): number {
  if (!Number.isFinite(kg)) return 0;
  return Math.round(unit === "lbs" ? kgToLb(kg) : kg);
}

/** A kg quantity that is not one load (volume, load × reps, or the gap
 *  between two loads) in the lifter's unit, unrounded: the caller rounds or
 *  abbreviates it as its figure needs. */
export function liftVolumeIn(kg: number, unit: LiftUnit): number {
  if (!Number.isFinite(kg)) return 0;
  return unit === "lbs" ? kgToLb(kg) : kg;
}
