/**
 * The stored macro split vs the one the app shows you.
 *
 * Two writers produce a macro triple from the same profile:
 *
 *   calculateTDEE()      → persisted as profile.targetProtein/Carbs/Fat
 *                          (via resolveGoalWeightPersist)
 *   getAdjustedTargets() → what useEffectiveTargets renders on Food
 *
 * They are supposed to agree on a rest day with no tier shift. On an
 * aggressive cut they did not, because only the DISPLAY copy enforced the
 * essential-fat floor and the protein cap that follows from it. The stored
 * copy multiplied bodyweight by the goal multiplier and let carbs absorb the
 * overflow at zero.
 *
 * Why it mattered beyond tidiness: `profile.targetProtein` is not just a
 * display value. The performance engine's adherence factor scores
 * avgDailyProtein AGAINST IT (perfScoring computeAdherenceScore:
 * protRatio >= 0.9 ? 100 : ratio * 111). So a user who ate exactly the
 * protein the Food page asked of them was scored against a larger number
 * they were never shown, and lost adherence — and therefore PI — for
 * complying.
 *
 * Reachability, checked rather than assumed: the weekly-pace control
 * (NutritionSection SegmentedControl) offers 0.25 / 0.5 / 0.75 kg/wk only.
 * The profile sanitizer accepts ±2.0, so deeper rates exist in the schema,
 * but no UI writes them — a first probe that swept to -1.0 kg/wk measured
 * 2.8% of bodies affected, and 70% of those hits were at a rate no user can
 * select. At the rates the app actually offers it is 0.83% of a uniform
 * body/age/activity grid, concentrated entirely in "Fast" (0.75) with a
 * handful at "Steady" (0.5) — heavy bodies, where the deficit is largest in
 * absolute terms and the protein need is largest too.
 */
import { describe, it, expect } from "vitest";
import { calculateTDEE, type ActivityLevel } from "../tdee";
import { getAdjustedTargets } from "../phaseNutrition";
import {
  offsetFromWeeklyRate,
  ESSENTIAL_FAT_FLOOR_PER_KG,
  GOAL_PROTEIN,
} from "../macroConstants";
import type { UserProfile } from "../auth";

interface Body {
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  sex: "male" | "female";
  rate: number;
}

/** The worst case the picker can actually produce: 110 kg at 180 cm (BMI 34),
 *  65, sedentary, on the "Fast" (0.75 kg/wk) pace. Target lands at 1267 kcal —
 *  ABOVE the 1200 safety floor, so this is a target the app hands out, not one
 *  a clamp already caught. Bodyweight protein (242 g) plus the essential fat
 *  floor (66 g) want 1562 kcal of a 1267 kcal budget. */
const HEAVY_FAST_CUT: Body = {
  weightKg: 110,
  heightCm: 180,
  age: 65,
  activity: "sedentary",
  sex: "female",
  rate: -0.75,
};

/** Neither the essential-fat floor nor the protein cap binds here. */
const ORDINARY: Body = {
  weightKg: 75,
  heightCm: 185,
  age: 40,
  activity: "moderate",
  sex: "male",
  rate: -0.5,
};

function storedFor(b: Body) {
  return calculateTDEE(
    b.weightKg,
    b.heightCm,
    b.age,
    b.activity,
    "cut",
    b.sex,
    offsetFromWeeklyRate(b.rate)
  );
}

function displayedFor(b: Body, targetCalories: number) {
  return getAdjustedTargets(
    {
      weightKg: b.weightKg,
      targetCalories,
      program: { goal: "cut", currentPhase: "base" },
    } as unknown as UserProfile,
    "rest"
  );
}

describe("stored and displayed macros agree", () => {
  it("on an ordinary profile — the case that was never in doubt", () => {
    const stored = storedFor(ORDINARY);
    const shown = displayedFor(ORDINARY, stored.targetCalories);
    expect(shown.aggressive).toBe(false);
    expect(stored.protein).toBe(shown.protein);
    expect(stored.fat).toBe(shown.fat);
    expect(stored.carbs).toBe(shown.carbs);
  });

  it("on a heavy user at the fastest pace the picker offers", () => {
    const stored = storedFor(HEAVY_FAST_CUT);
    const shown = displayedFor(HEAVY_FAST_CUT, stored.targetCalories);

    // The state under test really is the aggressive one, not an ordinary
    // profile that happens to pass.
    expect(shown.aggressive).toBe(true);
    // …and it is reachable: this is a target the calorie floor let through,
    // not one clamped to MIN_TARGET_CALORIES.
    expect(stored.targetCalories).toBeGreaterThan(1200);

    expect(stored.protein).toBe(shown.protein);
    expect(stored.fat).toBe(shown.fat);
  });

  it("the stored split sums to the calorie target it was built from", () => {
    /* tdee.ts carries a comment claiming flooring carbs at 0 makes the stored
       split reconcile — "protein*4 + carbs*4 + fat*9 === targetCalories".
       That was true only while protein and fat fit inside the budget. When
       they do not, flooring carbs stops the number going negative and does
       nothing about the overshoot; the split summed ~1285 kcal against a
       1267 kcal target, and deeper still on heavier bodies. */
    const stored = storedFor(HEAVY_FAST_CUT);
    const sum = stored.protein * 4 + stored.carbs * 4 + stored.fat * 9;
    // Per-gram rounding across three macros; anything beyond that is a real
    // overshoot rather than a rounding artefact.
    expect(Math.abs(sum - stored.targetCalories)).toBeLessThanOrEqual(9);
  });

  it("never stores less fat than the essential floor", () => {
    const stored = storedFor(HEAVY_FAST_CUT);
    expect(stored.fat).toBeGreaterThanOrEqual(
      Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * HEAVY_FAST_CUT.weightKg)
    );
  });

  it("the adherence factor no longer punishes eating the shown target", () => {
    /* The consequence, computed the way perfScoring computes it. Eating
       exactly what the Food page asks must not read as a miss. */
    const stored = storedFor(HEAVY_FAST_CUT);
    const shown = displayedFor(HEAVY_FAST_CUT, stored.targetCalories);
    const protRatio = shown.protein / stored.protein;
    const protScore = protRatio >= 0.9 ? 100 : protRatio * 111;
    expect(protScore).toBe(100);
  });

  it("the cap only ever lowers protein, never raises it", () => {
    /* Guards the guard: the fix must not become a way to prescribe MORE
       protein than the goal multiplier asks for. Swept across the pace
       options the picker offers, on the body most likely to trip it. */
    for (const rate of [-0.25, -0.5, -0.75]) {
      const stored = storedFor({ ...HEAVY_FAST_CUT, rate });
      expect(stored.protein).toBeLessThanOrEqual(
        Math.round(GOAL_PROTEIN.cut * HEAVY_FAST_CUT.weightKg)
      );
      expect(stored.carbs).toBeGreaterThanOrEqual(0);
    }
  });
});
