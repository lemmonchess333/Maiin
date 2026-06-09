import { describe, it, expect } from "vitest";
import {
  getDayAdjustment,
  getAdjustedTargets,
  ESSENTIAL_FAT_FLOOR_PER_KG,
} from "../phaseNutrition";
import type { UserProfile } from "../auth";
import {
  RUN_ONLY,
  LIFT_ONLY,
  BOTH,
  FREE_RUN,
  HEAVY_CUTTER,
  PRO_TAPER,
  makeProgram,
  liftDay,
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
    program: {
      goal: "recomp",
      startWeight: 80,
      currentPhase: "base",
    },
    ...overrides,
  };
}

// Nutr1 (expenditure-inclusive): day-type fuelling is a NET-NEUTRAL fat→carb
// shift, NOT a calorie surplus. getDayAdjustment exposes the shift magnitude
// (fuelShiftCalories); getAdjustedTargets applies it at constant calories,
// clamped at the essential-fat floor.
describe("getDayAdjustment", () => {
  // ---- Lift day ----
  describe("lift day", () => {
    it("returns a 200-cal fat→carb shift for non-strength, non-cut lift day", () => {
      const adj = getDayAdjustment("lift", "hypertrophy");
      expect(adj.fuelShiftCalories).toBe(200);
    });

    it("returns a 400-cal shift for strength phase lift day", () => {
      const adj = getDayAdjustment("lift", "strength");
      expect(adj.fuelShiftCalories).toBe(400);
    });

    it("returns a 150-cal shift for cut goal lift day", () => {
      const adj = getDayAdjustment("lift", "hypertrophy", "cut");
      expect(adj.fuelShiftCalories).toBe(150);
    });

    it("returns strength protein multiplier of 2.2", () => {
      const adj = getDayAdjustment("lift", "strength");
      expect(adj.proteinMultiplier).toBe(2.2);
    });

    it("returns hypertrophy protein multiplier of 2.0", () => {
      const adj = getDayAdjustment("lift", "hypertrophy");
      expect(adj.proteinMultiplier).toBe(2.0);
    });

    it("returns cut protein multiplier of 2.2", () => {
      const adj = getDayAdjustment("lift", "cut");
      expect(adj.proteinMultiplier).toBe(2.2);
    });

    it("returns default 2.0 multiplier for unknown phase", () => {
      const adj = getDayAdjustment("lift", "unknown_phase");
      expect(adj.proteinMultiplier).toBe(2.0);
    });

    it("reason names the day type and the carb-fuelling intent (no +cal claim)", () => {
      const adj = getDayAdjustment("lift", "base");
      expect(adj.reason).toContain("Lift day");
      expect(adj.reason).toContain("carbs");
      // Expenditure-inclusive: the reason must NOT advertise a calorie bump.
      expect(adj.reason).not.toMatch(/\+\s*\d/);
    });
  });

  // ---- Run day ----
  describe("run day", () => {
    it("returns a 200-cal shift for non-cut run day", () => {
      const adj = getDayAdjustment("run", "base");
      expect(adj.fuelShiftCalories).toBe(200);
    });

    it("returns a 100-cal shift for cut goal run day", () => {
      const adj = getDayAdjustment("run", "base", "cut");
      expect(adj.fuelShiftCalories).toBe(100);
    });

    it("returns race_prep protein multiplier of 1.6", () => {
      const adj = getDayAdjustment("run", "race_prep");
      expect(adj.proteinMultiplier).toBe(1.6);
    });

    it("includes reason string", () => {
      const adj = getDayAdjustment("run", "base");
      expect(adj.reason).toContain("Run day");
    });
  });

  // ---- Both day ----
  describe("both day", () => {
    it("returns a 350-cal shift for non-strength, non-cut both day", () => {
      const adj = getDayAdjustment("both", "hypertrophy");
      expect(adj.fuelShiftCalories).toBe(350);
    });

    it("returns a 500-cal shift for strength phase both day", () => {
      const adj = getDayAdjustment("both", "strength");
      expect(adj.fuelShiftCalories).toBe(500);
    });

    it("returns a 250-cal shift for cut goal both day", () => {
      const adj = getDayAdjustment("both", "base", "cut");
      expect(adj.fuelShiftCalories).toBe(250);
    });

    it("includes reason string for both day", () => {
      const adj = getDayAdjustment("both", "base");
      expect(adj.reason).toContain("Lift + Run day");
    });
  });

  // ---- Rest day ----
  describe("rest day", () => {
    it("returns a 0-cal shift (no fuelling on rest days)", () => {
      const adj = getDayAdjustment("rest", "base");
      expect(adj.fuelShiftCalories).toBe(0);
    });

    it("returns base protein multiplier of 2.0", () => {
      const adj = getDayAdjustment("rest", "base");
      expect(adj.proteinMultiplier).toBe(2.0);
    });

    it("returns deload protein multiplier of 1.8", () => {
      const adj = getDayAdjustment("rest", "deload");
      expect(adj.proteinMultiplier).toBe(1.8);
    });

    it("includes rest day reason", () => {
      const adj = getDayAdjustment("rest", "base");
      expect(adj.reason).toContain("Rest day");
    });

    it("ignores goal on rest day — always 0 shift", () => {
      const adj = getDayAdjustment("rest", "base", "cut");
      expect(adj.fuelShiftCalories).toBe(0);
    });
  });

  // ---- All phases protein multipliers ----
  describe("protein multipliers for all phases", () => {
    const expected: Record<string, number> = {
      strength: 2.2,
      hypertrophy: 2.0,
      deload: 1.8,
      race_prep: 1.6,
      cut: 2.2,
      base: 2.0,
    };

    Object.entries(expected).forEach(([phase, multiplier]) => {
      it(`returns ${multiplier} for phase "${phase}"`, () => {
        const adj = getDayAdjustment("lift", phase);
        expect(adj.proteinMultiplier).toBe(multiplier);
      });
    });
  });
});

