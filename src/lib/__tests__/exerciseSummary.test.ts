import { describe, it, expect } from "vitest";
import { formatExerciseSummary } from "../exerciseSummary";

describe("formatExerciseSummary", function () {
  it("renders standard sets×reps×weight format with kg suffix", function () {
    expect(formatExerciseSummary({ setCount: 4, targetReps: 6, targetWeightKg: 100 })).toBe("4×6×100kg");
    expect(formatExerciseSummary({ setCount: 3, targetReps: 8, targetWeightKg: 7.5 })).toBe("3×8×7.5kg");
  });

  it("uses BW suffix instead of '0kg' for bodyweight or unlogged-weight lifts", function () {
    // The visible bug this exists to fix: pre-formatter renders
    // produced strings like "1×8×0kg" for pull-ups / dips / unlogged
    // weights, leaking implementation defaults into the feed.
    expect(formatExerciseSummary({ setCount: 3, targetReps: 8, targetWeightKg: 0 })).toBe("3×8 BW");
    expect(formatExerciseSummary({ setCount: 1, targetReps: 8, targetWeightKg: 0 })).toBe("1×8 BW");
  });

  it("strips trailing .0 on round weights", function () {
    expect(formatExerciseSummary({ setCount: 4, targetReps: 6, targetWeightKg: 100.0 })).toBe("4×6×100kg");
    expect(formatExerciseSummary({ setCount: 4, targetReps: 6, targetWeightKg: 100.5 })).toBe("4×6×100.5kg");
  });

  it("falls back to a sets-only label when reps are zero", function () {
    expect(formatExerciseSummary({ setCount: 3, targetReps: 0, targetWeightKg: 0 })).toBe("3 sets");
    expect(formatExerciseSummary({ setCount: 1, targetReps: 0, targetWeightKg: 0 })).toBe("1 set");
  });

  it("returns an em-dash placeholder when nothing is logged", function () {
    expect(formatExerciseSummary({ setCount: 0, targetReps: 0, targetWeightKg: 0 })).toBe("—");
  });

  it("rounds non-integer set/rep counts and clamps negatives", function () {
    expect(formatExerciseSummary({ setCount: 4.6, targetReps: 6.3, targetWeightKg: 50 })).toBe("5×6×50kg");
    expect(formatExerciseSummary({ setCount: -1, targetReps: -2, targetWeightKg: -5 })).toBe("—");
  });
});
