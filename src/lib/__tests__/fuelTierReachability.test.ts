/**
 * How often the day-load fuel shift actually shifts anything.
 *
 * `dayIntensity.ts` defines four tiers and a fat↔carb shift per tier — REST 0,
 * EASY 100, MODERATE 250, HARD 450 kcal moved out of fat and into carbs at
 * constant calories. `getAdjustedTargets` applies it, but only down to a floor:
 * 0.8 g/kg for EASY/MODERATE, 0.6 g/kg (the essential backstop) for HARD.
 *
 * The floor, not the shift, is usually what binds. `cutG` is
 * `min(desiredCut, baselineFat − tierFloor)`, and `baselineFat` is a fraction
 * of CALORIES while the floor is a multiple of BODYWEIGHT — so the lower a
 * user's calories relative to their mass, the smaller the room to shift, until
 * there is none. The header for the essential floor already says as much
 * ("periodization is intentionally inert there"). What nobody had was the size
 * of "there".
 *
 * Measured 2026-08-11 over 55,200 profiles built by the app's OWN pipeline —
 * `calculateTDEE` (Mifflin-St Jeor, real activity multipliers, the 1200 kcal
 * safety floor) across sex × age × height × weight (BMI 18-35) × activity ×
 * goal-rate — then `getAdjustedTargets` for each of the four tiers:
 *
 *   EASY fat === MODERATE fat      70.5%   ← structural, see below
 *   MODERATE fat === HARD fat      21.9%
 *   all four tiers identical       21.9%
 *
 * and it lands almost entirely on people in a deficit:
 *
 *   cut  −1.0 kg/wk    73.1% get identical macros every day
 *   cut  −0.5 kg/wk    36.1%     (the default cut band)
 *   cut  −0.25 kg/wk   17.4%
 *   recomp              4.4%
 *   lean bulk +0.25     0.2%
 *   lean bulk +0.5      0.0%
 *
 * Two separate things are in that table and they have different causes.
 *
 * **EASY ≡ MODERATE is structural, not about deficits.** Those two tiers share
 * one floor (0.8 g/kg), so they can only differ when the room to shift exceeds
 * EASY's own 100 kcal — i.e. `baselineFat − 0.8·weight > 100/9 g`. Below that
 * both bottom out on the same floor and the 150 kcal between their shifts
 * means nothing. Seven users in ten sit below it.
 *
 * **The full collapse is about deficits**, and its direction is worth stating:
 * the fuel periodisation works for people gaining or maintaining and largely
 * disappears for people cutting — who are arguably the ones with the least
 * glycogen to spare and the most to gain from steering it at hard days.
 *
 * **The tuning surface is not where it looks.** The four shift constants read
 * like the knobs of this feature, and mostly they are not the binding
 * constraint — the floors are:
 *
 *   EASY's own 100 kcal decides the answer for   29.5% of profiles
 *   MODERATE's 250                                7.4%
 *   HARD's 450                                    3.4%
 *
 * So the biggest shift in the system is the one that least often does
 * anything: for 96.6% of users the essential fat floor is reached before
 * HARD's 450 kcal is spent, and its value is irrelevant to them. This is not
 * incidental — it was found by mutation, when changing HARD 450 → 300 left
 * every measurement in this file untouched, and it is now pinned below rather
 * than left as a hole.
 *
 * This changes no policy. Where the floors sit is a nutrition decision, and
 * `docs/training-programming-claude-handoff.md` bars inferring one from here.
 * These tests exist so that decision is made against a number, and against
 * the right number — someone retuning this feature by moving HARD's shift
 * would, for all but 3.4% of users, be moving nothing at all.
 *
 * Scope note: the shift is Pro-gated (`useEffectiveTargets` computes free users
 * as REST), so this describes what a paying user gets. The day LABEL is
 * deliberately derived from the real day for everyone and never asserts a macro
 * change — that split is documented at its own site and is not what this
 * measures.
 */
import { describe, it, expect } from "vitest";
import { getAdjustedTargets } from "../phaseNutrition";
import { calculateTDEE, type ActivityLevel, type FitnessGoal } from "../tdee";
import {
  offsetFromWeeklyRate,
  FAT_CALORIE_FRACTION,
  DAILY_FAT_FLOOR_PER_KG,
  ESSENTIAL_FAT_FLOOR_PER_KG,
} from "../macroConstants";
import { fuelShiftCalsForTier } from "../dayIntensity";
import type { UserProfile } from "../auth";
import type { DayIntensity } from "../dayIntensity";

