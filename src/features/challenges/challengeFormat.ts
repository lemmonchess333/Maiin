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
 * active_days: distinct activity dates, with a day unit. training_minutes:
 * cumulative minutes (including fractions), floored so the display never
 * promises a minute that has not yet been completed.
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
  if (metric === "active_days") {
    const days = Math.max(0, Math.floor(value));
    return `${days.toLocaleString()} ${days === 1 ? "day" : "days"}`;
  }
  if (metric === "training_minutes")
    return `${Math.max(0, Math.floor(value)).toLocaleString()} min`;
  return Math.round(value).toLocaleString();
}

const PERIOD: Readonly<Record<string, string>> = {
  weekly: " this week",
  monthly: " this month",
  seasonal: " this season",
};

/** What a challenge's goal needs: its metric, its period and its target. */
export interface ChallengeGoalSource {
  metric: string;
  type?: string;
  tiers?: { bronze: number };
  targetDistance?: number;
  collectiveTarget?: number;
}

/**
 * What the person is aiming for, as one sentence built from the
 * challenge's own target and metric, in the reader's units: "Run 10 km
 * this month.", "Train on 8 days this month.", "Run a 5K in 35:00 or
 * faster this month." The target is the first tier (bronze), the one a
 * two-day-a-week trainer can reach; the ladder above it shows once they
 * have joined. A collective challenge aims at its shared total.
 *
 * Built here rather than stored, because the stored description cannot
 * carry a unit: a reader sees miles or pounds. Null for a metric this
 * does not know, and the card then shows the stored description.
 */
export function challengeGoal(
  challenge: ChallengeGoalSource,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): string | null {
  const { metric, collectiveTarget } = challenge;
  const period = PERIOD[challenge.type ?? ""] ?? "";
  const collective = (collectiveTarget ?? 0) > 0;
  const target = collective ? collectiveTarget! : challenge.tiers?.bronze;
  if (!target || !(target > 0)) return null;
  const value = formatChallengeValue(metric, target, liftUnit, distanceUnit);
  if (collective)
    return metric === "total_km" ? `Run ${value} together${period}.` : null;
  switch (metric) {
    case "total_km":
      return `Run ${value}${period}.`;
    case "fastest_effort": {
      const km = (challenge.targetDistance ?? 5000) / 1000;
      return `Run a ${Math.round(km * 10) / 10}K in ${value} or faster${period}.`;
    }
    case "total_volume":
      return `Lift ${value} in total${period}.`;
    case "workout_count":
      return `Lift ${target === 1 ? "once" : `${value} times`}${period}.`;
    case "hybrid_score":
      return `Score ${value} points from running and lifting${period}.`;
    case "active_days":
      return `Train on ${value}${period}.`;
    case "training_minutes":
      return `Train for ${value}${period}.`;
    default:
      return null;
  }
}
