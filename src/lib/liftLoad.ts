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

/** A set's load: "BW" for a bodyweight set with nothing added, else as
 *  `formatLoad`. */
export function formatSetLoad(kg: number, unit: LiftUnit): string {
  return kg === 0 ? "BW" : formatLoad(kg, unit);
}

/** Volume (load × reps, stored as kg) in the lifter's unit, unrounded: the
 *  caller rounds or abbreviates it as its figure needs. */
export function liftVolumeIn(kg: number, unit: LiftUnit): number {
  if (!Number.isFinite(kg)) return 0;
  return unit === "lbs" ? kgToLb(kg) : kg;
}
