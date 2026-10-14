import { describe, it, expect } from "vitest";
import { formatExerciseSummary } from "../exerciseSummary";

describe("formatExerciseSummary", function () {
  it("labels holds and loaded carries in seconds", () => {
    expect(
      formatExerciseSummary({
        setCount: 3,
        targetReps: 60,
        targetWeightKg: 0,
        exerciseId: "plank",
      })
    ).toBe("3×60 s");
    expect(
      formatExerciseSummary({
        setCount: 3,
        targetReps: 45,
        targetWeightKg: 20,
        exerciseId: "weighted-plank",
      })
    ).toBe("3×45 s × 20 kg");
    expect(
      formatExerciseSummary({
        setCount: 2,
        targetReps: 30,
        targetWeightKg: 24,
        exerciseId: "farmers-carry",
      })
    ).toBe("2×30 s × 24 kg");
  });

  it("renders standard sets×reps×weight format with kg suffix", function () {
    expect(
      formatExerciseSummary({ setCount: 4, targetReps: 6, targetWeightKg: 100 })
    ).toBe("4×6×100 kg");
    expect(
      formatExerciseSummary({ setCount: 3, targetReps: 8, targetWeightKg: 7.5 })
    ).toBe("3×8×7.5 kg");
  });

  it("uses BW suffix only when the exerciseId resolves to a true bodyweight movement", function () {
    // The visible bug this exists to fix: pre-formatter renders
    // produced strings like "1×8×0kg" for pull-ups / dips / unlogged
    // weights, leaking implementation defaults into the feed.
    //
    // Updated behaviour: weight === 0 alone is not enough to claim
    // "BW" — a Leg Press at 0kg is uncalibrated, not bodyweight, and
    // tagging it BW polluted history charts. Now we require an
    // exerciseId that resolves to `equipment === "Bodyweight"`.
    // Without an exerciseId (or with one for a weighted exercise),
    // weight === 0 falls back to "{sets}×{reps}" without BW.
    expect(
      formatExerciseSummary({
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 0,
        exerciseId: "pull-ups",
      })
    ).toBe("3×8 BW");
    expect(
      formatExerciseSummary({
        setCount: 1,
        targetReps: 8,
        targetWeightKg: 0,
        exerciseId: "dips",
      })
    ).toBe("1×8 BW");
    // Weighted exercise with no calibrated weight — no BW label.
    expect(
      formatExerciseSummary({
        setCount: 4,
        targetReps: 10,
        targetWeightKg: 0,
        exerciseId: "leg-press",
      })
    ).toBe("4×10");
    // Unknown / missing exerciseId — default to no BW (safer guess).
    expect(
      formatExerciseSummary({ setCount: 3, targetReps: 8, targetWeightKg: 0 })
    ).toBe("3×8");
  });

  it("strips trailing .0 on round weights", function () {
    expect(
      formatExerciseSummary({
        setCount: 4,
        targetReps: 6,
        targetWeightKg: 100.0,
      })
    ).toBe("4×6×100 kg");
    expect(
      formatExerciseSummary({
        setCount: 4,
        targetReps: 6,
        targetWeightKg: 100.5,
      })
    ).toBe("4×6×100.5 kg");
  });

  it("falls back to a sets-only label when reps are zero", function () {
    expect(
      formatExerciseSummary({ setCount: 3, targetReps: 0, targetWeightKg: 0 })
    ).toBe("3 sets");
    expect(
      formatExerciseSummary({ setCount: 1, targetReps: 0, targetWeightKg: 0 })
    ).toBe("1 set");
  });

  it("returns an em-dash placeholder when nothing is logged", function () {
    expect(
      formatExerciseSummary({ setCount: 0, targetReps: 0, targetWeightKg: 0 })
    ).toBe("—");
  });

  it("rounds non-integer set/rep counts and clamps negatives", function () {
    expect(
      formatExerciseSummary({
        setCount: 4.6,
        targetReps: 6.3,
        targetWeightKg: 50,
      })
    ).toBe("5×6×50 kg");
    expect(
      formatExerciseSummary({
        setCount: -1,
        targetReps: -2,
        targetWeightKg: -5,
      })
    ).toBe("—");
  });
});

/* Lift18: the reader's unit. The kg summary a post stores is the fallback
   for a post with no figures; rows with figures are written again for
   whoever reads them. */
describe("formatExerciseSummary in the reader's unit", () => {
  const set = { setCount: 3, targetReps: 8, exerciseId: "bench-press" };
  it("is kg unless asked otherwise", () => {
    expect(formatExerciseSummary({ ...set, targetWeightKg: 60 })).toBe(
      "3×8×60 kg"
    );
    expect(formatExerciseSummary({ ...set, targetWeightKg: 62.5 }, "kg")).toBe(
      "3×8×62.5 kg"
    );
  });

  it("reads lb, whole on the lb kit and to a tenth off it", () => {
    expect(
      formatExerciseSummary({ ...set, targetWeightKg: 135 / 2.20462 }, "lbs")
    ).toBe("3×8×135 lb");
    expect(formatExerciseSummary({ ...set, targetWeightKg: 60 }, "lbs")).toBe(
      "3×8×132.3 lb"
    );
  });

  it("leaves BW and holds alone", () => {
    expect(
      formatExerciseSummary(
        {
          setCount: 3,
          targetReps: 10,
          targetWeightKg: 0,
          exerciseId: "pull-ups",
        },
        "lbs"
      )
    ).toBe("3×10 BW");
  });
});