const TIERS: DayIntensity[] = ["REST", "EASY", "MODERATE", "HARD"];
const ACTIVITIES: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
/** Goal + the weekly rate the user picks for it, spanning the real UI range. */
const GOAL_RATES: [FitnessGoal, number][] = [
  ["cut", -1.0],
  ["cut", -0.5],
  ["cut", -0.25],
  ["recomp", 0],
  ["lean bulk", 0.25],
  ["lean bulk", 0.5],
];

function profileFor(
  weightKg: number,
  targetCalories: number,
  goal: FitnessGoal
): UserProfile {
  return {
    weightKg,
    targetCalories,
    // The phase lives on program.goal — the single sanctioned reader
    // (getNutritionPhase) looks nowhere else, and it drives the protein
    // multiplier, so a fixture that omits it silently tests "recomp".
    program: { goal, currentPhase: "base" },
  } as unknown as UserProfile;
}

interface Row {
  goal: FitnessGoal;
  rate: number;
  weightKg: number;
  targetCalories: number;
  fats: number[];
  carbs: number[];
  aggressive: boolean;
}

/** The app's own population, built through its own calorie pipeline. */
function sweep(): Row[] {
  const rows: Row[] = [];
  for (const sex of ["male", "female"] as const) {
    for (let age = 20; age <= 65; age += 5) {
      for (let h = 155; h <= 195; h += 5) {
        for (let w = 50; w <= 125; w += 5) {
          const bmi = w / (h / 100) ** 2;
          if (bmi < 18 || bmi > 35) continue; // plausible bodies only
          for (const act of ACTIVITIES) {
            for (const [goal, rate] of GOAL_RATES) {
              const { targetCalories } = calculateTDEE(
                w,
                h,
                age,
                act,
                goal,
                sex,
                offsetFromWeeklyRate(rate)
              );
              const out = TIERS.map((tier) =>
                getAdjustedTargets(
                  profileFor(w, targetCalories, goal),
                  "rest",
                  undefined,
                  tier
                )
              );
              rows.push({
                goal,
                rate,
                weightKg: w,
                targetCalories,
                fats: out.map((o) => o.fat),
                carbs: out.map((o) => o.carbs),
                aggressive: out.some((o) => o.aggressive),
              });
            }
          }
        }
      }
    }
  }
  return rows;
}

const ROWS = sweep();
const flat = (r: Row) => new Set(r.fats).size === 1;

describe("fuel tiers — how often the shift shifts anything", () => {
  it("the population is the app's own, and large enough to mean something", () => {
    expect(ROWS).toHaveLength(55200);
  });

  it("EASY and MODERATE give the same fat for most users", () => {
    /* The middle two tiers of a four-tier system. 150 kcal separates their
       shifts on paper; for seven users in ten it separates nothing, because
       both land on the shared 0.8 g/kg floor. */
    const same = ROWS.filter((r) => r.fats[1] === r.fats[2]).length;
    expect(same).toBe(38934);
    expect(same / ROWS.length).toBeGreaterThan(0.7);
  });

  it("one user in five gets identical macros on every day type", () => {
    expect(ROWS.filter(flat).length).toBe(12062);
  });

  it("the collapse lands on people cutting, not people gaining", () => {
    const rateOf = (rate: number) => {
      const of = ROWS.filter((r) => r.rate === rate);
      return of.filter(flat).length / of.length;
    };
    // Ordered, not just individually bounded: the deeper the deficit the more
    // of the periodisation disappears, monotonically.
    const deepCut = rateOf(-1.0);
    const stdCut = rateOf(-0.5);
    const lightCut = rateOf(-0.25);
    const recomp = rateOf(0);
    const bulk = rateOf(0.5);
    expect(deepCut).toBeGreaterThan(stdCut);
    expect(stdCut).toBeGreaterThan(lightCut);
    expect(lightCut).toBeGreaterThan(recomp);
    expect(recomp).toBeGreaterThan(bulk);

    expect((deepCut * 100).toFixed(1)).toBe("73.1");
    expect((stdCut * 100).toFixed(1)).toBe("36.1"); // the DEFAULT cut band
    expect((bulk * 100).toFixed(1)).toBe("0.0");
  });

  it("the aggressive flag is reachable but rare", () => {
    /* Protein at bodyweight plus the essential fat floor overrunning the whole
       budget. It needs a heavy user on a deep cut — real, but 1.5% of the
       population, so it is an edge the UI must handle rather than a state the
       average user meets. It is also sensitive to the protein multiplier: a
       cut pins 2.2 g/kg, and a fixture that forgets to set `program.goal`
       silently measures "recomp" at 2.0 and undercounts this by a third. */
    const agg = ROWS.filter((r) => r.aggressive).length;
    expect(agg).toBe(1318);
    expect((( agg / ROWS.length) * 100).toFixed(1)).toBe("2.4");
  });
});

