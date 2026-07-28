"use strict";

/**
 * ProgramExercise builder (packet 18) — server mirror of normalizeExercise in
 * src/features/program/programTypes.ts.
 *
 * addExercises / replaceExercise construct a fresh ProgramExercise server-side
 * from a catalog exercise (name derived from the catalog, category inferred) —
 * never trusting a client-supplied exercise object. The client builds the same
 * shape via normalizeExercise; this is its dependency-free CommonJS mirror.
 *
 * MUST return identical output to the client normalizeExercise for identical
 * input. The one intentional difference: normalizeExercise LAZILY generates a
 * random instanceId when absent, but the reducer must be DETERMINISTIC, so this
 * builder REQUIRES the caller to pass a stable instanceId (derived from the
 * commandId) rather than inventing one. Pinned in lockstep by
 * src/features/program/__tests__/programExerciseBuilder.cross.test.ts (which
 * passes a fixed instanceId to both copies and asserts equality).
 */

const { inferMovementCategory } = require("./exerciseMovementCategory");

/**
 * @param {object} ex - partial exercise with at least { name, exerciseId,
 *   instanceId }. Optional sets/reps/weight/... follow normalizeExercise
 *   defaults.
 * @returns {object} a full ProgramExercise
 */
function buildProgramExercise(ex) {
  if (!ex || typeof ex.name !== "string" || typeof ex.exerciseId !== "string") {
    throw new Error("buildProgramExercise requires name + exerciseId.");
  }
  if (typeof ex.instanceId !== "string" || ex.instanceId.length === 0) {
    // The server never invents ids — the reducer must pass a deterministic one.
    throw new Error("buildProgramExercise requires a stable instanceId.");
  }
  return {
    name: ex.name,
    exerciseId: ex.exerciseId,
    instanceId: ex.instanceId,
    movementCategory:
      ex.movementCategory ?? inferMovementCategory(ex.name, ex.exerciseId),
    sets: ex.sets ?? 3,
    reps: ex.reps ?? 8,
    baseReps: ex.baseReps ?? ex.reps ?? 8,
    // Optional fields must be carried explicitly, exactly as normalizeExercise
    // does — both rebuild the object field-by-field, so anything omitted is
    // silently stripped. These drifted in when P1 (repRangeMax / restSeconds /
    // isAccessory) and #5 (baseSets / preDeloadWeight) landed client-side
    // only; the cross-test matrix didn't vary them, so nothing caught it.
    // Conditional spread keeps `undefined` out (Firestore rejects it).
    ...(ex.repRangeMax !== undefined ? { repRangeMax: ex.repRangeMax } : {}),
    ...(ex.baseSets !== undefined ? { baseSets: ex.baseSets } : {}),
    ...(ex.preDeloadWeight !== undefined
      ? { preDeloadWeight: ex.preDeloadWeight }
      : {}),
    ...(ex.preDeloadReps !== undefined
      ? { preDeloadReps: ex.preDeloadReps }
      : {}),
    ...(ex.restSeconds !== undefined ? { restSeconds: ex.restSeconds } : {}),
    ...(ex.isAccessory !== undefined ? { isAccessory: ex.isAccessory } : {}),
    weight: ex.weight ?? 0,
    progressionType: ex.progressionType ?? "linear",
    lastSuccessfulWeight: ex.lastSuccessfulWeight ?? ex.weight ?? 0,
    lastAttemptedWeight: ex.lastAttemptedWeight ?? ex.weight ?? 0,
    consecutiveFailures: ex.consecutiveFailures ?? 0,
    plateauCount: ex.plateauCount ?? 0,
    performanceHistory: ex.performanceHistory ?? [],
    lastPerformance: ex.lastPerformance ?? null,
    ...(ex.notes !== undefined ? { notes: ex.notes } : {}),
  };
}

module.exports = { buildProgramExercise };
