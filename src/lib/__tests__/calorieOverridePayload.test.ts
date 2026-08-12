/**
 * `buildCalorieOverridePayload` — the mirroring rule for a manual calorie
 * override written OUTSIDE the goal-weight recipe.
 *
 * The rule itself is old and hard-won; `buildGoalWeightPersistPayload`'s
 * `effectiveTdee` block records what breaks without it ("a user who pinned
 * 1400 kcal had a profile storing 1400 alongside a triple summing to 2209 —
 * 58% over"). What was missing was a way for a second writer to apply it.
 * `StallModal` wrote `customCalorieTarget` on its own and left every mirror
 * stale.
 *
 * So these pin the mirrors, not the arithmetic: the point is that all five
 * fields move together, and that the grams RECONCILE to the calories rather
 * than merely being present.
 */
import { describe, it, expect } from "vitest";
import { buildCalorieOverridePayload } from "@/lib/goalWeightPlan";

const PROFILE = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  activityLevel: "moderate" as const,
  sex: "male" as const,
  program: { goal: "cut" },
};

describe("buildCalorieOverridePayload", () => {
  it("writes the override and every mirror in one payload", () => {
    const p = buildCalorieOverridePayload({
      profile: PROFILE,
      overrideCalories: 2400,
    });
    // The field the adaptive layer reads to decide an override exists...
    expect(p.customCalorieTarget).toBe(2400);
    // ...and the field every display surface reads. These disagreeing IS
    // the bug: `useAdaptiveTdee` documents the invariant at the line that
    // reads it — "the stored base (already customCalorieTarget || formula)".
    expect(p.targetCalories).toBe(2400);
    expect(p.targetProtein).toBeGreaterThan(0);
    expect(p.targetCarbs).toBeGreaterThan(0);
    expect(p.targetFat).toBeGreaterThan(0);
  });

  it("returns macros that add up to the override, not to a stale target", () => {
    // The assertion that actually catches a stale split. Asserting the grams
    // are merely present passes against the old behaviour, where they were
    // present and belonged to a different calorie figure.
    const p = buildCalorieOverridePayload({
      profile: PROFILE,
      overrideCalories: 2400,
    });
    const kcal = p.targetProtein * 4 + p.targetCarbs * 4 + p.targetFat * 9;
    expect(Math.abs(kcal - 2400)).toBeLessThanOrEqual(10); // rounding only
  });

  it("moves the grams when the target moves", () => {
    const low = buildCalorieOverridePayload({
      profile: PROFILE,
      overrideCalories: 1800,
    });
    const high = buildCalorieOverridePayload({
      profile: PROFILE,
      overrideCalories: 2800,
    });
    expect(high.targetCarbs).toBeGreaterThan(low.targetCarbs);
  });

  it("follows the nutrition phase's protein multiplier", () => {
    // Cut carries a higher multiplier than lean bulk, so the same calories
    // split differently. Pins that the phase is read at all.
    const cut = buildCalorieOverridePayload({
      profile: PROFILE,
      overrideCalories: 2400,
    });
    const bulk = buildCalorieOverridePayload({
      profile: { ...PROFILE, program: { goal: "lean bulk" } },
      overrideCalories: 2400,
    });
    expect(cut.targetProtein).toBeGreaterThan(bulk.targetProtein);
  });

  it("survives a profile with no weight or goal", () => {
    // Cold start: a user can reach the plateau nudge before every profile
    // field is populated, and a NaN target would poison every macro surface.
    const p = buildCalorieOverridePayload({
      profile: {},
      overrideCalories: 2400,
    });
    for (const v of Object.values(p)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("rounds and floors at zero", () => {
    expect(
      buildCalorieOverridePayload({
        profile: PROFILE,
        overrideCalories: 2400.7,
      }).targetCalories
    ).toBe(2401);
    expect(
      buildCalorieOverridePayload({ profile: PROFILE, overrideCalories: -50 })
        .targetCalories
    ).toBe(0);
  });
});
