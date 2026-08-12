"use strict";

/**
 * The ONE mapping from a source activity doc to the lifetime total it
 * contributes — shared by the accrual side (`onWorkoutCreated` /
 * `onRunCreated`) and the reversal side (`onWorkoutDeleted` /
 * `onRunDeleted`).
 *
 * WHY THIS MODULE EXISTS AT ALL. ADR-0012 makes one load-bearing
 * constraint on the delete path: "The reversal MUST call the same function
 * that computed the accrual, not a copy of it." Before this module there
 * was no such function — both amounts were inline expressions in the
 * trigger bodies, so a reversal would have had to restate them, and a
 * restated formula is the tested-copy-vs-running-copy drift this codebase
 * pays for most often. Extracting them is what makes the constraint
 * satisfiable rather than aspirational.
 *
 * These are deliberately EXACT transcriptions of the expressions the
 * create triggers already ran, `||` semantics included. This module was a
 * refactor-to-share, not a fix: changing what a workout is worth while
 * moving it would have made every downstream difference ambiguous.
 *
 * Note the asymmetry with challenge progress, which needs no equivalent:
 * the challenge marker records `incrementBy`, so its reversal reads back
 * the exact figure that was applied and never re-derives anything. The
 * lifetime marker records no amount, which is precisely why the lifetime
 * side needs a shared derivation — and why `accrueLifetimeStat` now also
 * stamps `appliedValue` on new markers, so future reversals can prefer the
 * recorded figure over any derivation at all.
 */

/** Lift tonnage (kg) a workout doc contributes to `lifetime.liftVolumeKg`. */
function liftVolumeKgFor(data) {
  return Number(data && data.totalVolume) || 0;
}

/**
 * Metres a run doc contributes to `lifetime.runMeters`.
 *
 * `distance` is metres on the doc; `distanceKm` is the legacy fallback.
 * The `||` chain (rather than an explicit presence check) is the create
 * side's own behaviour, preserved: a NaN / absent / zero `distance` falls
 * through to the km field.
 */
function runMetersFor(data) {
  const meters = Number(data && data.distance) || 0;
  if (meters) return meters;
  return (Number(data && data.distanceKm) || 0) * 1000;
}

/** Dispatch by the `kind` used in the lifetime marker path. */
function lifetimeAmountFor(kind, data) {
  if (kind === "lift") return liftVolumeKgFor(data);
  if (kind === "run") return runMetersFor(data);
  return 0;
}

module.exports = { liftVolumeKgFor, runMetersFor, lifetimeAmountFor };
