import { describe, it, expect } from "vitest";
import { offsetFromWeeklyRate, KCAL_PER_KG } from "@/lib/macroConstants";
import {
  directionForTarget,
  fitnessGoalForDirection,
  resolveGoalWeightPlan,
  MAINTAIN_DEADBAND_KG,
} from "@/lib/goalWeightPlan";

describe("offsetFromWeeklyRate", () => {
  it("converts kg/week → daily kcal offset via 7700/kg, rounded to 10", () => {
    // -0.5 kg/wk × 7700 / 7 = -550
    expect(offsetFromWeeklyRate(-0.5)).toBe(-550);
    // +0.3 kg/wk × 7700 / 7 ≈ 330
    expect(offsetFromWeeklyRate(0.3)).toBe(330);
    expect(offsetFromWeeklyRate(0)).toBe(0);
  });

  it("reproduces the legacy cut/lean-bulk bands within rounding", () => {
    // Legacy cut was -500; the rate that produces it:
    expect(offsetFromWeeklyRate(-500 / (KCAL_PER_KG / 7))).toBeCloseTo(
      -500,
      -1
    );
  });

  it("is sign-symmetric", () => {
    expect(offsetFromWeeklyRate(0.5)).toBe(-offsetFromWeeklyRate(-0.5));
  });
});

describe("directionForTarget — deadband", () => {
  it("below current by > deadband → lose", () => {
    expect(directionForTarget(80, 75)).toBe("lose");
  });
  it("above current by > deadband → gain", () => {
    expect(directionForTarget(70, 76)).toBe("gain");
  });
  it("within deadband → maintain (no flip on a tiny nudge)", () => {
    expect(directionForTarget(80, 80)).toBe("maintain");
    expect(directionForTarget(80, 80 - MAINTAIN_DEADBAND_KG)).toBe("maintain");
    expect(directionForTarget(80, 80 + MAINTAIN_DEADBAND_KG)).toBe("maintain");
  });
});

describe("fitnessGoalForDirection", () => {
  it("maps direction → engine FitnessGoal", () => {
    expect(fitnessGoalForDirection("lose")).toBe("cut");
    expect(fitnessGoalForDirection("gain")).toBe("lean bulk");
    expect(fitnessGoalForDirection("maintain")).toBe("recomp");
  });
});

describe("resolveGoalWeightPlan — target weight owns nutrition", () => {
  it("lose: caller passes positive magnitude, plan applies the deficit", () => {
    const p = resolveGoalWeightPlan({
      currentKg: 85,
      targetKg: 78,
      rateKgPerWeek: 0.5,
    });
    expect(p).toEqual({
      direction: "lose",
      fitnessGoal: "cut",
      dailyOffset: -550,
      effectiveRateKgPerWeek: -0.5,
    });
  });

  it("gain → lean bulk surplus", () => {
    const p = resolveGoalWeightPlan({
      currentKg: 70,
      targetKg: 75,
      rateKgPerWeek: 0.3,
    });
    expect(p.fitnessGoal).toBe("lean bulk");
    expect(p.dailyOffset).toBe(330);
    expect(p.effectiveRateKgPerWeek).toBe(0.3);
  });

  it("maintain forces rate + offset to zero regardless of input rate", () => {
    const p = resolveGoalWeightPlan({
      currentKg: 80,
      targetKg: 80,
      rateKgPerWeek: 0.5,
    });
    expect(p).toEqual({
      direction: "maintain",
      fitnessGoal: "recomp",
      dailyOffset: 0,
      effectiveRateKgPerWeek: 0,
    });
  });

  it("the locked contradiction case: 'build muscle' but target below current → deficit, NOT surplus", () => {
    // primaryGoal would have mapped hypertrophy → lean bulk → +surplus.
    // Target-weight ownership makes it an honest slight deficit instead.
    const p = resolveGoalWeightPlan({
      currentKg: 82,
      targetKg: 77,
      rateKgPerWeek: 0.25,
    });
    expect(p.direction).toBe("lose");
    expect(p.fitnessGoal).toBe("cut");
    expect(p.dailyOffset).toBeLessThan(0);
  });
});
