import { describe, it, expect } from "vitest";
import {
  detectPlateau,
  calculateAdaptiveMacros,
  type PhaseMode,
} from "../plateauDetection";

// ── detectPlateau ────────────────────────────

describe("detectPlateau", () => {
  describe("regressing", () => {
    it("detects regression when avgLiftChange is below negative threshold", () => {
      // threshold = 0.1 * 1.0 = 0.1; avgLiftChange = -0.2 < -0.1
      const result = detectPlateau(-0.2, 0, 1.0);
      expect(result.status).toBe("regressing");
      expect(result.calorieAdjust).toBe(0);
      expect(result.volumeAdjust).toBe(-0.1);
    });

    it("uses sensitivity to scale threshold", () => {
      // sensitivity=0.5 → threshold=0.05; -0.06 < -0.05 → regressing
      const result = detectPlateau(-0.06, 0, 0.5);
      expect(result.status).toBe("regressing");
    });

    it("does not regress when lift change is above negative threshold", () => {
      // threshold=0.1; -0.05 > -0.1 → not regressing
      const result = detectPlateau(-0.05, 0, 1.0);
      expect(result.status).not.toBe("regressing");
    });
  });

  describe("stalling", () => {
    it("detects stalling when both lift and weight change are small", () => {
      // |0.05| < 0.1 && |0.1| < 0.2
      const result = detectPlateau(0.05, 0.1, 1.0);
      expect(result.status).toBe("stalling");
      expect(result.calorieAdjust).toBe(150);
      expect(result.volumeAdjust).toBe(0);
    });

    it("detects stalling at zero changes", () => {
      const result = detectPlateau(0, 0, 1.0);
      expect(result.status).toBe("stalling");
    });

    it("does not stall when weight change is >= 0.2", () => {
      const result = detectPlateau(0.05, 0.3, 1.0);
      expect(result.status).not.toBe("stalling");
    });
  });

  describe("weight_only", () => {
    it("detects weight-only gain when weight rises without strength", () => {
      // avgWeightChange > 0.4 && avgLiftChange < threshold(0.1)
      const result = detectPlateau(0.05, 0.5, 1.0);
      expect(result.status).toBe("weight_only");
      expect(result.calorieAdjust).toBe(-100);
    });

    it("requires weight change > 0.4", () => {
      const result = detectPlateau(0.05, 0.4, 1.0);
      // 0.4 is not > 0.4, so not weight_only — falls through to progressing
      expect(result.status).not.toBe("weight_only");
    });
  });

  describe("progressing", () => {
    it("returns progressing when lift gains are good", () => {
      // avgLiftChange=0.5 > threshold(0.1), doesn't match any negative condition
      const result = detectPlateau(0.5, 0.2, 1.0);
      expect(result.status).toBe("progressing");
      expect(result.calorieAdjust).toBe(0);
      expect(result.volumeAdjust).toBe(0);
      expect(result.macroNote).toBe("No changes needed.");
    });

    it("returns progressing with high sensitivity that still qualifies", () => {
      // sensitivity=2 → threshold=0.2; avgLiftChange=0.5 > 0.2
      const result = detectPlateau(0.5, 0.1, 2.0);
      expect(result.status).toBe("progressing");
    });
  });

  describe("sensitivity scaling", () => {
    it("high sensitivity makes regression easier to trigger", () => {
      // sensitivity=2 → threshold=0.2; -0.25 < -0.2 → regressing
      const result = detectPlateau(-0.25, 0, 2.0);
      expect(result.status).toBe("regressing");
    });

    it("low sensitivity requires larger drops to regress", () => {
      // sensitivity=0.5 → threshold=0.05; -0.04 > -0.05 → not regressing
      const result = detectPlateau(-0.04, 0, 0.5);
      expect(result.status).not.toBe("regressing");
    });
  });
});

// ── calculateAdaptiveMacros ──────────────────

