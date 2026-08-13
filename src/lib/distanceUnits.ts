/**
 * Distance + pace units — the display layer for a metric-stored app.
 *
 * Tropos stores every run distance in METRES and every pace in SECONDS PER
 * KILOMETRE, and that does not change. This module converts at the point of
 * DISPLAY only, the same split `preferredWeightUnit` already uses for
 * `weightKg`. Nothing here is ever persisted, and no stored document is
 * rewritten — which is what keeps a user's whole history comparable, and
 * what lets the preference be flipped back and forth with no migration.
 *
 * Why it exists: the app was km-only, with no distance-unit preference
 * anywhere in the codebase. That is correct where it is built and wrong for
 * a large share of the eventual user base — the same shape as the UTC
 * date-key bug, where the default was invisible to a UK developer and wrong
 * for everyone at a negative offset. Miles are the unit for runners in the
 * US and the UK road-race scene alike.
 *
 * PACE IS THE SUBTLE HALF. A distance converts by dividing; a pace converts
 * by MULTIPLYING, because "seconds per unit" scales with the unit's length.
 * A mile is longer than a kilometre, so a mile takes LONGER: 5:00/km is
 * 8:03/mi, not 3:06/mi. Getting this backwards produces numbers that look
 * plausible and are badly wrong, so the conversion lives here once and is
 * pinned by tests that assert the direction explicitly.
 *
 * SMALL ON PURPOSE. Only the conversions this change actually wires live
 * here — the inverse directions (user-entered targets), elevation in feet,
 * and the spoken cue unit arrive with the surfaces that need them. The
 * symbol-reachability gate enforces that: its list is delete-only, on the
 * stated grounds that "a new orphan means the export was never needed", and
 * speculative helpers are exactly what it refuses.
 */

/** The unit a user reads distances and paces in. Storage is always metric. */
export type DistanceUnit = "km" | "mi";

/**
 * Kilometres in a mile, exactly. The international mile has been defined as
 * 1609.344 m since 1959, so this is a definition rather than a measurement —
 * no rounding is justified.
 */
export const KM_PER_MILE = 1.609344;

/** Metres in a mile, exactly. */
export const METRES_PER_MILE = 1609.344;

/**
 * Resolve a profile's stored preference to a unit, defaulting to metric.
 *
 * Takes the raw field rather than the profile so callers with a partial
 * profile (or none, pre-load) get the same answer. An unrecognised stored
 * value reads as `"km"` — the app's default — rather than throwing, because
 * a display helper is the wrong place to fail a render.
 */
export function resolveDistanceUnit(
  preferred: string | null | undefined
): DistanceUnit {
  return preferred === "mi" ? "mi" : "km";
}

/** Distance in the display unit, from metres. */
export function distanceIn(metres: number, unit: DistanceUnit): number {
  if (!Number.isFinite(metres)) return 0;
  return unit === "mi" ? metres / METRES_PER_MILE : metres / 1000;
}


/**
 * Pace in seconds per DISPLAY unit, from seconds per kilometre.
 *
 * Multiplies for miles — see the header. A non-positive or non-finite pace
 * passes through unchanged so the "no pace yet" sentinels every formatter
 * already handles (`0`, `NaN`) stay recognisable rather than becoming a
 * different non-positive number.
 */
export function paceIn(secPerKm: number, unit: DistanceUnit): number {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return secPerKm;
  return unit === "mi" ? secPerKm * KM_PER_MILE : secPerKm;
}



/**
 * The unit for strings baked at plan-GENERATION time, not at render.
 *
 * ONE module still needs this: `runSegments.ts`, which bakes pace into
 * segment LABELS and spoken CUES while a plan is generated. Those strings
 * are produced far from any profile — `runPlanMetadata.ts` calls the same
 * builders to fill `prefill.segments` — and, being audio, they also need
 * the spoken noun ("kilometre") to move with the number, which is a copy
 * change rather than a formatting one. The fix is for segments to carry
 * NUMBERS and format at render; that is its own change.
 *
 * This list was longer, and four of its five entries were wrong. Checking
 * each module's CALL SITES rather than trusting the classification showed
 * `paceVerdict`, `heatAdjustment`, `chooserPaceFor` and `raceTargetVerdict`
 * are each reached from exactly one component that already had the unit in
 * scope, so they take it as a parameter now. Only measure a boundary from
 * where the code is actually called.
 *
 * The remaining case is explicitly metric via this name rather than a bare
 * `"km"`, so finishing it is one grep. A miles user would see converted
 * values everywhere the display layer reaches and metric inside a running
 * session's segment labels — which is why no Settings toggle exposes the
 * preference yet.
 */
export const GENERATION_TIME_UNIT: DistanceUnit = "km";

/** Short distance suffix — `km` / `mi`. */
export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

/** Pace suffix — `/km` / `/mi`. */
export function paceUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "/mi" : "/km";
}


