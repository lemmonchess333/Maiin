import { describe, it, expect } from "vitest";
import {
  computeEffectiveBonus,
  deriveEffectiveDayType,
} from "../effectiveTargets";

const BASE_TARGET = 2000;

// Helper that returns the full picture a consumer would see: effective day
// type, strategic bonus, effective bonus, and the resulting finalTarget
// (baseTarget + effectiveBonus). Mirrors what useEffectiveTargets computes.
function compute(opts: {
  liftBurn: number;
  runBurn: number;
  plannedDayType: "lift" | "run" | "both" | "rest";
  phase: string;
  goal?: string;
}) {
  const result = computeEffectiveBonus({
    actualLiftBurn: opts.liftBurn,
    actualRunBurn: opts.runBurn,
    plannedDayType: opts.plannedDayType,
    phase: opts.phase,
    goal: opts.goal,
  });
  return {
    ...result,
    finalTarget: BASE_TARGET + result.effectiveBonus,
  };
}

describe("deriveEffectiveDayType", () => {
  it("both lifts and runs → both", () => {
    expect(deriveEffectiveDayType(280, 420, "lift")).toBe("both");
    expect(deriveEffectiveDayType(280, 420, "rest")).toBe("both");
  });

  it("only lifts → lift", () => {
    expect(deriveEffectiveDayType(280, 0, "run")).toBe("lift");
    expect(deriveEffectiveDayType(280, 0, "rest")).toBe("lift");
  });

  it("only runs → run", () => {
    expect(deriveEffectiveDayType(0, 420, "lift")).toBe("run");
    expect(deriveEffectiveDayType(0, 420, "rest")).toBe("run");
  });

  it("nothing completed → falls back to planned", () => {
    expect(deriveEffectiveDayType(0, 0, "lift")).toBe("lift");
    expect(deriveEffectiveDayType(0, 0, "run")).toBe("run");
    expect(deriveEffectiveDayType(0, 0, "both")).toBe("both");
    expect(deriveEffectiveDayType(0, 0, "rest")).toBe("rest");
  });

  it("treats negative and zero burns the same way", () => {
    // Defensive — shouldn't happen in production but the function guards via > 0
    expect(deriveEffectiveDayType(0, 0, "lift")).toBe("lift");
    expect(deriveEffectiveDayType(-10, 0, "lift")).toBe("lift");
  });
});

describe("computeEffectiveBonus — the 9 worked examples", () => {
  // These mirror the 9 scenarios from the training-aware targets spec.
  // Each asserts the full chain: effectiveDayType, strategicBonus,
  // effectiveBonus, and finalTarget (baseTarget + effectiveBonus).

  it("1. Strength phase, lift day, light lift (280) — strategic covers actual", () => {
    const r = compute({
      liftBurn: 280,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "strength",
    });
    expect(r.effectiveDayType).toBe("lift");
    expect(r.strategicBonus).toBe(400);
    expect(r.actualBurn).toBe(280);
    expect(r.effectiveBonus).toBe(400);
    expect(r.finalTarget).toBe(2400);
  });

  it("2. Cut, lift day, hard lift (280) — actual exceeds strategic", () => {
    const r = compute({
      liftBurn: 280,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
      goal: "cut",
    });
    expect(r.effectiveDayType).toBe("lift");
    expect(r.strategicBonus).toBe(150);
    expect(r.effectiveBonus).toBe(280);
    expect(r.finalTarget).toBe(2280);
  });

  it("3. Normal, lift day scheduled, ran instead (420) — unscheduled activity surfaces", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 420,
      plannedDayType: "lift",
      phase: "base",
    });
    expect(r.effectiveDayType).toBe("run");
    expect(r.strategicBonus).toBe(200);
    expect(r.effectiveBonus).toBe(420);
    expect(r.finalTarget).toBe(2420);
  });

  it("4. Normal, lift day, lift + run completed (280 + 420 = 700) — both rewarded", () => {
    const r = compute({
      liftBurn: 280,
      runBurn: 420,
      plannedDayType: "lift",
      phase: "base",
    });
    expect(r.effectiveDayType).toBe("both");
    expect(r.strategicBonus).toBe(350);
    expect(r.actualBurn).toBe(700);
    expect(r.effectiveBonus).toBe(700);
    expect(r.finalTarget).toBe(2700);
  });

  it("5. Strength phase, lift day, lift + run completed (700) — both mode, actual dominates", () => {
    const r = compute({
      liftBurn: 280,
      runBurn: 420,
      plannedDayType: "lift",
      phase: "strength",
    });
    expect(r.effectiveDayType).toBe("both");
    expect(r.strategicBonus).toBe(500);
    expect(r.actualBurn).toBe(700);
    expect(r.effectiveBonus).toBe(700);
    expect(r.finalTarget).toBe(2700);
  });

  it("6. Rest day, unscheduled run (420)", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 420,
      plannedDayType: "rest",
      phase: "base",
    });
    expect(r.effectiveDayType).toBe("run");
    expect(r.strategicBonus).toBe(200);
    expect(r.effectiveBonus).toBe(420);
    expect(r.finalTarget).toBe(2420);
  });

  it("7. Lift day scheduled, nothing completed yet — scheduled fallback applies", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    expect(r.effectiveDayType).toBe("lift");
    expect(r.strategicBonus).toBe(200);
    expect(r.actualBurn).toBe(0);
    expect(r.effectiveBonus).toBe(200);
    expect(r.finalTarget).toBe(2200);
    expect(r.hasCompletedActivity).toBe(false);
  });

  it("8. Strength phase lift day, very light lift (180) — strategic surplus protected", () => {
    const r = compute({
      liftBurn: 180,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "strength",
    });
    expect(r.effectiveDayType).toBe("lift");
    expect(r.strategicBonus).toBe(400);
    expect(r.effectiveBonus).toBe(400);
    expect(r.finalTarget).toBe(2400);
  });

  it("9. Rest day, nothing completed — zero bonus, baseTarget passthrough", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 0,
      plannedDayType: "rest",
      phase: "base",
    });
    expect(r.effectiveDayType).toBe("rest");
    expect(r.strategicBonus).toBe(0);
    expect(r.effectiveBonus).toBe(0);
    expect(r.finalTarget).toBe(2000);
    expect(r.hasCompletedActivity).toBe(false);
  });
});

