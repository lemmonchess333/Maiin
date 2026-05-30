import { describe, it, expect } from "vitest";
import { getDayAdjustment, getAdjustedTargets } from "../phaseNutrition";
import type { UserProfile } from "../auth";

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

describe("getDayAdjustment", () => {
  // carbAdjustment is derived from calorieAdjustment / 4 so the
  // rendered macros reconcile with the displayed calorie total
  // (pre-fix carbAdjustment was hardcoded independently of
  // calorieAdjustment — the extra cal had no macro home).

  // ---- Lift day ----
  describe("lift day", () => {
    it("returns +200 cal / +50g carbs for non-strength, non-cut lift day", () => {
      const adj = getDayAdjustment("lift", "hypertrophy");
      expect(adj.calorieAdjustment).toBe(200);
      expect(adj.carbAdjustment).toBe(50); // 200 / 4
    });

    it("returns +400 cal / +100g carbs for strength phase lift day", () => {
      const adj = getDayAdjustment("lift", "strength");
      expect(adj.calorieAdjustment).toBe(400);
      expect(adj.carbAdjustment).toBe(100); // 400 / 4
    });

    it("returns +150 cal for cut goal lift day", () => {
      const adj = getDayAdjustment("lift", "hypertrophy", "cut");
      expect(adj.calorieAdjustment).toBe(150);
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

    it("includes a reason string", () => {
      const adj = getDayAdjustment("lift", "base");
      expect(adj.reason).toContain("Lift day");
      expect(adj.reason).toContain("200");
    });

    it("reason reflects cut calorie adjustment", () => {
      const adj = getDayAdjustment("lift", "base", "cut");
      expect(adj.reason).toContain("150");
    });
  });

  // ---- Run day ----
  describe("run day", () => {
    it("returns +200 cal / +50g carbs for non-cut run day", () => {
      const adj = getDayAdjustment("run", "base");
      expect(adj.calorieAdjustment).toBe(200);
      expect(adj.carbAdjustment).toBe(50); // 200 / 4
    });

    it("returns +100 cal for cut goal run day", () => {
      const adj = getDayAdjustment("run", "base", "cut");
      expect(adj.calorieAdjustment).toBe(100);
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
    it("returns +350 cal / +88g carbs for non-strength, non-cut both day", () => {
      const adj = getDayAdjustment("both", "hypertrophy");
      expect(adj.calorieAdjustment).toBe(350);
      expect(adj.carbAdjustment).toBe(88); // Math.round(350 / 4)
    });

    it("returns +500 cal for strength phase both day", () => {
      const adj = getDayAdjustment("both", "strength");
      expect(adj.calorieAdjustment).toBe(500);
    });

    it("returns +250 cal for cut goal both day", () => {
      const adj = getDayAdjustment("both", "base", "cut");
      expect(adj.calorieAdjustment).toBe(250);
    });

    it("includes reason string for both day", () => {
      const adj = getDayAdjustment("both", "base");
      expect(adj.reason).toContain("Lift + Run day");
    });
  });

  // ---- Rest day ----
  describe("rest day", () => {
    it("returns 0 cal and 0 carb adjustment", () => {
      const adj = getDayAdjustment("rest", "base");
      expect(adj.calorieAdjustment).toBe(0);
      expect(adj.carbAdjustment).toBe(0);
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

    it("ignores goal on rest day — always 0 cal adjustment", () => {
      const adj = getDayAdjustment("rest", "base", "cut");
      expect(adj.calorieAdjustment).toBe(0);
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
  it("returns correct values for a lift day with base phase", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "lift");
    // base calories 2500 + 200 (lift, non-strength, non-cut) = 2700
    expect(result.calories).toBe(2700);
    // protein = round(2.0 * 80) = 160
    expect(result.protein).toBe(160);
    // carbs are the balancing macro so protein*4 + carbs*4 + fat*9
    // reconciles to the calorie target. Here the 160g bodyweight-derived
    // protein differs from the 180g stored target, so carbs absorb both the
    // +200 surplus and that protein gap.
    expect(result.carbs).toBe(358);
    expect(result.protein * 4 + result.carbs * 4 + result.fat * 9).toBeCloseTo(
      result.calories,
      -1,
    );
    // fat unchanged
    expect(result.fat).toBe(70);
    expect(result.annotation).toContain("Lift day");
  });

  it("returns correct values for a run day", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "run");
    expect(result.calories).toBe(2700); // 2500 + 200
    expect(result.protein).toBe(160); // round(2.0 * 80)
    expect(result.carbs).toBe(358); // balancing macro (reconciles to calories)
    expect(result.fat).toBe(70);
  });

  it("returns correct values for a both day", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "both");
    expect(result.calories).toBe(2850); // 2500 + 350
    expect(result.carbs).toBe(395); // balancing macro
  });

  it("returns correct values for a rest day", () => {
    const profile = makeProfile();
    const result = getAdjustedTargets(profile, "rest");
    expect(result.calories).toBe(2500); // no adjustment
    expect(result.carbs).toBe(308); // balancing macro (160g protein vs 180g target)
    expect(result.fat).toBe(70);
    expect(result.annotation).toContain("Rest day");
  });

  it("uses strength phase adjustments", () => {
    const profile = makeProfile({
      program: { goal: "recomp", startWeight: 80, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.calories).toBe(2900); // 2500 + 400
    expect(result.protein).toBe(176); // round(2.2 * 80)
  });

  it("uses cut goal adjustments", () => {
    const profile = makeProfile({
      program: { goal: "cut", startWeight: 80, currentPhase: "base" },
    });
    const result = getAdjustedTargets(profile, "lift");
    expect(result.calories).toBe(2650); // 2500 + 150
  });

  it("uses cut goal for run day", () => {
    const profile = makeProfile({
      program: { goal: "cut", startWeight: 80, currentPhase: "base" },
    });
    const result = getAdjustedTargets(profile, "run");
    expect(result.calories).toBe(2600); // 2500 + 100
  });

  it("uses cut goal for both day", () => {
    const profile = makeProfile({
      program: { goal: "cut", startWeight: 80, currentPhase: "base" },
    });
    const result = getAdjustedTargets(profile, "both");
    expect(result.calories).toBe(2750); // 2500 + 250
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
    // defaults: cal=2200, carbs=250, fat=60
    expect(result.calories).toBe(2400); // 2200 + 200
    expect(result.carbs).toBe(325); // balancing macro (defaults: 2200 cal, p140, f60)
    expect(result.fat).toBe(60);
    // protein = round(2.0 * 70) = 140 (default weight 70)
    expect(result.protein).toBe(140);
  });

  it("uses default phase when program is undefined", () => {
    const profile = makeProfile({ program: undefined });
    const result = getAdjustedTargets(profile, "lift");
    // phase defaults to "base", goal defaults to undefined (non-cut)
    expect(result.calories).toBe(2700); // 2500 + 200
    expect(result.protein).toBe(160); // round(2.0 * 80)
  });

  it("calculates protein based on body weight and phase multiplier", () => {
    const profile = makeProfile({
      weightKg: 100,
      program: { goal: "recomp", startWeight: 100, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "lift");
    // 2.2 * 100 = 220
    expect(result.protein).toBe(220);
  });

  it("uses deload phase protein multiplier", () => {
    const profile = makeProfile({
      weightKg: 90,
      program: { goal: "recomp", startWeight: 90, currentPhase: "deload" },
    });
    const result = getAdjustedTargets(profile, "rest");
    // 1.8 * 90 = 162
    expect(result.protein).toBe(162);
  });

  it("strength phase both day with cut goal", () => {
    const profile = makeProfile({
      weightKg: 85,
      program: { goal: "cut", startWeight: 85, currentPhase: "strength" },
    });
    const result = getAdjustedTargets(profile, "both");
    // cut overrides: +250 cal (cut takes precedence over strength for both)
    expect(result.calories).toBe(2750); // 2500 + 250
    expect(result.protein).toBe(Math.round(2.2 * 85)); // 187 — cut goal uses cut protein multiplier
    expect(result.carbs).toBe(343); // balancing macro
  });

  // Streak-of-bugs guard: the documented contract is that the rendered macros
  // always reconcile to the rendered calorie target. Pre-fix, protein was
  // recomputed from bodyweight while carbs only tracked the calorie surplus,
  // so any mismatch between the stored protein target and bodyweight*multiplier
  // silently broke the total. Assert the invariant across day types and a
  // deliberately INCONSISTENT base profile (stored protein far from bodyweight).
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