describe("fuel tiers — the mechanism, stated so the numbers aren't a black box", () => {
  it("EASY and MODERATE separate exactly when the room exceeds EASY's shift", () => {
    /* The algebra behind the 70.5%, checked against the engine rather than
       asserted about it: both tiers cut toward the SAME floor, so they differ
       only once `baselineFat − floor` is larger than EASY's own desired cut. */
    const w = 70;
    const floorG = Math.round(DAILY_FAT_FLOOR_PER_KG * w); // 56 g
    const easyDesiredG = Math.round(fuelShiftCalsForTier("EASY") / 9); // 11 g
    // Solve for the calorie level where baselineFat exceeds floor + EASY's cut.
    const boundary = ((floorG + easyDesiredG) * 9) / FAT_CALORIE_FRACTION;
    expect(Math.round(boundary)).toBe(2412);

    const below = (c: number) =>
      TIERS.map((t) => getAdjustedTargets(profileFor(w, c, "cut"), "rest", undefined, t).fat);
    // 200 kcal either side of the boundary — the same user, one meaningful
    // difference between them.
    expect(below(2200)[1]).toBe(below(2200)[2]); // EASY === MODERATE
    expect(below(2600)[1]).not.toBe(below(2600)[2]);
  });

  it("a 70 kg user cutting gets one fuel level below the boundary, two above", () => {
    const at = (c: number) =>
      TIERS.map((t) => {
        const o = getAdjustedTargets(profileFor(70, c, "cut"), "rest", undefined, t);
        return `${o.carbs}C/${o.fat}F`;
      });
    // Below: rest, easy and moderate days are indistinguishable.
    expect(at(2000)).toEqual([
      "220C/56F",
      "220C/56F",
      "220C/56F",
      "252C/42F",
    ]);
    // Above: four distinct days, which is what the feature promises.
    expect(new Set(at(2800)).size).toBe(4);
  });

  it("the shift constants are rarely the binding constraint — the floors are", () => {
    /* Which of the two terms in `min(desiredCut, baselineFat − floor)` decides
       the answer, counted across the population. This is the test that closes
       the hole mutation-testing found: without it, HARD's 450 could be changed
       to anything and nothing in this file would notice, because for 96.6% of
       users the floor is reached first.

       Recomputed here from the constants rather than read out of the engine,
       deliberately — the point is to state the relationship the engine leaves
       implicit, and a reader can check the arithmetic against
       `getAdjustedTargets` line by line. */
    const bindingCount = (tier: DayIntensity, floorPerKg: number) =>
      ROWS.filter((r) => {
        const baselineFat = Math.round(
          (FAT_CALORIE_FRACTION * r.targetCalories) / 9
        );
        const floorG = Math.round(floorPerKg * r.weightKg);
        return baselineFat - floorG > Math.round(fuelShiftCalsForTier(tier) / 9);
      }).length;

    const easy = bindingCount("EASY", DAILY_FAT_FLOOR_PER_KG);
    const moderate = bindingCount("MODERATE", DAILY_FAT_FLOOR_PER_KG);
    const hard = bindingCount("HARD", ESSENTIAL_FAT_FLOOR_PER_KG);

    expect(easy).toBe(16266); // 29.5%
    expect(moderate).toBe(4076); //  7.4%
    expect(hard).toBe(1861); //  3.4%

    // The ordering is the statement: the LARGER the authored shift, the LESS
    // often it is what actually decides the day's fat.
    expect(easy).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(hard);
    expect(hard / ROWS.length).toBeLessThan(0.05);
  });

  it("HARD's shift does bind — but only well above the collapse zone", () => {
    /* Concretely, for a 70 kg user the essential floor (42 g) is reached
       before 450 kcal is spent until roughly 3300 kcal; past that the shift
       itself is the constraint and HARD's fat rises off the floor. Both sides
       asserted, so the constant is genuinely covered. */
    const hardFat = (c: number) =>
      getAdjustedTargets(profileFor(70, c, "lean bulk"), "rest", undefined, "HARD").fat;
    expect(hardFat(3300)).toBe(42); // floor-bound
    expect(hardFat(3400)).toBe(44); // shift-bound
    expect(hardFat(3800)).toBe(56);
  });

  it("a heavy user on a deep cut gets no periodisation at all", () => {
    /* The floor is a multiple of BODYWEIGHT and the baseline a fraction of
       CALORIES, so mass and deficit push in the same direction. At 110 kg and
       2200 kcal the baseline (61 g) is already BELOW the essential floor
       (66 g), so every tier is raised back up to the same number and the shift
       has nothing to give. */
    const fats = TIERS.map(
      (t) => getAdjustedTargets(profileFor(110, 2200, "cut"), "rest", undefined, t).fat
    );
    expect(fats).toEqual([66, 66, 66, 66]);
  });
});
