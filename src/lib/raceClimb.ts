/**
 * Run26 (2): a race's total climb as setup and the run-plan editor ask for
 * it. Stored in whole metres (`raceGoal.climbM`); typed in metres, or feet
 * for a reader in miles. The words under the field say whether the climb
 * makes a trail plan, from the same rule the plan is built by
 * (`isTrailRace`).
 */
import type { RaceDistance } from "@/features/program/programTypes";
import {
  MAX_RACE_CLIMB_M,
  RACE_KM_BY_DISTANCE,
  TRAIL_CLIMB_M_PER_KM,
  isTrailRace,
} from "@/features/program/runPlanTiming";
import {
  METRES_PER_FOOT,
  elevationIn,
  elevationUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";

/** The field's text for a stored climb: empty for none. */
export function climbFieldText(
  climbM: number | null | undefined,
  unit: DistanceUnit
): string {
  if (typeof climbM !== "number" || !Number.isFinite(climbM) || climbM <= 0)
    return "";
  return String(Math.round(elevationIn(climbM, unit)));
}

/**
 * The climb typed, in whole metres: 0 for an empty field, null for one
 * that isn't a whole number from 0 to the bound (`MAX_RACE_CLIMB_M`).
 */
export function parseClimbField(
  text: string,
  unit: DistanceUnit
): number | null {
  const trimmed = text.trim().replace(/[\s,.]/g, "");
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const typed = Number(trimmed);
  const metres = Math.round(unit === "mi" ? typed * METRES_PER_FOOT : typed);
  return metres <= MAX_RACE_CLIMB_M ? metres : null;
}

/**
 * The most characters the field takes: the largest climb it keeps in the
 * reader's unit, with its thousands comma ("20,000" m, "65,617" ft). The
 * field took twelve digits and ran out of its box (owner's recording,
 * 23 November 2026); a longer number is never a climb it keeps.
 */
export function climbFieldMaxLength(unit: DistanceUnit): number {
  const digits = String(Math.round(elevationIn(MAX_RACE_CLIMB_M, unit))).length;
  return digits + Math.floor((digits - 1) / 3);
}

/** The climb that makes a race a trail plan, rounded to ten in the
 *  reader's unit: "500 m", "1,640 ft". */
function trailFrom(distance: RaceDistance, unit: DistanceUnit): string {
  const metres = TRAIL_CLIMB_M_PER_KM * RACE_KM_BY_DISTANCE[distance];
  const shown = Math.round(elevationIn(metres, unit) / 10) * 10;
  return `${shown.toLocaleString("en-GB")} ${elevationUnitLabel(unit)}`;
}

/** The line under the climb field. */
export function climbFieldNote(input: {
  distance: RaceDistance;
  /** Whole metres, or null for a field that doesn't parse. */
  climbM: number | null;
  unit: DistanceUnit;
}): string {
  const { distance, climbM, unit } = input;
  if (climbM === null)
    return `Enter the climb as a whole number, up to ${Math.round(
      elevationIn(MAX_RACE_CLIMB_M, unit)
    ).toLocaleString("en-GB")} ${elevationUnitLabel(unit)}.`;
  if (isTrailRace({ distance, climbM }))
    return "A trail plan: long runs in time, hill work, run by effort.";
  return `The course’s total climb. ${trailFrom(distance, unit)} or more makes a trail plan.`;
}
