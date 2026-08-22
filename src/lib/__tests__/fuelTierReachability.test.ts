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
 * Measured 2026-08-11 over 64,400 profiles built by the app's OWN pipeline —
 * `calculateTDEE` (Mifflin-St Jeor, real activity multipliers, the 1200 kcal
 * safety floor) across sex × age × height × weight (BMI 18-35) × activity ×
 * goal-rate — then `getAdjustedTargets` for each of the four tiers:
 *
 *   EASY fat === MODERATE fat      62.3%   ← structural, see below
 *   MODERATE fat === HARD fat      16.1%
 *   all four tiers identical       16.1%
 *
 * and it lands almost entirely on people in a deficit:
 *
 *   cut  −0.75 kg/wk   54.5% get identical macros every day  ("Fast")
 *   cut  −0.5  kg/wk   36.1%                                 ("Steady", default)
 *   cut  −0.25 kg/wk   17.4%                                 ("Relaxed")
 *   recomp              4.4%
 *   lean bulk +0.25     0.2%
 *   lean bulk +0.5      0.0%
 *
 * CORRECTION 2026-08-11, same day: the first version of this file swept a
 * −1.0 kg/wk cut and called its rate list "the real UI range". That rate is
 * not offered — the pace control has three options, 0.25 / 0.5 / 0.75 — and
 * the ±2.0 the profile sanitizer accepts is a schema bound, not a user-facing
 * one. Because the collapse rises monotonically with deficit depth, the
 * unreachable seventh of the population was also the worst-affected slice, so
 * every headline here was overstated: "all four tiers identical" read 21.9%
 * and is 16.1%; the deepest-cut row read 73.1% for a rate nobody can pick and
 * is 54.5% for the one they can. The finding survives the correction — this
 * is still a feature that half-disappears for aggressive cutters — but the
 * numbers a future retune would be argued from were wrong, which is the whole
 * point of measuring instead of asserting. Reading the control settles it in
 * one grep; assuming the schema bound is the UI bound does not.
 *
 * Two separate things are in that table and they have different causes.
 *
 * **EASY ≡ MODERATE is structural, not about deficits.** Those two tiers share
 * one floor (0.8 g/kg), so they can only differ when the room to shift exceeds
 * EASY's own 100 kcal — i.e. `baselineFat − 0.8·weight > 100/9 g`. Below that
 * both bottom out on the same floor and the 150 kcal between their shifts
 * means nothing. Six users in ten sit below it.
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
 *   EASY's own 100 kcal decides the answer for   37.7% of profiles
 *   MODERATE's 250                               13.2%
 *   HARD's 450                                    7.6%
 *
 * So the biggest shift in the system is the one that least often does
 * anything: for 92.4% of users the essential fat floor is reached before
 * HARD's 450 kcal is spent, and its value is irrelevant to them. This is not
 * incidental — it was found by mutation, when changing HARD 450 → 300 left
 * every measurement in this file untouched, and it is now pinned below rather
 * than left as a hole.
 *
 * This changes no policy. Where the floors sit is a nutrition decision, and
 * `docs/training-programming-claude-handoff.md` bars inferring one from here.
 * These tests exist so that decision is made against a number, and against
 * the right number — someone retuning this feature by moving HARD's shift
 * would, for all but 7.6% of users, be moving nothing at all.
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
/**
 * Goal + the weekly rate the user picks for it.
 *
 * These are the rates the app OFFERS, read off the control rather than
 * assumed: NutritionSection's "Weekly pace" SegmentedControl has exactly
 * three options — 0.25 "Relaxed", 0.5 "Steady", 0.75 "Fast" — signed by the
 * goal-weight direction, plus 0 for maintain.
 *
 * This list previously carried -1.0 and described itself as spanning "the
 * real UI range". It did not: the profile SANITIZER accepts ±2.0, and that
 * schema bound had been mistaken for a user-facing one. The error was not
 * cosmetic — a seventh of the population sat at a rate nobody can select, and
 * because the collapse rises monotonically with deficit depth, that seventh
 * was the worst-affected slice. Every headline number below was inflated by
 * it. Corrected 2026-08-11; the figures in the header are the reachable ones.
 */
