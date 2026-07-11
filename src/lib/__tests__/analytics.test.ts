import { describe, it, expect } from "vitest";
import {
  exerciseToMuscleGroup,
  epley1RM,
  epley1RMExact,
  strengthSlope,
  momentumDirection,
  fourWeekChange,
  emptyVolume,
  computeVolume,
  volumeWoWChange,
  dailyAdherence,
  weeklyAdherenceScore,
  detectFatigue,
  generateInsight,
  MUSCLE_GROUPS,
  type StrengthPoint,
  type InsightData,
} from "../analytics";

function makePoints(e1rms: number[]): StrengthPoint[] {
  return e1rms.map((e1rm, i) => ({ date: `2025-01-${i + 1}`, e1rm }));
}

function makeInsightData(overrides: Partial<InsightData> = {}): InsightData {
  return {
    phase: "lean bulk",
    momentumDir: "up",
    fourWeekPct: 5,
    weeklyAdherence: 85,
    avgCalorieDiff: 250,
    bodyweightTrend: 0.2,
    volumeWoW: 10,
    ...overrides,
  };
}

describe("exerciseToMuscleGroup", () => {
  it("maps known categories", () => {
    expect(exerciseToMuscleGroup("Chest")).toBe("chest");
    expect(exerciseToMuscleGroup("Back")).toBe("back");
    expect(exerciseToMuscleGroup("Biceps")).toBe("arms");
    expect(exerciseToMuscleGroup("Triceps")).toBe("arms");
    expect(exerciseToMuscleGroup("Legs")).toBe("legs");
    expect(exerciseToMuscleGroup("Core")).toBe("core");
    expect(exerciseToMuscleGroup("Cardio")).toBe("cardio");
  });

  it('returns "other" for unknown category', () => {
    expect(exerciseToMuscleGroup("Unknown")).toBe("other");
  });
});

describe("epley1RM", () => {
  it("returns 0 for zero or negative weight/reps", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });

  it("returns weight for 1 rep", () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it("calculates correctly for multiple reps", () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 ≈ 117
    expect(epley1RM(100, 5)).toBe(117);
  });

  it("calculates correctly for 10 reps", () => {
    // 100 * (1 + 10/30) = 100 * 1.333 ≈ 133
    expect(epley1RM(100, 10)).toBe(133);
  });
});

describe("strengthSlope", () => {
  it("returns 0 for fewer than 2 points", () => {
    expect(strengthSlope([])).toBe(0);
    expect(strengthSlope(makePoints([100]))).toBe(0);
  });

  it("returns positive slope for increasing values", () => {
    expect(strengthSlope(makePoints([100, 110, 120]))).toBeGreaterThan(0);
  });

  it("returns negative slope for decreasing values", () => {
    expect(strengthSlope(makePoints([120, 110, 100]))).toBeLessThan(0);
  });

  it("returns 0 for flat values", () => {
    expect(strengthSlope(makePoints([100, 100, 100]))).toBe(0);
  });
});

describe("momentumDirection", () => {
  it('returns "up" for slope > 0.3', () => {
    expect(momentumDirection(0.5)).toBe("up");
  });

  it('returns "down" for slope < -0.3', () => {
    expect(momentumDirection(-0.5)).toBe("down");
  });

  it('returns "flat" for slope near zero', () => {
    expect(momentumDirection(0)).toBe("flat");
    expect(momentumDirection(0.2)).toBe("flat");
    expect(momentumDirection(-0.2)).toBe("flat");
  });
});

describe("fourWeekChange", () => {
  it("returns null for fewer than 2 points", () => {
    expect(fourWeekChange([])).toBeNull();
    expect(fourWeekChange(makePoints([100]))).toBeNull();
  });

  it("returns null when first value is 0", () => {
    expect(fourWeekChange(makePoints([0, 100]))).toBeNull();
  });

  it("calculates percent change correctly", () => {
    // (110 - 100) / 100 = 10%
    expect(fourWeekChange(makePoints([100, 110]))).toBe(10);
  });

  it("handles negative change", () => {
    // (90 - 100) / 100 = -10%
    expect(fourWeekChange(makePoints([100, 90]))).toBe(-10);
  });
});

