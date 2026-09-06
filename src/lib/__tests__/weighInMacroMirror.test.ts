/**
 * A weigh-in updates the macros that are functions of bodyweight.
 *
 * `weighInProfileMirror` (2026-08-05) fixed the anchor: the daily weigh-in
 * flow wrote `bodyweightLogs` and left `profile.weightKg` stale. This is the
 * next link. Two of the three stored macros are defined per kilogram —
 * protein is `multiplier × kg`, and the essential-fat floor is `0.6 × kg`,
 * with carbs balancing what those leave — so a weigh-in changes them by
 * arithmetic. Nothing recomputed them: `targetProtein` is written only by
 * onboarding, the Settings → Nutrition reactive effect, and the goal-reached
 * prompt. None fires on a weigh-in, so a user following the advertised daily
 * flow and never reopening Settings kept the macros of the body they had at
 * signup.
 *
 * Size of it, stated at its true size rather than the largest number
 * available. On a 90 → 78 kg cut with the calorie target held:
 *
 *   90 kg   stored 198 g   shown 198 g   adherence 100
 *   84 kg   stored 198 g   shown 185 g   adherence 100
 *   78 kg   stored 198 g   shown 172 g   adherence  96
 *
 * The adherence effect is mild — the scorer's protein rule is
 * `ratio >= 0.9 → 100`, and a 12 kg cut only reaches 0.87. The defect that
 * needs no tolerance analysis is the second column: Home's post-workout
 * "Ng protein for recovery" nudge reads the STORED scalar while the Food
 * page renders the LIVE split, so on the same day the two screens asked for
 * targets 26 g apart.
 */
import { describe, it, expect } from "vitest";
import { weighInProfilePatch } from "../bodyweightLogs";
import { getAdjustedTargets } from "../phaseNutrition";
import type { UserProfile } from "../auth";

/** Targets as persisted at 90 kg, never rewritten since. */
const AT_SETUP = {
  weightKg: 90,
  targetCalories: 2450,
  program: { goal: "cut" },
};

/** What the Food page renders for a given bodyweight at the same target. */
function shownAt(weightKg: number) {
  return getAdjustedTargets(
    {
      weightKg,
      targetCalories: AT_SETUP.targetCalories,
      program: { goal: "cut", currentPhase: "base" },
    } as unknown as UserProfile,
    "rest"
  );
}

describe("weighInProfilePatch", () => {
  it("writes the macros the Food page would render at the new weight", () => {
    /* The contract, stated as the equality that matters: what the weigh-in
       stores and what the user is shown must be the same split. Compared
       against getAdjustedTargets rather than against hand-computed grams, so
       the two cannot drift apart without this failing. */
    const patch = weighInProfilePatch(AT_SETUP, 78);
    const shown = shownAt(78);
    expect(patch).toEqual({
      weightKg: 78,
      targetProtein: shown.protein,
      targetCarbs: shown.carbs,
      targetFat: shown.fat,
    });
  });

  it("moves protein by the amount the drift had accumulated", () => {
    // The concrete number from the probe, so a change to the multiplier or
    // the split is visible here rather than only in a ratio.
    const patch = weighInProfilePatch(AT_SETUP, 78) as {
      targetProtein: number;
    };
    expect(patch.targetProtein).toBe(172);
    expect(198 - patch.targetProtein).toBe(26);
  });

  it("leaves the CALORIE target alone", () => {
    /* Deliberate, and the boundary of this fix. Protein and fat follow
       bodyweight by definition; the calorie target is a training decision —
       as you shrink, the same intake is a smaller deficit, which is the
       plateau the adaptive-TDEE layer exists to answer. A mirror function
       silently re-cutting calories on every weigh-in would be making that
       decision by accident. */
    const patch = weighInProfilePatch(AT_SETUP, 78);
    expect(patch).not.toHaveProperty("targetCalories");
  });

  it("still returns null when the weight has not meaningfully moved", () => {
    // The delta gate is inherited from weighInProfileMirror, not re-implemented.
    expect(weighInProfilePatch(AT_SETUP, 90)).toBeNull();
    expect(weighInProfilePatch(AT_SETUP, 90.04)).toBeNull();
    expect(weighInProfilePatch(AT_SETUP, 0)).toBeNull();
    expect(weighInProfilePatch(AT_SETUP, -5)).toBeNull();
  });

  it("fixes the anchor even when there is no target to split", () => {
    /* A profile mid-onboarding, or one whose targets were never written.
       Skipping the whole write to avoid a partial one would leave the
       original stale-anchor bug in place for exactly those users. */
    expect(weighInProfilePatch({ weightKg: 90 }, 78)).toEqual({ weightKg: 78 });
    expect(weighInProfilePatch(null, 78)).toEqual({ weightKg: 78 });
  });

  it("reads the goal for the protein multiplier, defaulting to recomp", () => {
    /* `program.goal` is the single sanctioned source (getNutritionPhase looks
       nowhere else). A patch that ignored it would quietly prescribe recomp
       protein to a cutter — the same fixture mistake that undercounted the
       aggressive-flag rate by a third earlier in this arc. */
    const cut = weighInProfilePatch(
      { ...AT_SETUP, program: { goal: "cut" } },
      80
    ) as { targetProtein: number };
    const bulk = weighInProfilePatch(
      { ...AT_SETUP, program: { goal: "lean bulk" } },
      80
    ) as { targetProtein: number };
    const unset = weighInProfilePatch(
      { weightKg: 90, targetCalories: AT_SETUP.targetCalories },
      80
    ) as { targetProtein: number };

    expect(cut.targetProtein).toBe(176); // 2.2 g/kg
    expect(bulk.targetProtein).toBe(144); // 1.8 g/kg
    expect(unset.targetProtein).toBe(160); // 2.0 g/kg — recomp default
  });

  it("keeps the written split internally consistent", () => {
    /* Whatever the weight, the stored triple must still add up to the target
       it was split from — the invariant the whole nutrition arc turns on.
       Note 90 is absent deliberately: it is AT_SETUP's own weight, so the
       delta gate returns null and there is no patch to check. */
    for (const w of [55, 70, 85, 120]) {
      const patch = weighInProfilePatch(AT_SETUP, w) as {
        targetProtein: number;
        targetCarbs: number;
        targetFat: number;
      };
      const sum =
        patch.targetProtein * 4 + patch.targetCarbs * 4 + patch.targetFat * 9;
      expect(Math.abs(sum - AT_SETUP.targetCalories)).toBeLessThanOrEqual(9);
    }
  });
});

// The Home write moved to weightEntry. everydayLogging.test.ts exercises the
// real transaction and verifies the profile-derived protein changes with it.
