/**
 * trainingSignals — the program↔nutrition phase translator.
 *
 * Pins the mapping that fixes the vocabulary drift: liftPhase from PrimaryGoal
 * (NOT currentPhase), isDeload reconciled from currentPhase ∪ the week%4
 * prescription, volume tier from Σ sets×reps, and a never-throw zero state for
 * run-only / free / pre-onboarding inputs.
 */
import { describe, it, expect } from "vitest";
import {
  trainingSignalsForNutrition,
  LIFT_VOLUME_LOW_MAX,
  LIFT_VOLUME_MODERATE_MAX,
} from "../trainingSignals";
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

describe("trainingSignalsForNutrition — zero state (never throw)", () => {
  it("FREE_RUN (no program) → all-zero", () => {
    expect(trainingSignalsForNutrition(FREE_RUN().program)).toEqual({
      liftPhase: "none",
      isDeload: false,
      liftVolumeTier: "none",
    });
  });

  it("RUN_ONLY (program but no lift workouts) → all-zero", () => {
    expect(trainingSignalsForNutrition(RUN_ONLY().program)).toEqual({
      liftPhase: "none",
      isDeload: false,
      liftVolumeTier: "none",
    });
  });

  it("a run-only program on a deload week is STILL zero (isDeload false)", () => {
    // No lift volume ⟹ not a lifter ⟹ run-only 'deload' is not a thing.
    const sig = trainingSignalsForNutrition(
      RUN_ONLY({ currentPhase: "deload", weekNumber: 4 }).program
    );
    expect(sig.isDeload).toBe(false);
    expect(sig.liftPhase).toBe("none");
  });

  it("does not throw on undefined / empty-workout programs", () => {
    expect(() => trainingSignalsForNutrition(undefined)).not.toThrow();
    expect(() =>
      trainingSignalsForNutrition(makeProgram({ workouts: [] }))
    ).not.toThrow();
  });
});

describe("trainingSignalsForNutrition — liftPhase from PrimaryGoal", () => {
  it("LIFT_ONLY progression week → liftPhase reflects PrimaryGoal (strength)", () => {
    const sig = trainingSignalsForNutrition(LIFT_ONLY().program); // strength, wk2
    expect(sig).toMatchObject({
      liftPhase: "strength",
      isDeload: false,
      liftVolumeTier: "moderate",
    });
  });

  it("BOTH → liftPhase hypertrophy (PrimaryGoal), not derived from currentPhase", () => {
    const sig = trainingSignalsForNutrition(BOTH().program); // hypertrophy
    expect(sig.liftPhase).toBe("hypertrophy");
    expect(sig.isDeload).toBe(false);
  });

  it("fat_loss / general / running PrimaryGoals → baseline 'base' phase", () => {
    for (const primaryGoal of ["fat_loss", "general", "running"] as const) {
      const sig = trainingSignalsForNutrition(
        makeProgram({
          primaryGoal,
          currentPhase: "progression",
          weekNumber: 2,
          workouts: [liftDay("A", 5)],
        })
      );
      expect(sig.liftPhase).toBe("base");
    }
  });
});

describe("trainingSignalsForNutrition — isDeload reconciliation", () => {
  it("LIFT_ONLY deload week (currentPhase + prescription agree) → deload", () => {
    const sig = trainingSignalsForNutrition(
      LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 }).program
    );
    expect(sig.isDeload).toBe(true);
    expect(sig.liftPhase).toBe("deload"); // deload overrides the goal phase
  });

  it("currentPhase 'deload' but week not %4 → still deload (union)", () => {
    const sig = trainingSignalsForNutrition(
      LIFT_ONLY({ currentPhase: "deload", weekNumber: 2 }).program
    );
    expect(sig.isDeload).toBe(true);
  });

  it("prescription deload (week %4) but currentPhase stale 'progression' → still deload", () => {
    const sig = trainingSignalsForNutrition(
      LIFT_ONLY({ currentPhase: "progression", weekNumber: 8 }).program
    );
    expect(sig.isDeload).toBe(true);
  });

  it("neither signals deload → not deload", () => {
    const sig = trainingSignalsForNutrition(
      LIFT_ONLY({ currentPhase: "progression", weekNumber: 3 }).program
    );
    expect(sig.isDeload).toBe(false);
  });
});

describe("trainingSignalsForNutrition — volume tier", () => {
  const tierOf = (count: number, sets: number, reps: number) =>
    trainingSignalsForNutrition(
      makeProgram({
        primaryGoal: "hypertrophy",
        workouts: [liftDay("A", count, sets, reps)],
      })
    ).liftVolumeTier;

  it("low at/below the low threshold", () => {
    // 2 lifts × 3×6 = 36 reps
    expect(tierOf(2, 3, 6)).toBe("low");
    // exactly LIFT_VOLUME_LOW_MAX
    expect(
      trainingSignalsForNutrition(
        makeProgram({
          primaryGoal: "hypertrophy",
          workouts: [liftDay("A", 1, 1, LIFT_VOLUME_LOW_MAX)],
        })
      ).liftVolumeTier
    ).toBe("low");
  });

  it("moderate between the thresholds", () => {
    // 5 lifts × 3×8 = 120 reps
    expect(tierOf(5, 3, 8)).toBe("moderate");
  });

  it("high above the moderate threshold", () => {
    // 8 lifts × 4×6 = 192 reps > 160
    expect(tierOf(8, 4, 6)).toBe("high");
    expect(192).toBeGreaterThan(LIFT_VOLUME_MODERATE_MAX);
  });

  it("uses the heaviest day, ignoring skipped days", () => {
    const sig = trainingSignalsForNutrition(
      makeProgram({
        primaryGoal: "hypertrophy",
        workouts: [
          liftDay("Light", 2, 2, 6), // 24
          { ...liftDay("Skipped-heavy", 10, 5, 8), skipped: true }, // ignored
          liftDay("Heavy", 6, 3, 8), // 144
        ],
      })
    );
    expect(sig.liftVolumeTier).toBe("moderate"); // from the 144 day
  });

  it("PRO_TAPER → low tier (reduced taper volume), base phase", () => {
    const sig = trainingSignalsForNutrition(PRO_TAPER().program);
    expect(sig.liftVolumeTier).toBe("low");
    expect(sig.liftPhase).toBe("base"); // running primaryGoal
    expect(sig.isDeload).toBe(false);
  });

  it("HEAVY_CUTTER → has lift volume (moderate), base phase (fat_loss)", () => {
    const sig = trainingSignalsForNutrition(HEAVY_CUTTER().program);
    expect(sig.liftVolumeTier).toBe("moderate");
    expect(sig.liftPhase).toBe("base");
  });
});