describe("calculateAdaptiveMacros", () => {
  const phases: PhaseMode[] = ["lean bulk", "cut", "recomp", "strength peak"];

  it("returns correct structure for all phases", () => {
    for (const phase of phases) {
      const result = calculateAdaptiveMacros(80, 0.1, 0.1, phase);
      expect(result).toHaveProperty("calories");
      expect(result).toHaveProperty("protein");
      expect(result).toHaveProperty("carbs");
      expect(result).toHaveProperty("fat");
      expect(result.calories).toBeGreaterThan(0);
      expect(result.protein).toBeGreaterThan(0);
      expect(result.carbs).toBeGreaterThanOrEqual(50);
      expect(result.fat).toBeGreaterThan(0);
    }
  });

  it("calculates correct macros for lean bulk with no adjustment", () => {
    // bw=80, baseTDEE=80*33=2640, adjustment=0 (lift>0, weight>0)
    // calories = round((2640+0)*1.1) = round(2904) = 2904
    // protein = round(80*2.2) = 176
    // fat = round(2904*0.25/9) = round(80.67) = 81
    // carbs = round((2904 - 176*4 - 81*9)/4) = round((2904-704-729)/4) = round(1471/4) = round(367.75) = 368
    const result = calculateAdaptiveMacros(80, 0.5, 0.5, "lean bulk");
    expect(result.calories).toBe(2904);
    expect(result.protein).toBe(176);
    expect(result.fat).toBe(81);
    expect(result.carbs).toBe(368);
  });

  it("adds 150 calorie adjustment when both lift and weight are stalling", () => {
    // avgLiftChange=0, avgWeightChange=0 → adjustment=+150
    // baseTDEE=80*33=2640 → (2640+150)*1.1 = 2790*1.1 = 3069
    const result = calculateAdaptiveMacros(80, 0, 0, "lean bulk");
    expect(result.calories).toBe(3069);
  });

  it("subtracts 100 when weight rising without strength (and adds 150 since lift<=0)", () => {
    // avgLiftChange=-0.1 (<=0) + avgWeightChange=-0.1 (<=0) → +150
    // avgWeightChange=0.6 (>0.5) + avgLiftChange=-0.1 (<=0) → -100
    // Net adjustment: +150 -100 = +50
    // Actually: avgLiftChange=-0.1 and avgWeightChange=0.6
    // condition1: -0.1<=0 && 0.6<=0 → false (0.6>0)
    // condition2: 0.6>0.5 && -0.1<=0 → true → -100
    // adjustment = 0 + (-100) = -100
    const result = calculateAdaptiveMacros(80, -0.1, 0.6, "lean bulk");
    // (2640 + (-100)) * 1.1 = 2540 * 1.1 = 2794
    expect(result.calories).toBe(2794);
  });

  it("uses baseTDEE when provided instead of bw*33", () => {
    const result = calculateAdaptiveMacros(80, 0.5, 0.5, "lean bulk", 3000);
    // (3000+0)*1.1 = 3300
    expect(result.calories).toBe(3300);
  });

  it("applies cut multiplier correctly", () => {
    // bw=80, baseTDEE=2640, adjustment=0, calories = round(2640*0.85) = round(2244) = 2244
    const result = calculateAdaptiveMacros(80, 0.5, 0.5, "cut");
    expect(result.calories).toBe(2244);
    // protein for cut = round(80 * 2.2) = 176
    expect(result.protein).toBe(176);
  });

  it("enforces minimum 50 carbs", () => {
    // Use a very low bodyweight with cut to push carbs low
    // Actually, carbs min is 50 via Math.max
    const result = calculateAdaptiveMacros(40, 0.5, 0.5, "cut");
    expect(result.carbs).toBeGreaterThanOrEqual(50);
  });

  it("uses fallback bodyweight of 70 for invalid input", () => {
    const result = calculateAdaptiveMacros(NaN, 0.5, 0.5, "recomp");
    // bw=70, baseTDEE=70*33=2310, calories=round(2310*1.0)=2310
    expect(result.calories).toBe(2310);
    expect(result.protein).toBe(Math.round(70 * 2.3));
  });

  it("strength peak has highest calorie multiplier", () => {
    const bulk = calculateAdaptiveMacros(80, 0.5, 0.5, "lean bulk");
    const peak = calculateAdaptiveMacros(80, 0.5, 0.5, "strength peak");
    expect(peak.calories).toBeGreaterThan(bulk.calories);
  });
});
