import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  calculateTDEE,
  splitMacrosForTarget,
  type ActivityLevel,
  type FitnessGoal,
} from "../tdee";
import { getAdjustedTargets } from "../phaseNutrition";
import {
  ESSENTIAL_FAT_FLOOR_PER_KG,
  FAT_CALORIE_FRACTION,
  GOAL_CALORIE_OFFSET,
  KCAL_PER_KG,
  MIN_TARGET_CALORIES,
  floorTargetCalories,
  offsetFromWeeklyRate,
} from "../macroConstants";
import {
  fatFloorPerKgForTier,
  fuelShiftCalsForTier,
  type DayIntensity,
} from "../dayIntensity";
import type { UserProfile } from "../auth";

/**
 * The energy and macro maths as properties: the TDEE formula's direction,
 * the calorie floor, and the split's one invariant, that protein, carbs
 * and fat come to the calories (to rounding) unless the target cannot
 * hold the essential fat at all, which is flagged.
 */

const ACTIVITY: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const TIERS: DayIntensity[] = ["REST", "EASY", "MODERATE", "HARD"];

const weight = fc.double({ min: 35, max: 250, noNaN: true });
const height = fc.double({ min: 120, max: 220, noNaN: true });
const age = fc.integer({ min: 14, max: 95 });
const activity = fc.constantFrom(...ACTIVITY);
const goal = fc.constantFrom<FitnessGoal>("cut", "recomp", "lean bulk");
const sex = fc.constantFrom<"male" | "female">("male", "female");
const tier = fc.constantFrom(...TIERS);

/**
 * A calorie target and a body weight. One draw in four puts the target
 * within 12 kcal of what the essential fat alone costs at that weight,
 * where the split's edges are (infeasible or not, a remainder that rounds
 * to -0); a hundred uniform targets almost never land there.
 */
const targetAndWeight = (min: number) =>
  fc.oneof(
    {
      weight: 3,
      arbitrary: fc.tuple(fc.integer({ min, max: 6000 }), weight),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(weight, fc.integer({ min: -12, max: 12 }))
        .map(([w, off]): [number, number] => [
          Math.max(min, Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * w) * 9 + off),
          w,
        ]),
    }
  );

const kcal = (m: { protein: number; carbs: number; fat: number }) =>
  m.protein * 4 + m.carbs * 4 + m.fat * 9;

describe("calculateTDEE", () => {
  it("BMR rises with weight and height, falls with age, and a woman's is 166 kcal under a man's", () => {
    assertProperty(
      fc.property(
        weight,
        height,
        age,
        activity,
        goal,
        fc.double({ min: 0.5, max: 30, noNaN: true }),
        (w, h, a, act, g, more) => {
          const base = calculateTDEE(w, h, a, act, g).bmr;
          expect(
            calculateTDEE(w + more, h, a, act, g).bmr
          ).toBeGreaterThanOrEqual(base);
          expect(
            calculateTDEE(w, h + more, a, act, g).bmr
          ).toBeGreaterThanOrEqual(base);
          expect(calculateTDEE(w, h, a + 1, act, g).bmr).toBeLessThan(base);
          // Both named: with no sex the formula takes the midpoint, not a
          // man's (A5 STATUS, #3489), so `base` is 83 under a man's.
          expect(
            calculateTDEE(w, h, a, act, g, "male").bmr -
              calculateTDEE(w, h, a, act, g, "female").bmr
          ).toBe(166);
        }
      )
    );
  });

  it("a more active level never means a lower TDEE", () => {
    assertProperty(
      fc.property(weight, height, age, goal, sex, (w, h, a, g, s) => {
        const tdees = ACTIVITY.map(
          (act) => calculateTDEE(w, h, a, act, g, s).tdee
        );
        for (let i = 1; i < tdees.length; i++)
          expect(tdees[i]).toBeGreaterThanOrEqual(tdees[i - 1]);
        // And the levels differ: an athlete burns more than a desk job.
        expect(tdees[tdees.length - 1]).toBeGreaterThan(tdees[0]);
      })
    );
  });

  it("the target is never below min(TDEE, 1200), and the offset asked for is applied unless that would cross it", () => {
    assertProperty(
      fc.property(
        weight,
        height,
        age,
        activity,
        goal,
        sex,
        fc.option(fc.double({ min: -2, max: 2, noNaN: true }), {
          nil: undefined,
        }),
        (w, h, a, act, g, s, rate) => {
          const offset =
            rate === undefined ? undefined : offsetFromWeeklyRate(rate);
          const r = calculateTDEE(w, h, a, act, g, s, offset);
          const floor = Math.min(r.tdee, MIN_TARGET_CALORIES);
          expect(r.targetCalories).toBeGreaterThanOrEqual(floor);
          // The offset asked for: the rate's, else the goal's own band.
          const asked = offset ?? GOAL_CALORIE_OFFSET[g] ?? 0;
          if (r.tdee + asked >= floor) {
            // Compared by value: a tiny rate asks for -0 kcal.
            expect(r.targetCalories - (r.tdee + asked)).toBe(0);
            expect(r.deficit - asked).toBe(0);
          } else {
            // Floored: the target is the floor, and the deficit says how
            // much of the asked-for deficit was applied, never more.
            expect(r.targetCalories).toBe(floor);
            expect(r.deficit).toBeGreaterThan(asked);
            expect(r.deficit).toBeLessThanOrEqual(0);
          }
        }
      )
    );
  });
});

