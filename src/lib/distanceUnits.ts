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
 * Metres in a foot, exactly — 0.3048 m by the same 1959 agreement that
 * fixes the mile.
 *
 * Feet arrive here earlier than planned, and not as a free choice. The
 * live-run chips ("350 m to go", "back to start") switch to a small unit
 * under a kilometre, so converting only the large branch would show a miles
 * reader metres — the half-converted state this whole change exists to
 * avoid. Elevation, the other foot-shaped surface, is still outstanding and
 * can reuse this.
 */
export const METRES_PER_FOOT = 0.3048;

/**
 * The small-distance companion to `distanceIn`: metres for metric readers,
 * feet for imperial. Used under the unit-switch threshold, where a decimal
 * fraction of a mile stops being readable ("0.02 mi to go").
 */
export function shortDistanceIn(metres: number, unit: DistanceUnit): number {
  if (!Number.isFinite(metres)) return 0;
  return unit === "mi" ? metres / METRES_PER_FOOT : metres;
}

/**
 * Elevation in the reader's unit — metres, or feet for an imperial reader.
 *
 * Shares `METRES_PER_FOOT` with the near-distance helpers rather than
 * defining a second constant: a foot is a foot whether it is measuring
 * along the ground or up a hill, and one definition is one place to be
 * wrong. Kept separate from `shortDistanceIn` only because the two round
 * differently — a climb is quoted to the foot, a distance-to-go to the
 * nearest ten.
 */
export function elevationIn(metres: number, unit: DistanceUnit): number {
  if (!Number.isFinite(metres)) return 0;
  return unit === "mi" ? metres / METRES_PER_FOOT : metres;
}

/** Elevation suffix — `m` / `ft`. */
export function elevationUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "ft" : "m";
}

/** Short-distance suffix — `m` / `ft`. */
export function shortDistanceUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "ft" : "m";
}

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
 * Metres from a value the user TYPED, in whatever unit they read in.
 *
 * The inverse of `distanceIn`, and the first thing here that runs toward
 * storage rather than away from it. Everything else in this module is a
 * display helper that must never reach a write path; this one exists
 * precisely to reach one, so that a typed "3.1" is stored as 4989 m rather
 * than 3100. Keeping it beside its inverse is what makes a mismatched pair
 * obvious.
 */
export function distanceToMetres(value: number, unit: DistanceUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === "mi" ? value * METRES_PER_MILE : value * 1000;
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
 * The lap a run's splits are cut on, in metres.
 *
 * Splits were the one surface a label swap could not fix — the ROWS are a
 * different length per unit — so `calculateSplits` takes this rather than
 * a formatter taking a unit. A saved run still stores kilometre splits;
 * `SPLIT_LAP_IS_METRIC` marks that write, and an imperial reader gets mile
 * laps recomputed from the trace at display.
 */
export function lapMetresFor(unit: DistanceUnit): number {
  return unit === "mi" ? METRES_PER_MILE : 1000;
}

/**
 * The lap a run is SAVED with, which stays metric like every other stored
 * quantity here. The persisted rows are a record, not a display: an
 * imperial reader's mile laps are recomputed from `run.points`, so nothing
 * about a stored run changes when the preference flips — and a run with no
 * trace at all (treadmill, manual) keeps its kilometre rows, honestly
 * labelled as such.
 */
export const SPLIT_LAP_IS_METRIC = 1000;

/**
 * How far from the finish the "final stretch" cue fires, and what it is
 * called out loud.
 *
 * A trigger DISTANCE, not a label — the same class of decision as the
 * preset chips. 500 m is "the last half kilometre" to a metric runner;
 * converting it gives 0.31 miles, which is not a landmark anyone runs to.
 * The imperial equivalent is the quarter mile, which is one.
 */
export function finalStretchM(unit: DistanceUnit): number {
  return unit === "mi" ? METRES_PER_MILE / 4 : 500;
}

/**
 * Shoe replacement thresholds, in the KILOMETRES the shoe doc stores.
 *
 * Kept here beside the target bounds for the same reason those are: the
 * numbers are a fact about running shoes, not about how a user reads them,
 * so they must not drift when the display unit does. 600 km is ~373 miles;
 * an imperial reader sees that figure, and the same shoe is flagged.
 */
export const SHOE_MAX_DEFAULT_KM = 600;
export const SHOE_MAX_MIN_KM = 50;

/**
 * The distance-target preset chips, in metres, for the unit the user reads.
 *
 * A values question rather than a formatting one, which is why it is a
 * table and not a conversion. Rendering the metric set in miles gives
 * 0.62 / 1.86 / 3.11 / 6.21 — arithmetically correct and useless, because
 * a preset exists to be a round number you tap without thinking. The
 * imperial set is therefore the same INTENT translated (round 1 / 3 / 5 /
 * 10 in the reader's own unit), not the same metres relabelled.
 *
 * They are returned in metres because that is what the target stores; only
 * the choice of which metres differs.
 */
export function distancePresetsM(unit: DistanceUnit): number[] {
  const rounds = [1, 3, 5, 10];
  return rounds.map((v) => distanceToMetres(v, unit));
}

/**
 * The absolute bounds a distance target is clamped to, in metres.
 *
 * Deliberately NOT per-unit. The bound is a sanity check on how far someone
 * can plausibly set out to run, and that does not change with how they
 * read it — an imperial reader should not be able to enter a 160 km target
 * just because "100" is a round number in their box. The input's own
 * min/max attributes are these converted for display; the clamp itself
 * stays in metres.
 */
export const DISTANCE_TARGET_MIN_M = 500;
export const DISTANCE_TARGET_MAX_M = 100000;

/** Short distance suffix — `km` / `mi`. */
export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

/**
 * The SPOKEN unit noun — "kilometre" / "mile", pluralised.
 *
 * Audio is the one surface where converting the number is not enough. A
 * text label can say "mi" beside a figure; a voice has to say the word, and
 * "three point one kilometres" spoken over a mile figure is worse than
 * either consistent answer — the runner hears a unit that contradicts the
 * watch on their wrist.
 *
 * Written out in full rather than abbreviated because the whole cue module
 * is written for the EAR: TTS engines mangle "km", and "per K" is not what
 * a coach says.
 */
export function spokenDistanceUnit(unit: DistanceUnit, count: number): string {
  const noun = unit === "mi" ? "mile" : "kilometre";
  return count === 1 ? noun : `${noun}s`;
}

/** Pace suffix — `/km` / `/mi`. */
export function paceUnitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "/mi" : "/km";
}