describe("getAdjustedTargets", () => {
  it("holds calories flat and shifts fat→carbs on a lift day (base phase)", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "lift");
    // Calories are FLAT — no training-day surplus (was 2700 pre-Nutr1).
    expect(result.calories).toBe(2500);
    // protein = round(2.0 * 80) = 160
    expect(result.protein).toBe(160);
    // 200-cal shift = round(200/9)=22g fat moved into carbs; floor = round(0.6*80)=48,
    // available 70-48=22 ≥ 22, so the full shift lands. fat 70-22=48.
    expect(result.fat).toBe(48);
    // carbs are the balancing macro at flat calories — round((2500-640-432)/4)
    expect(result.carbs).toBe(357);
    expect(result.protein * 4 + result.carbs * 4 + result.fat * 9).toBeCloseTo(
      result.calories,
      -1
    );
    expect(result.annotation).toContain("Lift day");
  });

  it("matches lift on a run day (same 200-cal shift)", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "run");
    expect(result.calories).toBe(2500);
    expect(result.protein).toBe(160);
    expect(result.fat).toBe(48);
    expect(result.carbs).toBe(357);
  });

  it("clamps the fat cut at the essential floor on a big (both) day", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "both");
    // 350-cal shift wants round(350/9)=39g fat, but only 70-48=22g is above
    // the floor — so the cut clamps at 22g. Calories still flat.
    expect(result.calories).toBe(2500);
    expect(result.fat).toBe(48);
    expect(result.carbs).toBe(357);
  });

  it("leaves rest days at the baseline split", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "rest");
    expect(result.calories).toBe(2500); // no shift
    expect(result.fat).toBe(70);
    expect(result.carbs).toBe(308);
    expect(result.annotation).toContain("Rest day");
  });

  it("uses strength phase protein + shift", () => {
    const profile = makeProfile({
      program: { goal: "recomp", startWeight: 80, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.calories).toBe(2500); // flat
    expect(result.protein).toBe(176); // round(2.2 * 80)
    expect(result.fat).toBe(48); // 400-cal shift clamps to floor
  });

  it("uses cut goal protein + shift on a lift day", () => {
    const profile = makeProfile({
      program: { goal: "cut", startWeight: 80, currentPhase: "base" },
    });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.calories).toBe(2500); // flat
    expect(result.protein).toBe(176); // cut → 2.2 * 80
    // 150-cal shift = round(150/9)=17g, below the 22g headroom → lands fully.
    expect(result.fat).toBe(53);
  });

  it("uses default values when profile targets are undefined", () => {
    const profile = makeProfile({
      targetCalories: undefined,
      targetProtein: undefined,
      targetCarbs: undefined,
      targetFat: undefined,
      weightKg: undefined as unknown as number,
    });
    const result = getAdjustedTargets(profile, "lift");
    // defaults: cal=2200, fat=60, weight=70 → floor=round(0.6*70)=42
    expect(result.calories).toBe(2200); // flat
    // protein = round(2.0 * 70) = 140
    expect(result.protein).toBe(140);
    // 200-cal shift = 22g, but headroom 60-42=18g → clamps at 18. fat=42.
    expect(result.fat).toBe(42);
    expect(result.carbs).toBe(316);
  });

  it("uses default phase when program is undefined", () => {
    const profile = makeProfile({ program: undefined });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.calories).toBe(2500); // flat
    expect(result.protein).toBe(160); // round(2.0 * 80)
  });

  it("calculates protein based on body weight and phase multiplier", () => {
    const profile = makeProfile({
      weightKg: 100,
      program: { goal: "recomp", startWeight: 100, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.protein).toBe(220); // 2.2 * 100
  });

  it("uses deload phase protein multiplier", () => {
    const profile = makeProfile({
      weightKg: 90,
      program: { goal: "recomp", startWeight: 90, currentPhase: "deload" },
    });
    const result = getAdjustedTargets(profile, "rest");
    expect(result.protein).toBe(162); // 1.8 * 90
  });

  it("strength phase both day with cut goal", () => {
    const profile = makeProfile({
      weightKg: 85,
      program: { goal: "cut", startWeight: 85, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "both");
    expect(result.calories).toBe(2500); // flat
    expect(result.protein).toBe(Math.round(2.2 * 85)); // 187 — cut multiplier
  });

  // ── Nutr1 invariants ────────────────────────────────────────────────────
  describe("Nutr1 expenditure-inclusive invariants", () => {
    const dayTypes = ["lift", "run", "both", "rest"] as const;

    it("calories are FLAT (=== base.targetCalories) on every day type", () => {
      const profile = makeProfile();
      for (const dt of dayTypes) {
        expect(getAdjustedTargets(profile, dt).calories).toBe(2500);
      }
    });

    it("training-day carbs ≥ rest-day carbs (fuelling preserved)", () => {
      const profile = makeProfile();
      const rest = getAdjustedTargets(profile, "rest").carbs;
      for (const dt of ["lift", "run", "both"] as const) {
        expect(getAdjustedTargets(profile, dt).carbs).toBeGreaterThanOrEqual(
          rest
        );
      }
    });

    it("fat never drops below the essential floor on any day type", () => {
      const profile = makeProfile();
      const floor = Math.round(
        ESSENTIAL_FAT_FLOOR_PER_KG * (profile.weightKg as number)
      );
      for (const dt of dayTypes) {
        expect(getAdjustedTargets(profile, dt).fat).toBeGreaterThanOrEqual(
          floor
        );
      }
    });

    it("does NOT cut fat below an already-low stored fat (no negative shift)", () => {
      // base.fat 30 is already below the 48g floor → fat must stay 30, no shift.
      const profile = makeProfile({ targetFat: 30 });
      for (const dt of dayTypes) {
        expect(getAdjustedTargets(profile, dt).fat).toBe(30);
      }
    });
  });

  // Streak-of-bugs guard: rendered macros always reconcile to the (flat)
  // calorie target across day types and a deliberately INCONSISTENT base
  // profile (stored protein far from bodyweight).
  describe("macro/calorie reconciliation invariant", () => {
    const reconciles = (t: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.calories) <= 2;

    for (const dayType of ["lift", "run", "both", "rest"] as const) {
      it(`reconciles on a ${dayType} day even with a mismatched base protein target`, () => {
        const profile = makeProfile({
          weightKg: 80,
          targetCalories: 2500,
          targetProtein: 999, // absurd stored value — bodyweight protein wins
          targetCarbs: 50,
          targetFat: 70,
        });
        expect(reconciles(getAdjustedTargets(profile, dayType))).toBe(true);
      });
    }

    it("clamps carbs at 0 (never negative) when protein+fat already exceed the budget", () => {
      const profile = makeProfile({
        weightKg: 130,
        targetCalories: 1200,
        targetFat: 60,
        program: { goal: "cut", startWeight: 130, currentPhase: "cut" },
      });
      const result = getAdjustedTargets(profile, "lift");
      expect(result.carbs).toBe(0);
      expect(result.carbs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Program-driven phase via the translator (vocabulary-drift fix) ────────
// Passing the full ProgramState revives the dead branches: protein now
// follows the user's PrimaryGoal (strength/hypertrophy) on progression weeks
// and eases on deload weeks, instead of the engine's base/progression/deload
// `currentPhase` vocabulary matching nothing in PHASE_PROTEIN.
describe("getAdjustedTargets — program-driven phase (translator)", () => {
  it("LIFT_ONLY deload week: protein eases to the deload multiplier (1.8)", () => {
    const { profile, program } = LIFT_ONLY({
      currentPhase: "deload",
      weekNumber: 4,
    });
    const r = getAdjustedTargets(profile, "lift", program);
    expect(r.protein).toBe(Math.round(1.8 * (profile.weightKg ?? 0))); // 144
  });

  it("LIFT_ONLY progression week: protein = the PrimaryGoal phase value (strength 2.2), not the goal default", () => {
    const { profile, program } = LIFT_ONLY(); // strength, progression, wk2
    const r = getAdjustedTargets(profile, "lift", program);
    expect(r.protein).toBe(Math.round(2.2 * (profile.weightKg ?? 0))); // 176

    // The dead-branch bug being fixed: feeding the engine's raw "progression"
    // string falls back to the goal/default multiplier (2.0), NOT the phase.
    expect(
      getDayAdjustment("lift", "progression", "recomp").proteinMultiplier
    ).toBe(2.0);
  });

  it("revives the strength carb-shift branch end-to-end (richer carbs than a base lifter, fat headroom allowing)", () => {
    // targetFat well above the essential floor so the 400-vs-200 fuel shift is
    // visible rather than clamped.
    const strength = getAdjustedTargets(
      makeProfile({ weightKg: 80, targetFat: 100 }),
      "lift",
      makeProgram({
        primaryGoal: "strength",
        currentPhase: "progression",
        weekNumber: 2,
        workouts: [liftDay("A", 5)],
      })
    );
    const general = getAdjustedTargets(
      makeProfile({ weightKg: 80, targetFat: 100 }),
      "lift",
      makeProgram({
        primaryGoal: "general",
        currentPhase: "progression",
        weekNumber: 2,
        workouts: [liftDay("A", 5)],
      })
    );
    expect(strength.carbs).toBeGreaterThan(general.carbs);
  });

  it("RUN_ONLY / no-lift program → safe legacy fallback (base 2.0), no throw", () => {
    const { profile, program } = RUN_ONLY();
    expect(() => getAdjustedTargets(profile, "run", program)).not.toThrow();
    const r = getAdjustedTargets(profile, "run", program);
    // translator 'none' → falls back to profile.program.currentPhase ("base")
    expect(r.protein).toBe(Math.round(2.0 * (profile.weightKg ?? 0)));
  });

  it("omitting the program argument preserves exact legacy behaviour", () => {
    const { profile } = LIFT_ONLY();
    // No program passed → legacy currentPhase mirror ("base") → 2.0
    const legacy = getAdjustedTargets(profile, "lift");
    expect(legacy.protein).toBe(Math.round(2.0 * (profile.weightKg ?? 0)));
  });

  it("reconciliation invariant holds for every fixture (or carbs clamp at 0)", () => {
    const fixtures = [
      RUN_ONLY(),
      LIFT_ONLY(),
      LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 }),
      BOTH(),
      FREE_RUN(),
      HEAVY_CUTTER(),
      PRO_TAPER(),
    ];
    const dayTypes = ["lift", "run", "both", "rest"] as const;
    for (const { profile, program } of fixtures) {
      for (const dt of dayTypes) {
        const r = getAdjustedTargets(profile, dt, program);
        const sum = r.protein * 4 + r.carbs * 4 + r.fat * 9;
        const reconciled = Math.abs(sum - r.calories) <= 2;
        // HEAVY_CUTTER is over-budget by design: protein + floored fat already
        // exceed calories, so carbs clamp at 0 and the sum can't equal
        // calories. That clamp is the correct, intended state.
        const clampedOverBudget = r.carbs === 0 && sum >= r.calories;
        expect(reconciled || clampedOverBudget).toBe(true);
      }
    }
  });
});
