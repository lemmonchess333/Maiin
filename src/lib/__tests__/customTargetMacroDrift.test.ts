/**
 * What a manual calorie override does to everything downstream of it.
 *
 * Settings → Nutrition has a free-text "Override daily target (optional)"
 * field. Setting it makes `adaptiveCalorieStatus` report `manual` and the
 * line under the calorie chain read "Manual target — you set this; adaptive
 * learning is paused."
 *
 * The override replaced `targetCalories` and nothing else. The macro triple
 * beside it stayed the FORMULA's, so a user pinning 1400 kcal on an 80 kg
 * body had a profile storing:
 *
 *   targetCalories 1400
 *   protein 176 · carbs 239 · fat 61   →  2209 kcal, 58% over
 *
 * and `buildGoalWeightPersistPayload` handed Settings the formula result for
 * display, so the calorie chain rendered "Daily target 2209 cal" directly
 * above the line claiming the user had set it. The Food page meanwhile reads
 * `profile.targetCalories` and splits it itself, so it showed 1400. Three
 * surfaces, two numbers, and the one the user actually typed appeared on
 * none of them.
 *
 * Same family as the stored-vs-displayed drift fixed alongside this: one
 * value moved and the values derived from it did not. The rule the project
 * already writes down — persist every mirrored and derived field in the same
 * write — applies to an override exactly as it applies to a goal change.
 *
 * NOT changed here: the override's own value. `floorTargetCalories` guards
 * the rate-derived path, and the sanitizer bounds the override at 0..10000,
 * so a target below 1200 is reachable by typing one. That is the user's
 * number and overriding it is a policy decision. What this makes true is that
 * whatever they type, the grams reconcile to it and a capped protein figure
 * is reported rather than applied in silence — so the notice on the pace
 * picker now fires for an override-induced cap too.
 */
import { describe, it, expect } from "vitest";
import { buildGoalWeightPersistPayload } from "../goalWeightPlan";
import type { GoalWeightProfileInputs } from "../goalWeightPlan";

const BODY: GoalWeightProfileInputs = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  activityLevel: "moderate",
  sex: "male",
};

function build(customCalorieTarget?: number) {
  return buildGoalWeightPersistPayload({
    profile: { ...BODY, customCalorieTarget },
    currentKg: 80,
    targetKg: 75,
    rateKgPerWeek: 0.5,
  });
}

const sum = (p: {
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}) => p.targetProtein * 4 + p.targetCarbs * 4 + p.targetFat * 9;

describe("a manual calorie override", () => {
  it("is the target the macros are split from", () => {
    const { payload } = build(1400);
    expect(payload.targetCalories).toBe(1400);
    // Per-gram rounding across three macros is the only slack allowed.
    expect(Math.abs(sum(payload) - 1400)).toBeLessThanOrEqual(9);
  });

  it("is the target the display surface is handed", () => {
    /* SettingsNutrition renders `tdee.targetCalories` as "Daily target" and
       `tdee.protein/carbs/fat` as the macro row, directly above the line
       saying the user set this number. It must be the number they set. */
    const { tdee, payload } = build(1400);
    expect(tdee.targetCalories).toBe(1400);
    expect(tdee.protein).toBe(payload.targetProtein);
    expect(tdee.carbs).toBe(payload.targetCarbs);
    expect(tdee.fat).toBe(payload.targetFat);
  });

  it("restates the deficit against maintenance rather than leaving it stale", () => {
    const { tdee } = build(1400);
    expect(tdee.deficit).toBe(1400 - tdee.tdee);
    // BMR and maintenance are formula facts and must not move with the pin.
    const { tdee: plain } = build();
    expect(tdee.bmr).toBe(plain.bmr);
    expect(tdee.tdee).toBe(plain.tdee);
  });

  it("keeps tdeeBase on the FORMULA target, which the adaptive engine reads", () => {
    const { payload, formulaTdee } = build(1400);
    expect(payload.tdeeBase).toBe(formulaTdee.targetCalories);
    expect(payload.tdeeBase).not.toBe(1400);
  });

  it("reports the protein cap a low override forces", () => {
    /* 900 kcal on an 80 kg body: essential fat alone is 48 g (432 kcal), so
       bodyweight protein cannot fit. Pre-fix this was invisible — the stored
       protein was the formula's 176 g and no flag was raised anywhere. */
    const { tdee } = build(900);
    expect(tdee.proteinCapped).toBe(true);
    expect(tdee.protein).toBeLessThan(tdee.proteinUncapped);
    expect(tdee.carbs).toBeGreaterThanOrEqual(0);
  });

  it("changes nothing when no override is set", () => {
    /* The guard that keeps this a fix rather than a rewrite: the ordinary
       path must be byte-identical, and `tdee` and `formulaTdee` must be the
       same object's values. */
    const { tdee, formulaTdee, payload } = build();
    expect(tdee).toEqual(formulaTdee);
    expect(payload.targetCalories).toBe(formulaTdee.targetCalories);
    expect(payload.targetProtein).toBe(formulaTdee.protein);
    expect(Math.abs(sum(payload) - payload.targetCalories)).toBeLessThanOrEqual(
      9
    );
  });

  it("treats 0 as no override, matching the field's own clearing behaviour", () => {
    /* The input writes `val || undefined`, so a cleared field is undefined and
       a typed 0 never persists. `|| tdee.targetCalories` is therefore load-
       bearing, not incidental — pinned so a `??` refactor cannot make a
       0-calorie target reachable. */
    const { payload } = build(0);
    expect(payload.targetCalories).toBeGreaterThan(1000);
  });
});