describe("emptyVolume", () => {
  it("returns all zeros", () => {
    const vol = emptyVolume();
    for (const g of MUSCLE_GROUPS) {
      expect(vol[g]).toBe(0);
    }
  });
});

describe("computeVolume", () => {
  it("counts sets per muscle group", () => {
    const exercises = [
      { category: "Chest", sets: [{}, {}, {}] },
      { category: "Back", sets: [{}, {}] },
      { category: "Biceps", sets: [{}, {}, {}, {}] },
    ];
    const vol = computeVolume(exercises);
    expect(vol.chest).toBe(3);
    expect(vol.back).toBe(2);
    expect(vol.arms).toBe(4);
    expect(vol.legs).toBe(0);
  });

  it("ignores unknown categories", () => {
    const exercises = [{ category: "Unknown", sets: [{}, {}] }];
    const vol = computeVolume(exercises);
    for (const g of MUSCLE_GROUPS) {
      expect(vol[g]).toBe(0);
    }
  });
});

describe("volumeWoWChange", () => {
  it("calculates percent change per muscle", () => {
    const current = { chest: 12, back: 10, legs: 8, shoulders: 6, arms: 4 };
    const previous = { chest: 10, back: 10, legs: 10, shoulders: 6, arms: 2 };
    const result = volumeWoWChange(current, previous);
    expect(result.chest).toBe(20);
    expect(result.back).toBe(0);
    expect(result.legs).toBe(-20);
    expect(result.shoulders).toBe(0);
    expect(result.arms).toBe(100);
  });

  it("returns 100 when previous is 0 and current > 0", () => {
    const current = { chest: 5, back: 0, legs: 0, shoulders: 0, arms: 0 };
    const previous = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0 };
    const result = volumeWoWChange(current, previous);
    expect(result.chest).toBe(100);
  });

  it("returns null when both are 0", () => {
    const current = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0 };
    const previous = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0 };
    const result = volumeWoWChange(current, previous);
    expect(result.chest).toBeNull();
  });
});