describe("macroConstants", () => {
  it("the calorie floor only ever raises a target, and never above maintenance or 1200", () => {
    assertProperty(
      fc.property(
        fc.integer({ min: -3000, max: 6000 }),
        fc.integer({ min: 800, max: 5000 }),
        (t, maintenance) => {
          const floored = floorTargetCalories(t, maintenance);
          expect(floored).toBeGreaterThanOrEqual(t);
          if (floored !== t)
            expect(floored).toBe(Math.min(maintenance, MIN_TARGET_CALORIES));
        }
      )
    );
  });

  it("a weekly rate's daily offset is the rate's energy over seven days, to the nearest 10", () => {
    assertProperty(
      fc.property(fc.double({ min: -2, max: 2, noNaN: true }), (rate) => {
        const offset = offsetFromWeeklyRate(rate);
        expect(Math.abs(offset % 10)).toBe(0);
        expect(Math.abs(offset - (rate * KCAL_PER_KG) / 7)).toBeLessThanOrEqual(
          5
        );
        expect(Math.sign(offset) * Math.sign(rate)).toBeGreaterThanOrEqual(0);
      })
    );
  });
});

describe("splitMacrosForTarget", () => {
  it("grams are never negative, fat never under the essential floor, protein never over what the goal asked", () => {
    assertProperty(
      fc.property(
        targetAndWeight(0),
        fc.double({ min: 0, max: 3, noNaN: true }),
        ([t, w], m) => {
          const s = splitMacrosForTarget(t, w, m);
          expect(s.protein).toBeGreaterThanOrEqual(0);
          expect(s.carbs).toBeGreaterThanOrEqual(0);
          expect(s.fat).toBeGreaterThanOrEqual(
            Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * w)
          );
          // What the goal asks: the multiplier times bodyweight.
          const asked = Math.round(m * w);
          expect(s.proteinUncapped).toBe(asked);
          expect(s.protein).toBeLessThanOrEqual(asked);
          // A protein cut below what was asked is always reported.
          if (s.protein < asked) expect(s.proteinCapped).toBe(true);
        }
      )
    );
  });

  it("the grams come to the target within 2 kcal, unless the target cannot hold the essential fat", () => {
    assertProperty(
      fc.property(
        targetAndWeight(0),
        fc.double({ min: 0, max: 3, noNaN: true }),
        ([t, w], m) => {
          const s = splitMacrosForTarget(t, w, m);
          // Infeasible exactly when the essential fat alone costs more
          // than the target.
          const essentialKcal = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * w) * 9;
          expect(s.infeasible).toBe(t < essentialKcal);
          if (!s.infeasible)
            expect(Math.abs(kcal(s) - t)).toBeLessThanOrEqual(2);
        }
      )
    );
  });
});

