"use strict";

/**
 * Server mirror of `src/lib/nutritionPhase.ts:getNutritionPhase` — the SINGLE
 * sanctioned reader of the user's nutrition phase.
 *
 * The phase lives on `profile.program.goal`, NOT at the top level and NOT on
 * `programState.goal`. The client accessor exists because ~10 sites used to
 * inline `profile?.program?.goal` with inconsistent fallbacks, and because an
 * earlier bug (`e1b0296`) shipped from an editor writing `programState.goal`
 * while every macro/calorie consumer read the profile copy.
 *
 * WHY THE SERVER NEEDED ONE TOO. `functions/performanceEngine.js` read
 * `profile.goal` — a top-level field on the user document that NOTHING has
 * ever written. Onboarding writes `program: { goal }`;
 * `buildGoalWeightPersistPayload` writes `program: { goal }`;
 * `GoalReachedSheet` writes the program mirror. So the scorer's `goal`
 * argument was `undefined` for every user, always, and all five goal-aware
 * behaviours in `perfScoring.scorePerformance` fell to their unknown branch —
 * on the ONLY copy that runs in production (`computePerformanceIndex` has no
 * client callers; the client reads the persisted doc).
 *
 * That is the same defect `performanceEngineParity.cross.test.ts` was written
 * to prevent, re-entering one level up. Its header records the original: "the
 * server copy silently lagged the client's goal-awareness … Drift fails CI."
 * The scorer parity it pins is real; the test hands BOTH copies the same
 * constructed profile object, so it can only ever pin the seam, never what
 * the call site feeds into it. Reachability over prose (ADR-0008) — the
 * companion wiring test drives the real call site instead.
 *
 * `"recomp"` is the default on both copies, and it is behaviourally identical
 * to the `undefined` the call site used to pass: every goal branch in the
 * scorer tests for `"cut"` or `"lean bulk"` explicitly and treats everything
 * else the same. So this fix changes NOTHING for a recomp or goal-less user
 * and corrects only the cut / lean-bulk users it was silently mis-scoring.
 */

/** The phase values that drive nutrition (calorie offset + macro split). */
const VALID_PHASES = ["cut", "lean bulk", "recomp"];

function getNutritionPhase(profile) {
  const g = profile && profile.program && profile.program.goal;
  return typeof g === "string" && VALID_PHASES.includes(g) ? g : "recomp";
}

module.exports = { getNutritionPhase, VALID_PHASES };