describe("dailyAdherence", () => {
  it("scores 100 when targets hit exactly", () => {
    const result = dailyAdherence(
      { calories: 2000, protein: 150 },
      { calories: 2000, protein: 150 }
    );
    expect(result.score).toBe(100);
    expect(result.caloriesHit).toBe(true);
    expect(result.proteinHit).toBe(true);
    expect(result.band).toBe("green");
  });

  it("marks calories missed when > 5% off", () => {
    const result = dailyAdherence(
      { calories: 2200, protein: 150 },
      { calories: 2000, protein: 150 }
    );
    expect(result.caloriesHit).toBe(false);
  });

  it("marks protein missed when > 10g off", () => {
    const result = dailyAdherence(
      { calories: 2000, protein: 120 },
      { calories: 2000, protein: 150 }
    );
    expect(result.proteinHit).toBe(false);
  });

  it("assigns yellow band for moderate scores", () => {
    const result = dailyAdherence(
      { calories: 2400, protein: 130 },
      { calories: 2000, protein: 150 }
    );
    expect(result.band).toBe("yellow");
  });

  it("assigns red band for poor scores", () => {
    const result = dailyAdherence(
      { calories: 3000, protein: 80 },
      { calories: 2000, protein: 150 }
    );
    expect(result.band).toBe("red");
  });

  it("handles zero target calories", () => {
    const result = dailyAdherence(
      { calories: 100, protein: 50 },
      { calories: 0, protein: 50 }
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("weeklyAdherenceScore", () => {
  it("returns 0 for empty array", () => {
    expect(weeklyAdherenceScore([])).toBe(0);
  });

  it("averages daily scores", () => {
    expect(weeklyAdherenceScore([80, 90, 100])).toBe(90);
  });

  it("rounds the result", () => {
    expect(weeklyAdherenceScore([80, 85])).toBe(83);
  });
});

describe("detectFatigue", () => {
  it("triggers when volume up and momentum down", () => {
    const result = detectFatigue(20, "down");
    expect(result.triggered).toBe(true);
    expect(result.message).toMatch(/fatigue/i);
  });

  it("does not trigger when momentum is up", () => {
    expect(detectFatigue(20, "up").triggered).toBe(false);
  });

  it("does not trigger when volume change is low", () => {
    expect(detectFatigue(10, "down").triggered).toBe(false);
  });

  it("does not trigger for null volume change", () => {
    expect(detectFatigue(null, "down").triggered).toBe(false);
  });
});

describe("generateInsight", () => {
  it("includes strength trending up for up momentum", () => {
    const insight = generateInsight(
      makeInsightData({ momentumDir: "up", fourWeekPct: 5 })
    );
    expect(insight).toMatch(/trending up/i);
  });

  it("includes strength declining for down momentum", () => {
    const insight = generateInsight(
      makeInsightData({ momentumDir: "down", fourWeekPct: -5 })
    );
    expect(insight).toMatch(/declining/i);
  });

  it("includes stable message for flat momentum", () => {
    const insight = generateInsight(
      makeInsightData({ momentumDir: "flat", fourWeekPct: 0 })
    );
    expect(insight).toMatch(/stable/i);
  });

  it("advises increasing intake for low surplus in lean bulk", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "lean bulk", avgCalorieDiff: 50 })
    );
    expect(insight).toMatch(/surplus is low/i);
  });

  it("advises about weight drop during bulk", () => {
    const insight = generateInsight(
      makeInsightData({
        phase: "lean bulk",
        avgCalorieDiff: 250,
        bodyweightTrend: -0.5,
        momentumDir: "flat",
      })
    );
    expect(insight).toMatch(/dropping/i);
  });

  it("warns about strength loss during cut", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "cut", momentumDir: "down", fourWeekPct: -3 })
    );
    expect(insight).toMatch(/strength loss/i);
  });

  it("praises solid execution during cut with maintained strength", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "cut", momentumDir: "up", fourWeekPct: 2 })
    );
    expect(insight).toMatch(/solid/i);
  });

  it("warns about weight trending up during cut", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "cut", momentumDir: "up", bodyweightTrend: 0.5 })
    );
    expect(insight).toMatch(/weight trending up/i);
  });

  it("notes strong adherence for recomp", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "recomp", weeklyAdherence: 90 })
    );
    expect(insight).toMatch(/favorable/i);
  });

  it("notes consistency needed for recomp with low adherence", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "recomp", weeklyAdherence: 60 })
    );
    expect(insight).toMatch(/consistency/i);
  });

  it("notes peak phase progress", () => {
    const insight = generateInsight(
      makeInsightData({ phase: "strength peak", momentumDir: "up" })
    );
    expect(insight).toMatch(/peak phase/i);
  });

  it("suggests deload for stalling peak", () => {
    const insight = generateInsight(
      makeInsightData({
        phase: "strength peak",
        momentumDir: "flat",
        fourWeekPct: 0,
      })
    );
    expect(insight).toMatch(/deload/i);
  });

  it("warns about low adherence", () => {
    const insight = generateInsight(makeInsightData({ weeklyAdherence: 40 }));
    expect(insight).toMatch(/adherence at 40%/i);
  });
});

describe("epley1RMExact", () => {
  it("matches epley1RM unrounded for multi-rep sets", () => {
    expect(epley1RMExact(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    expect(epley1RM(100, 5)).toBe(Math.round(epley1RMExact(100, 5)));
  });

  it("a true single IS its 1RM — no 3.3% inflation, no rounding of plate weights", () => {
    // The inline copies this replaces scored 100kg x 1 as 103.3.
    expect(epley1RMExact(100, 1)).toBe(100);
    expect(epley1RMExact(102.5, 1)).toBe(102.5);
  });

  it("guards failed/empty sets — reps<=0 or weight<=0 never score", () => {
    expect(epley1RMExact(100, 0)).toBe(0);
    expect(epley1RMExact(100, -1)).toBe(0);
    expect(epley1RMExact(0, 8)).toBe(0);
  });
});
