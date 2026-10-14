import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "@/lib/liftLoad";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";

/**
 * Challenge progress-value formatting — the ONE copy. This function lived
 * byte-identical in ChallengeCard and ChallengeFinaleCard (the 2026-08-22
 * unit-treatment sweep found the pair while spacing "5.2km" → "5.2 km");
 * fixing a duplicated formatter twice is how the two drift, so it moved
 * here instead.
 *
 * fastest_effort: seconds → "m:ss". group_goal / total_km: kilometres,
 * shown in the reader's distance unit to a tenth, a whole number without
 * its ".0" ("20 km", "26.4 mi").
 * total_volume: kilograms, shown in the reader's lifting unit (Lift18;
 * "28,307 lb"). Units are SPACED ("5.2 km", "12,840 kg") — the app's one
 * unit treatment.
 */
export function formatChallengeValue(
  metric: string,
  value: number,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): string {
  if (metric === "fastest_effort") {
    if (value <= 0) return "—";
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  if (metric === "total_km") {
    const shown = Math.round(distanceIn(value * 1000, distanceUnit) * 10) / 10;
    return `${Number.isInteger(shown) ? shown : shown.toFixed(1)} ${distanceUnitLabel(distanceUnit)}`;
  }
  if (metric === "total_volume")
    return `${Math.round(liftVolumeIn(value, liftUnit)).toLocaleString()} ${liftUnitLabel(liftUnit)}`;
  return Math.round(value).toLocaleString();
}