const GOAL_RATES: [FitnessGoal, number][] = [
  ["cut", -0.75],
  ["cut", -0.5],
  ["cut", -0.25],
  ["recomp", 0],
  ["lean bulk", 0.25],
  ["lean bulk", 0.5],
  ["lean bulk", 0.75],
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
    expect(ROWS).toHaveLength(64400);
  });

  it("EASY and MODERATE give the same fat for most users", () => {
    /* The middle two tiers of a four-tier system. 150 kcal separates their
       shifts on paper; for seven users in ten it separates nothing, because
       both land on the shared 0.8 g/kg floor. */
    const same = ROWS.filter((r) => r.fats[1] === r.fats[2]).length;
    expect(same).toBe(40105);
    expect(same / ROWS.length).toBeGreaterThan(0.6);
  });

  it("one user in five gets identical macros on every day type", () => {
    expect(ROWS.filter(flat).length).toBe(10352);
  });

  it("the collapse lands on people cutting, not people gaining", () => {
    const rateOf = (rate: number) => {
      const of = ROWS.filter((r) => r.rate === rate);
      return of.filter(flat).length / of.length;
    };
    // Ordered, not just individually bounded: the deeper the deficit the more
    // of the periodisation disappears, monotonically.
    const deepCut = rateOf(-0.75);
    const stdCut = rateOf(-0.5);
    const lightCut = rateOf(-0.25);
    const recomp = rateOf(0);
    const bulk = rateOf(0.5);
    expect(deepCut).toBeGreaterThan(stdCut);
    expect(stdCut).toBeGreaterThan(lightCut);
    expect(lightCut).toBeGreaterThan(recomp);
    expect(recomp).toBeGreaterThan(bulk);

    expect((deepCut * 100).toFixed(1)).toBe("54.5"); // "Fast", the deepest offered
    expect((stdCut * 100).toFixed(1)).toBe("36.1"); // "Steady", the DEFAULT
    expect((bulk * 100).toFixed(1)).toBe("0.0");
  });

  it("the aggressive flag is reachable but rare", () => {
    /* Protein at bodyweight plus the essential fat floor overrunning the whole
       budget. It needs a heavy body on the "Fast" pace — real, but under 1% of
       the population, so it is an edge the UI must handle rather than a state
       the average user meets. It is also sensitive to the protein multiplier:
       a cut pins 2.2 g/kg, and a fixture that forgets to set `program.goal`
       silently measures "recomp" at 2.0 and undercounts this by a third.

       What it costs the affected user is measured in
       storedVsDisplayedMacros.test.ts — median 18 g of protein below plan,
       p90 46 g, max 74 g — and is now stated on the pace picker itself
       rather than left to be inferred from the grams. */
    const agg = ROWS.filter((r) => r.aggressive).length;
    expect(agg).toBe(536);
    expect(((agg / ROWS.length) * 100).toFixed(2)).toBe("0.83");
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
      TIERS.map(
        (t) =>
          getAdjustedTargets(profileFor(w, c, "cut"), "rest", undefined, t).fat
      );
    // 200 kcal either side of the boundary — the same user, one meaningful
    // difference between them.
    expect(below(2200)[1]).toBe(below(2200)[2]); // EASY === MODERATE
    expect(below(2600)[1]).not.toBe(below(2600)[2]);
  });

  it("a 70 kg user cutting gets one fuel level below the boundary, two above", () => {
    const at = (c: number) =>
      TIERS.map((t) => {
        const o = getAdjustedTargets(
          profileFor(70, c, "cut"),
          "rest",
          undefined,
          t
        );
        return `${o.carbs}C/${o.fat}F`;
      });
    // Below: rest, easy and moderate days are indistinguishable.
    expect(at(2000)).toEqual(["220C/56F", "220C/56F", "220C/56F", "252C/42F"]);
    // Above: four distinct days, which is what the feature promises.
    expect(new Set(at(2800)).size).toBe(4);
  });

  it("the shift constants are rarely the binding constraint — the floors are", () => {
    /* Which of the two terms in `min(desiredCut, baselineFat − floor)` decides
       the answer, counted across the population. This is the test that closes
       the hole mutation-testing found: without it, HARD's 450 could be changed
       to anything and nothing in this file would notice, because for 92.4% of
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
        return (
          baselineFat - floorG > Math.round(fuelShiftCalsForTier(tier) / 9)
        );
      }).length;

    const easy = bindingCount("EASY", DAILY_FAT_FLOOR_PER_KG);
    const moderate = bindingCount("MODERATE", DAILY_FAT_FLOOR_PER_KG);
    const hard = bindingCount("HARD", ESSENTIAL_FAT_FLOOR_PER_KG);

    expect(easy).toBe(24295); // 37.7%
    expect(moderate).toBe(8501); // 13.2%
    expect(hard).toBe(4899); //  7.6%

    // The ordering is the statement: the LARGER the authored shift, the LESS
    // often it is what actually decides the day's fat.
    expect(easy).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(hard);
    expect(hard / ROWS.length).toBeLessThan(0.1);
  });

  it("HARD's shift does bind — but only well above the collapse zone", () => {
    /* Concretely, for a 70 kg user the essential floor (42 g) is reached
       before 450 kcal is spent until roughly 3300 kcal; past that the shift
       itself is the constraint and HARD's fat rises off the floor. Both sides
       asserted, so the constant is genuinely covered. */
    const hardFat = (c: number) =>
      getAdjustedTargets(
        profileFor(70, c, "lean bulk"),
        "rest",
        undefined,
        "HARD"
      ).fat;
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
      (t) =>
        getAdjustedTargets(profileFor(110, 2200, "cut"), "rest", undefined, t)
          .fat
    );
    expect(fats).toEqual([66, 66, 66, 66]);
  });
});
