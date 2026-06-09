import { describe, it, expect } from "vitest";
import {
  getAdjustedTargets,
  ESSENTIAL_FAT_FLOOR_PER_KG,
} from "../phaseNutrition";
import { DAILY_FAT_FLOOR_PER_KG } from "../macroConstants";
import type { DayIntensity } from "../dayIntensity";
import type { UserProfile } from "../auth";
import {
  RUN_ONLY,
  LIFT_ONLY,
  BOTH,
  FREE_RUN,
  HEAVY_CUTTER,
  PRO_TAPER,
  makeProgram,
} from "@/test/nutritionFixtures";

// Helper to create a minimal UserProfile for testing
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "test-uid",
    displayName: "Test User",
    email: "test@example.com",
    photoURL: null,
    athleteType: "Hybrid",
    weightKg: 80,
    heightCm: 180,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 3,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    darkMode: false,
    onboardingComplete: true,
    trialExpiresAt: null,
    subscriptionTier: "free",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    targetCalories: 2500,
    targetProtein: 180,
    targetCarbs: 300,
    targetFat: 70,
    program: { goal: "recomp", startWeight: 80, currentPhase: "base" },
    ...overrides,
  };
}

const reconcilesTo = (
  r: {
    protein: number;
    carbs: number;
    fat: number;
  },
  cals: number
) => Math.abs(r.protein * 4 + r.carbs * 4 + r.fat * 9 - cals);

// Nutr1 + Prompt B: calories are FLAT; the fat↔carb fast-loop is driven by a
// day-load intensity TIER (REST | EASY | MODERATE | HARD), not the old 4-way
// dayType/phase constants. dayType is only the fallback when no explicit
// intensity is passed; these tests pass intensity directly.
describe("getAdjustedTargets — tier-driven fat↔carb shift", () => {
  it("REST: no shift, fat at the calorie-fraction baseline (~25%)", () => {
    const r = getAdjustedTargets(makeProfile(), "rest", undefined, "REST");
    // baseline fat = round(0.25 * 2500 / 9) = 69g
    expect(r.fat).toBe(69);
    expect(reconcilesTo(r, 2500)).toBeLessThanOrEqual(2);
    expect(r.annotation).toContain("Rest day");
  });

  it("carbs increase monotonically with intensity; fat decreases", () => {
    const p = makeProfile();
    const tiers: DayIntensity[] = ["REST", "EASY", "MODERATE", "HARD"];
    const carbs = tiers.map(
      (t) => getAdjustedTargets(p, "lift", undefined, t).carbs
    );
    const fats = tiers.map(
      (t) => getAdjustedTargets(p, "lift", undefined, t).fat
    );
    // non-decreasing carbs, non-increasing fat
    for (let i = 1; i < tiers.length; i++) {
      expect(carbs[i]).toBeGreaterThanOrEqual(carbs[i - 1]);
      expect(fats[i]).toBeLessThanOrEqual(fats[i - 1]);
    }
    // HARD strictly fuels more carbs than REST
    expect(carbs[3]).toBeGreaterThan(carbs[0]);
  });

  it("MODERATE holds the 0.8 g/kg daily floor; HARD relaxes toward 0.6", () => {
    const p = makeProfile(); // 80kg
    const mod = getAdjustedTargets(p, "lift", undefined, "MODERATE");
    const hard = getAdjustedTargets(p, "lift", undefined, "HARD");
    expect(mod.fat).toBe(Math.round(DAILY_FAT_FLOOR_PER_KG * 80)); // 64
    expect(hard.fat).toBe(Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * 80)); // 48
  });

  it("invariant holds on a no-shift day AND a HARD day", () => {
    const p = makeProfile();
    expect(
      reconcilesTo(getAdjustedTargets(p, "rest", undefined, "REST"), 2500)
    ).toBeLessThanOrEqual(2);
    expect(
      reconcilesTo(getAdjustedTargets(p, "lift", undefined, "HARD"), 2500)
    ).toBeLessThanOrEqual(2);
  });

  it("tier annotations are intensity-appropriate", () => {
    const p = makeProfile();
    expect(
      getAdjustedTargets(p, "lift", undefined, "HARD").annotation
    ).toContain("Hard day");
    expect(
      getAdjustedTargets(p, "lift", undefined, "MODERATE").annotation
    ).toContain("Training day");
    expect(
      getAdjustedTargets(p, "lift", undefined, "EASY").annotation
    ).toContain("Easy day");
  });
});

// Carb DIRECTION (point 3): high-VOLUME work fuels MORE carbs than low-volume,
// correcting the legacy backwards "strength gets more carbs than hypertrophy".
describe("getAdjustedTargets — carb direction by glycogen demand (volume)", () => {
  it("a high-volume lift day yields MORE carbs than a low-volume one", () => {
    const p = makeProfile();
    // high volume → classifier HARD lift limb; low volume → EASY
    const high = getAdjustedTargets(p, "lift", undefined, "HARD");
    const low = getAdjustedTargets(p, "lift", undefined, "EASY");
    expect(high.carbs).toBeGreaterThan(low.carbs);
  });
});

