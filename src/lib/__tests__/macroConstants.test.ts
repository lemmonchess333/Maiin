/**
 * Tests for `macroConstants.ts` — the protein multiplier resolver
 * and the constant tables it reads from.
 *
 * The hierarchy is phase > goal > default — pin each priority
 * branch and the unknown-key fallthrough. The constant tables get
 * value-pinned too so a tweak to the multipliers is visible in
 * the diff rather than slipping through silently.
 */
import { describe, it, expect } from "vitest";
import {
  PHASE_PROTEIN,
  GOAL_PROTEIN,
  DEFAULT_PROTEIN_MULTIPLIER,
  FAT_CALORIE_FRACTION,
  GOAL_CALORIE_OFFSET,
  WEEKLY_WEIGHT_TARGET,
  resolveProteinMultiplier,
} from "../macroConstants";

describe("resolveProteinMultiplier — phase priority", () => {
  it("uses PHASE_PROTEIN when phase is a known key", () => {
    expect(resolveProteinMultiplier("strength")).toBe(2.2);
    expect(resolveProteinMultiplier("hypertrophy")).toBe(2.0);
    expect(resolveProteinMultiplier("deload")).toBe(1.8);
    expect(resolveProteinMultiplier("race_prep")).toBe(1.6);
  });

  it("phase beats goal when both are provided", () => {
    /* Hierarchy contract: even if the goal says cut (2.2), if
       phase is deload (1.8) we follow phase. */
    expect(resolveProteinMultiplier("deload", "cut")).toBe(1.8);
  });
});

describe("resolveProteinMultiplier — goal fallback", () => {
  it("falls back to GOAL_PROTEIN when phase is missing", () => {
    expect(resolveProteinMultiplier(undefined, "cut")).toBe(2.2);
    expect(resolveProteinMultiplier(undefined, "lean bulk")).toBe(1.8);
    expect(resolveProteinMultiplier(undefined, "recomp")).toBe(2.0);
  });

  it("falls back to GOAL_PROTEIN when phase is an unknown key", () => {
    expect(resolveProteinMultiplier("not-a-real-phase", "cut")).toBe(2.2);
  });
});

describe("resolveProteinMultiplier — default", () => {
  it("returns the default when neither phase nor goal is set", () => {
    expect(resolveProteinMultiplier()).toBe(DEFAULT_PROTEIN_MULTIPLIER);
    expect(resolveProteinMultiplier(undefined, undefined)).toBe(2.0);
  });

  it("returns the default when both keys are unknown", () => {
    expect(
      resolveProteinMultiplier("not-a-phase", "not-a-goal"),
    ).toBe(DEFAULT_PROTEIN_MULTIPLIER);
  });
});

describe("constant tables — value pins", () => {
  /* Pinning these means a change to a constant shows up in the
     PR diff explicitly rather than slipping through. Each value
     has a documented rationale upstream — this guards against an
     accidental copy-paste shift in the source table. */
  it("PHASE_PROTEIN values", () => {
    expect(PHASE_PROTEIN).toEqual({
      strength: 2.2,
      hypertrophy: 2.0,
      deload: 1.8,
      race_prep: 1.6,
      cut: 2.2,
      base: 2.0,
    });
  });

  it("GOAL_PROTEIN values", () => {
    expect(GOAL_PROTEIN).toEqual({
      cut: 2.2,
      "lean bulk": 1.8,
      recomp: 2.0,
    });
  });

  it("GOAL_CALORIE_OFFSET values", () => {
    expect(GOAL_CALORIE_OFFSET).toEqual({
      cut: -500,
      "lean bulk": 300,
      recomp: 0,
    });
  });

  it("WEEKLY_WEIGHT_TARGET values", () => {
    expect(WEEKLY_WEIGHT_TARGET).toEqual({
      "lean bulk": 0.3,
      bulk: 0.3,
      cut: -0.5,
      maintain: 0,
      recomp: 0,
    });
  });

  it("FAT_CALORIE_FRACTION is 0.25 (25% of calories from fat)", () => {
    expect(FAT_CALORIE_FRACTION).toBe(0.25);
  });

  it("DEFAULT_PROTEIN_MULTIPLIER is 2.0", () => {
    expect(DEFAULT_PROTEIN_MULTIPLIER).toBe(2.0);
  });
});