describe("getAdjustedTargets", () => {
  const profileFor = (calories: number, w: number, g: FitnessGoal) =>
    ({
      targetCalories: calories,
      weightKg: w,
      program: { goal: g, currentPhase: "base" },
    }) as unknown as UserProfile;

  it("every tier keeps the calories, and the grams reconcile to them or the day is flagged infeasible", () => {
    assertProperty(
      fc.property(targetAndWeight(1), goal, tier, ([cal, w], g, t) => {
        const day = getAdjustedTargets(
          profileFor(cal, w, g),
          "rest",
          undefined,
          t
        );
        expect(day.calories).toBe(cal);
        expect(day.protein).toBeGreaterThanOrEqual(0);
        expect(day.carbs).toBeGreaterThanOrEqual(0);
        // 0 g, never -0 g, which a number formatter prints as "-0".
        expect(Object.is(day.carbs, -0)).toBe(false);
        expect(day.fat).toBeGreaterThanOrEqual(
          Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * w)
        );
        if (day.infeasible) expect(day.aggressive).toBe(true);
        else expect(Math.abs(kcal(day) - cal)).toBeLessThanOrEqual(2);
      })
    );
  });

  it("a harder day moves fat to carbs and never takes protein away", () => {
    assertProperty(
      fc.property(targetAndWeight(1), goal, ([cal, w], g) => {
        const days = TIERS.map((t) =>
          getAdjustedTargets(profileFor(cal, w, g), "rest", undefined, t)
        );
        for (let i = 1; i < days.length; i++) {
          expect(days[i].fat).toBeLessThanOrEqual(days[i - 1].fat);
          expect(days[i].protein).toBeGreaterThanOrEqual(days[i - 1].protein);
          if (!days[i].aggressive && !days[i - 1].aggressive)
            expect(days[i].carbs).toBeGreaterThanOrEqual(days[i - 1].carbs);
        }
      })
    );
  });

  it("a tier cuts fat from its baseline by at most its shift, and not below its own floor", () => {
    assertProperty(
      fc.property(targetAndWeight(1), goal, tier, ([cal, w], g, t) => {
        const day = getAdjustedTargets(
          profileFor(cal, w, g),
          "rest",
          undefined,
          t
        );
        const baseline = Math.round((FAT_CALORIE_FRACTION * cal) / 9);
        const essential = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * w);
        const tierFloor = Math.max(
          Math.round(fatFloorPerKgForTier(t) * w),
          essential
        );
        const shift = Math.round(fuelShiftCalsForTier(t) / 9);
        expect(day.fat).toBeGreaterThanOrEqual(Math.min(baseline, tierFloor));
        expect(day.fat).toBeGreaterThanOrEqual(baseline - shift);
        expect(day.fat).toBeLessThanOrEqual(Math.max(baseline, essential));
      })
    );
  });

  it("a rest day's split is splitMacrosForTarget's, gram for gram", () => {
    assertProperty(
      fc.property(targetAndWeight(1), goal, ([cal, w], g) => {
        const day = getAdjustedTargets(
          profileFor(cal, w, g),
          "rest",
          undefined,
          "REST"
        );
        const split = splitMacrosForTarget(
          day.calories,
          w,
          day.proteinUncapped / w
        );
        expect(split.proteinUncapped).toBe(day.proteinUncapped);
        expect({
          protein: split.protein,
          carbs: split.carbs,
          fat: split.fat,
          infeasible: split.infeasible,
          capped: split.proteinCapped,
          minFeasibleKcal: split.minFeasibleKcal,
        }).toEqual({
          protein: day.protein,
          carbs: day.carbs,
          fat: day.fat,
          infeasible: day.infeasible,
          capped: day.aggressive,
          minFeasibleKcal: day.minFeasibleKcal,
        });
      })
    );
  });
});