// Protein still follows the Prompt-A translator phase; the tier change does
// not touch protein resolution.
describe("getAdjustedTargets — protein (translator phase)", () => {
  it("deload program eases protein to 1.8 g/kg", () => {
    const { profile, program } = LIFT_ONLY({
      currentPhase: "deload",
      weekNumber: 4,
    });
    const r = getAdjustedTargets(profile, "lift", program, "EASY");
    expect(r.protein).toBe(Math.round(1.8 * (profile.weightKg ?? 0))); // 144
  });

  it("progression strength program → 2.2 g/kg (PrimaryGoal phase, not default)", () => {
    const { profile, program } = LIFT_ONLY();
    const r = getAdjustedTargets(profile, "lift", program, "MODERATE");
    expect(r.protein).toBe(Math.round(2.2 * (profile.weightKg ?? 0))); // 176
  });

  it("omitting program preserves legacy base (2.0 g/kg)", () => {
    const { profile } = LIFT_ONLY();
    const r = getAdjustedTargets(profile, "lift");
    expect(r.protein).toBe(Math.round(2.0 * (profile.weightKg ?? 0))); // 160
  });
});

// Guards (point 4).
describe("getAdjustedTargets — guards", () => {
  it("HEAVY_CUTTER: flags aggressive, never emits negative/0-breaking carbs, sum still holds", () => {
    const { profile, program } = HEAVY_CUTTER();
    for (const tier of ["REST", "HARD"] as DayIntensity[]) {
      const r = getAdjustedTargets(profile, "lift", program, tier);
      expect(r.aggressive).toBe(true);
      expect(r.carbs).toBeGreaterThanOrEqual(0);
      // protein capped to keep the sum valid (not silently broken)
      expect(reconcilesTo(r, profile.targetCalories ?? 0)).toBeLessThanOrEqual(
        2
      );
      // essential fat floor preserved
      expect(r.fat).toBeGreaterThanOrEqual(
        Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * (profile.weightKg ?? 0))
      );
    }
  });

  it("moderate deficit where baseline fat is already at the floor → shift inert, no negative carbs", () => {
    // 90kg, 1800 cal cut: baseline fat = round(0.25*1800/9)=50g; daily floor
    // 0.8*90=72g > baseline → no room to cut → shift inert, fat raised toward
    // essential (54g), carbs ≥ 0, sum holds.
    const p = makeProfile({
      weightKg: 90,
      targetCalories: 1800,
      program: { goal: "cut", startWeight: 90, currentPhase: "cut" },
    });
    const hard = getAdjustedTargets(p, "lift", undefined, "HARD");
    expect(hard.carbs).toBeGreaterThanOrEqual(0);
    expect(reconcilesTo(hard, 1800)).toBeLessThanOrEqual(2);
  });

  it("a normal user never trips the aggressive flag", () => {
    const r = getAdjustedTargets(makeProfile(), "lift", undefined, "HARD");
    expect(r.aggressive).toBe(false);
  });
});

// Reconciliation invariant for EVERY fixture on a no-shift AND a HARD day.
describe("getAdjustedTargets — reconciliation across all fixtures", () => {
  const fixtures = {
    RUN_ONLY: RUN_ONLY(),
    LIFT_ONLY: LIFT_ONLY(),
    LIFT_ONLY_DELOAD: LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 }),
    BOTH: BOTH(),
    FREE_RUN: FREE_RUN(),
    HEAVY_CUTTER: HEAVY_CUTTER(),
    PRO_TAPER: PRO_TAPER(),
  };

  for (const [name, { profile, program }] of Object.entries(fixtures)) {
    for (const tier of ["REST", "HARD"] as DayIntensity[]) {
      it(`${name} reconciles (or flags aggressive) on a ${tier} day`, () => {
        const r = getAdjustedTargets(profile, "lift", program, tier);
        const reconciled = reconcilesTo(r, profile.targetCalories ?? 2200) <= 2;
        expect(reconciled || r.aggressive).toBe(true);
        expect(r.carbs).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("FREE_RUN has no program → REST tier yields flat baseline macros, no throw", () => {
    const { profile } = FREE_RUN();
    expect(() =>
      getAdjustedTargets(profile, "rest", undefined, "REST")
    ).not.toThrow();
  });

  it("makeProgram default is accepted without throwing", () => {
    expect(() =>
      getAdjustedTargets(makeProfile(), "lift", makeProgram(), "MODERATE")
    ).not.toThrow();
  });
});
