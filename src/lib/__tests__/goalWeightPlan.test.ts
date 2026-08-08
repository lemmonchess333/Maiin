import { describe, it, expect } from "vitest";
import { offsetFromWeeklyRate, KCAL_PER_KG } from "@/lib/macroConstants";
import {
  directionForTarget,
  fitnessGoalForDirection,
  resolveGoalWeightPlan,
  buildGoalWeightPersistPayload,
  buildMaintenancePayload,
  goalReachedOffer,
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

describe("buildGoalWeightPersistPayload — the ONE persist recipe", () => {
  // Extracted from SettingsNutrition's reactive-save effect so the Home
  // goal-reached prompt cannot drift from what Settings writes.
  const profile = {
    weightKg: 90,
    heightCm: 180,
    age: 30,
    activityLevel: "moderate" as const,
    sex: "male" as const,
    customCalorieTarget: null,
    program: { goal: "cut", startWeight: 92, currentPhase: "build" },
  };

  it("persists the SIGNED rate and the derived phase", () => {
    const { payload, plan } = buildGoalWeightPersistPayload({
      profile,
      currentKg: 90,
      targetKg: 80,
      rateKgPerWeek: 0.5,
    });
    expect(plan.direction).toBe("lose");
    expect(payload.weeklyRateKg).toBe(-0.5);
    expect(payload.program.goal).toBe("cut");
    // Carried, not re-seeded — the block position survives a goal tweak.
    expect(payload.program.startWeight).toBe(92);
    expect(payload.program.currentPhase).toBe("build");
    expect(payload.goalWeightKg).toBe(80);
    expect(payload.targetCalories).toBe(payload.tdeeBase);
  });

  it("a manual calorie override survives as targetCalories", () => {
    const { payload } = buildGoalWeightPersistPayload({
      profile: { ...profile, customCalorieTarget: 2000 },
      currentKg: 90,
      targetKg: 80,
      rateKgPerWeek: 0.5,
    });
    expect(payload.targetCalories).toBe(2000);
    expect(payload.tdeeBase).not.toBe(2000);
  });

  it("maintain forces rate 0 and recomp", () => {
    const { payload, plan } = buildGoalWeightPersistPayload({
      profile,
      currentKg: 80,
      targetKg: 80,
      rateKgPerWeek: 0.5,
    });
    expect(plan.direction).toBe("maintain");
    expect(payload.weeklyRateKg).toBe(0);
    expect(payload.program.goal).toBe("recomp");
  });

  it("seeds program fields only when absent", () => {
    const { payload } = buildGoalWeightPersistPayload({
      profile: { ...profile, program: undefined },
      currentKg: 90,
      targetKg: 80,
      rateKgPerWeek: 0.5,
    });
    expect(payload.program.startWeight).toBe(90);
    expect(payload.program.currentPhase).toBe("base");
  });
});

describe("goalReachedOffer — when Tropos asks about maintenance", () => {
  // Probe sweep 2026-08-05, verifier-confirmed: direction was re-resolved
  // only inside a Settings edit session, so a cutter who arrived kept the
  // full deficit indefinitely. The offer asks; it never silently flips.
  const cutter = {
    weightKg: 78,
    goalWeightKg: 78,
    weeklyRateKg: -0.5,
    program: { goal: "cut" },
  };

  it("fires when a cutter arrives (deadband) or overshoots", () => {
    expect(goalReachedOffer(cutter)).toEqual({
      storedDirection: "lose",
      goalWeightKg: 78,
      currentKg: 78,
    });
    // 1.5kg past goal — resolver reads "gain"; still an arrival.
    expect(goalReachedOffer({ ...cutter, weightKg: 76.5 })).not.toBeNull();
  });

  it("fires for a bulker who arrives, with the gain direction", () => {
    const offer = goalReachedOffer({
      weightKg: 85,
      goalWeightKg: 85,
      weeklyRateKg: 0.25,
      program: { goal: "lean bulk" },
    });
    expect(offer?.storedDirection).toBe("gain");
  });

  it("stays silent mid-journey", () => {
    expect(goalReachedOffer({ ...cutter, weightKg: 84 })).toBeNull();
  });

  it("stays silent with no goal, no weight, or a zero rate", () => {
    expect(goalReachedOffer({ ...cutter, goalWeightKg: 0 })).toBeNull();
    expect(goalReachedOffer({ ...cutter, weightKg: 0 })).toBeNull();
    expect(goalReachedOffer({ ...cutter, weeklyRateKg: 0 })).toBeNull();
  });

  it("stays silent on ambiguous legacy data — unsigned rate vs phase", () => {
    // Pre-NUTR-M2 profiles stored the rate UNSIGNED: a legacy cutter reads
    // rate=+0.5. Sign alone would call them a bulker and fire the prompt
    // MID-CUT (their goal is below current, so "direction changed"). The
    // two signals must agree; disagreement is silence, not a guess.
    expect(
      goalReachedOffer({
        weightKg: 84,
        goalWeightKg: 78,
        weeklyRateKg: 0.5, // legacy unsigned
        program: { goal: "cut" },
      })
    ).toBeNull();
  });

  it("stays silent when the phase already says recomp", () => {
    expect(
      goalReachedOffer({
        weightKg: 78,
        goalWeightKg: 78,
        weeklyRateKg: -0.5,
        program: { goal: "recomp" },
      })
    ).toBeNull();
  });
});

describe("buildMaintenancePayload — maintain AT today's weight", () => {
  it("re-anchors the goal to current weight so Settings cannot re-flip it", () => {
    // Leaving the goal 1.5kg away would make the reactive Settings surface
    // resolve "gain" on its next visit — silently undoing the choice the
    // user just made in the prompt.
    const payload = buildMaintenancePayload({
      weightKg: 76.5,
      heightCm: 180,
      age: 30,
      activityLevel: "moderate",
      sex: "male",
      goalWeightKg: 78,
      weeklyRateKg: -0.5,
      program: { goal: "cut", startWeight: 92, currentPhase: "build" },
    });
    expect(payload).not.toBeNull();
    expect(payload!.goalWeightKg).toBe(76.5);
    expect(payload!.weeklyRateKg).toBe(0);
    expect(payload!.program.goal).toBe("recomp");
    expect(payload!.program.startWeight).toBe(92);
  });

  it("returns null with no usable current weight", () => {
    expect(buildMaintenancePayload({ weightKg: 0 })).toBeNull();
  });
});
