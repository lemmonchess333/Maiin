"use strict";

/**
 * Workout-burn formula (packet 18) — server mirror of estimateLiftBurn /
 * selectLiftMET in src/lib/workoutBurn.ts.
 *
 * completeWorkoutDay computes the saved workout's totalCalories server-side, so
 * the calorie value must be IDENTICAL to what the client would have written.
 * src/lib/workoutBurn.ts is Vite/TS; this is its dependency-free CommonJS
 * mirror.
 *
 * MUST return identical output to the client estimateLiftBurn for identical
 * input. Pinned in lockstep by
 * src/features/program/__tests__/workoutBurn.cross.test.ts. Any formula change
 * must land on both copies in the same commit.
 */

function selectLiftMET(tonnageKg, durationMinutes) {
  if (tonnageKg === 0) return 4.5;
  if (durationMinutes <= 0) return 4.5;
  const density = tonnageKg / durationMinutes;
  if (density < 80) return 3.5;
  if (density < 200) return 4.5;
  return 5.5;
}

function estimateLiftBurn(params) {
  const { durationMinutes, tonnageKg, bodyweightKg, completedSetCount } = params;

  const effectiveDuration =
    durationMinutes > 0 ? durationMinutes : completedSetCount * 3;

  if (effectiveDuration === 0 || bodyweightKg <= 0) return 0;

  const met = selectLiftMET(tonnageKg, effectiveDuration);
  return Math.round((effectiveDuration * bodyweightKg * met) / 60);
}

module.exports = { selectLiftMET, estimateLiftBurn };
