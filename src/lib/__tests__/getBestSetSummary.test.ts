/**
 * Tests for `getBestSetSummary` + `getExercisePrescription` — the
 * display-string helpers used by the workout history + program-card
 * surfaces to summarise an exercise in one line.
 *
 * The fork in getBestSetSummary is:
 *   - completed lastPerformance with weight > 0 → "Wkg × R"
 *   - completed lastPerformance with weight = 0 → "BW × R"
 *   - no completed lastPerformance → fall through to prescription
 *
 * getExercisePrescription further branches on the underlying
 * exercise's `equipment === "Bodyweight"` (looked up via
 * getExerciseById) — bodyweight exercises drop the `· Wkg` tail.
 *
 * Uses real exercise IDs ("push-ups", "bench-press") rather than
 * mocks so the lookup goes through the real database and we can't
 * silently break the dependency on getExerciseById's contract.
 */
import { describe, it, expect } from "vitest";
import { getBestSetSummary, getExercisePrescription } from "../getBestSetSummary";
import type { ProgramExercise } from "@/features/program/programTypes";

function makeExercise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  /* Defaults: a barbell bench press, 3×8 @ 60kg, no lastPerformance.
     Tests override only the fields they care about. */
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

describe("getBestSetSummary — completed lastPerformance branch", () => {
  it("returns 'Wkg × R' when lastPerformance is completed with weight > 0", () => {
    const ex = makeExercise({
      lastPerformance: { sets: 3, reps: 10, weight: 65, completed: true },
    });
    expect(getBestSetSummary(ex)).toBe("65kg × 10");
  });

  it("returns 'BW × R' when lastPerformance is completed with weight = 0", () => {
    const ex = makeExercise({
      exerciseId: "push-ups",
      name: "Push-Ups",
      lastPerformance: { sets: 3, reps: 15, weight: 0, completed: true },
    });
    expect(getBestSetSummary(ex)).toBe("BW × 15");
  });

  it("falls through to prescription when lastPerformance is null", () => {
    const ex = makeExercise({ lastPerformance: null });
    /* Default: bench-press, 3×8 @ 60kg → "3×8 · 60kg" */
    expect(getBestSetSummary(ex)).toBe("3×8 · 60kg");
  });

  it("falls through to prescription when lastPerformance.completed is false", () => {
    const ex = makeExercise({
      lastPerformance: { sets: 3, reps: 8, weight: 60, completed: false },
    });
    expect(getBestSetSummary(ex)).toBe("3×8 · 60kg");
  });
});

describe("getExercisePrescription — bodyweight branch", () => {
  it("drops the weight tail for a bodyweight exercise (looked up via DB)", () => {
    const ex = makeExercise({
      exerciseId: "push-ups",
      name: "Push-Ups",
      sets: 4,
      reps: 12,
      weight: 0,
    });
    expect(getExercisePrescription(ex)).toBe("4×12");
  });

  it("drops the weight tail when ex.weight is 0, even on non-BW exercises", () => {
    /* Defensive: a weighted exercise that hasn't had a weight set
       yet still displays without the "· 0kg" tail. */
    const ex = makeExercise({ weight: 0 });
    expect(getExercisePrescription(ex)).toBe("3×8");
  });
});

describe("getExercisePrescription — weighted branch", () => {
  it("includes the weight tail for a weighted exercise", () => {
    const ex = makeExercise({ sets: 5, reps: 5, weight: 100 });
    expect(getExercisePrescription(ex)).toBe("5×5 · 100kg");
  });

  it("uses whole-number formatting (no decimals shown for integer weights)", () => {
    expect(getExercisePrescription(makeExercise({ weight: 80 }))).toBe(
      "3×8 · 80kg",
    );
  });

  it("preserves fractional weights as-is", () => {
    /* Microloading: 62.5kg is a real plate-math value. The
       prescription string keeps it; History etc. would format
       differently if they needed to. */
    expect(getExercisePrescription(makeExercise({ weight: 62.5 }))).toBe(
      "3×8 · 62.5kg",
    );
  });
});

describe("getExercisePrescription — unknown exerciseId fallthrough", () => {
  it("treats an unknown exerciseId as not-bodyweight (shows the weight tail)", () => {
    /* getExerciseById returns undefined for unknown ids; the BW
       branch falls through and we hit the weighted format. */
    const ex = makeExercise({ exerciseId: "this-id-does-not-exist" });
    expect(getExercisePrescription(ex)).toBe("3×8 · 60kg");
  });
});
