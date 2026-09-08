/**
 * The macro split either reconciles to the target or SAYS it cannot.
 *
 * `splitMacrosForTarget` fixes fat at max(25 % of kcal, 0.6 g/kg) and
 * never caps it, so below the essential-fat floor's own cost the returned
 * grams exceed the target while protein and carbs read 0. That state was
 * real — a 100 kcal manual target rendered "0 g protein · 0 g carbs ·
 * 42 g fat" as the day's goals on three screens — and nothing named it.
 * Property: for every (weight, target) the split reconciles within
 * rounding, or `infeasible` is true and the target is below
 * `minFeasibleKcal`. Never both silent and broken.
 *
 * Floors and policy are untouched here: what a too-low target SHOULD
 * become is the owner's call. This pins only that the arithmetic tells the
 * truth about itself, on both splitters.
 */
import { describe, it, expect } from "vitest";
import { splitMacrosForTarget, calculateTDEE } from "@/lib/tdee";
import { getAdjustedTargets } from "@/lib/phaseNutrition";
import { ESSENTIAL_FAT_FLOOR_PER_KG } from "@/lib/macroConstants";
import type { UserProfile } from "@/lib/auth";

describe("splitMacrosForTarget — reconcile or declare infeasible", () => {
  it("over the whole plausible grid, the sum reconciles or the split is flagged", () => {
    let flagged = 0;
    let reconciled = 0;
    for (let kg = 40; kg <= 160; kg += 5) {
      for (let target = 0; target <= 4000; target += 25) {
        for (const mult of [1.6, 2.0, 2.2]) {
          const s = splitMacrosForTarget(target, kg, mult);
          const sum = s.protein * 4 + s.carbs * 4 + s.fat * 9;
          const essentialKcal = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * kg) * 9;
          expect(s.minFeasibleKcal).toBe(essentialKcal);
          if (s.infeasible) {
            flagged++;
            expect(target).toBeLessThan(s.minFeasibleKcal);
            expect(s.protein).toBe(0);
            expect(s.carbs).toBe(0);
            expect(sum).toBeGreaterThan(target);
          } else {
            reconciled++;
            // ±2 kcal: the carb remainder rounds to whole grams.
            expect(Math.abs(sum - target)).toBeLessThanOrEqual(2);
            expect(target).toBeGreaterThanOrEqual(s.minFeasibleKcal);
          }
        }
      }
    }
    // Both branches were exercised — a grid that never reached the floor
    // would pass the loop above vacuously.
    expect(flagged).toBeGreaterThan(0);
    expect(reconciled).toBeGreaterThan(flagged);
  });

  it("the reproduced case: 100 kcal at 70 kg is flagged, with fat alone over budget", () => {
    const s = splitMacrosForTarget(100, 70, 2.0);
    expect(s).toMatchObject({
      protein: 0,
      carbs: 0,
      fat: 42,
      infeasible: true,
      minFeasibleKcal: 378,
    });
  });

  it("the first reconcilable target is the essential-fat cost itself", () => {
    const kcal = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * 95) * 9; // 513
    expect(splitMacrosForTarget(kcal - 1, 95, 2.0).infeasible).toBe(true);
    expect(splitMacrosForTarget(kcal, 95, 2.0).infeasible).toBe(false);
  });

  it("non-finite input yields a flagged empty split, not NaN grams", () => {
    for (const [target, kg] of [
      [NaN, 70],
      [Infinity, 70],
      [2000, NaN],
      [2000, Infinity],
    ] as const) {
      const s = splitMacrosForTarget(target, kg, 2.0);
      expect(s).toEqual({
        protein: 0,
        carbs: 0,
        fat: 0,
        proteinCapped: false,
        proteinUncapped: 0,
        infeasible: true,
        minFeasibleKcal: 0,
      });
    }
  });

  it("calculateTDEE carries the flag through", () => {
    const r = calculateTDEE(70, 175, 30, "moderate", "recomp");
    expect(r.infeasible).toBe(false);
    expect(r.minFeasibleKcal).toBe(378);
  });
});

describe("getAdjustedTargets agrees with the split", () => {
  const profile = (targetCalories: number, weightKg: number) =>
    ({
      uid: "u",
      targetCalories,
      weightKg,
      program: { goal: "recomp", currentPhase: "base" },
    }) as unknown as UserProfile;

  it("flags the same targets the stored split flags", () => {
    for (const kg of [50, 70, 95, 120]) {
      for (const target of [50, 100, 250, 400, 600, 1200, 2200]) {
        const split = splitMacrosForTarget(target, kg, 2.0);
        const shown = getAdjustedTargets(profile(target, kg), "rest");
        expect(shown.infeasible, `kg=${kg} target=${target}`).toBe(
          split.infeasible
        );
        expect(shown.minFeasibleKcal).toBe(split.minFeasibleKcal);
        if (!shown.infeasible) {
          const sum = shown.protein * 4 + shown.carbs * 4 + shown.fat * 9;
          expect(Math.abs(sum - target)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});