describe("computeEffectiveBonus — hasCompletedActivity flag", () => {
  it("true when lifts only", () => {
    const r = compute({
      liftBurn: 100,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    expect(r.hasCompletedActivity).toBe(true);
  });

  it("true when runs only", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 100,
      plannedDayType: "run",
      phase: "base",
    });
    expect(r.hasCompletedActivity).toBe(true);
  });

  it("false when nothing", () => {
    const r = compute({
      liftBurn: 0,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    expect(r.hasCompletedActivity).toBe(false);
  });
});

describe("computeEffectiveBonus — fractional burns round correctly", () => {
  it("rounds actual burn before comparing with strategic", () => {
    const r = compute({
      liftBurn: 199.6,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    // Math.round(199.6) = 200, strategic = 200, max(200, 200) = 200
    expect(r.effectiveBonus).toBe(200);
  });

  it("keeps the larger of strategic and rounded actual", () => {
    const r = compute({
      liftBurn: 200.4,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    // Math.round(200.4) = 200, strategic = 200, max = 200
    expect(r.effectiveBonus).toBe(200);
  });

  it("uses rounded actual when it exceeds strategic", () => {
    const r = compute({
      liftBurn: 210.7,
      runBurn: 0,
      plannedDayType: "lift",
      phase: "base",
    });
    // Math.round(210.7) = 211, strategic = 200, max = 211
    expect(r.effectiveBonus).toBe(211);
  });
});

describe("computeEffectiveBonus — cut goal + both day type", () => {
  it("cut + both: strategic is 250, actual burn 700 dominates", () => {
    const r = compute({
      liftBurn: 280,
      runBurn: 420,
      plannedDayType: "lift",
      phase: "base",
      goal: "cut",
    });
    expect(r.effectiveDayType).toBe("both");
    expect(r.strategicBonus).toBe(250);
    expect(r.effectiveBonus).toBe(700);
  });

  it("cut + both: strategic is 250, light activity (100 + 50 = 150) is covered by strategy", () => {
    const r = compute({
      liftBurn: 100,
      runBurn: 50,
      plannedDayType: "lift",
      phase: "base",
      goal: "cut",
    });
    expect(r.effectiveDayType).toBe("both");
    expect(r.strategicBonus).toBe(250);
    expect(r.actualBurn).toBe(150);
    expect(r.effectiveBonus).toBe(250);
  });
});
