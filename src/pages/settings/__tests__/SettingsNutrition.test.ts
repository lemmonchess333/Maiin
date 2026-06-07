import { describe, it, expect } from "vitest";
import { resolveProgramGoalMirror } from "../resolveProgramGoalMirror";

/**
 * Pins the mirrored-field invariant: a goal-weight change in Settings →
 * Nutrition that re-derives the nutrition phase must mirror the new phase into
 * programState.goal in the same operation — but ONLY when a plan already exists
 * and the phase actually changed. The lift engine reads programState.goal for
 * rep-scheme progression / the Program header / regenerate preference, so a
 * stale copy is the bug this guards against.
 */
describe("resolveProgramGoalMirror", () => {
  it("returns the derived phase when it differs from the stored goal", () => {
    expect(resolveProgramGoalMirror("cut", "recomp")).toBe("cut");
    expect(resolveProgramGoalMirror("lean bulk", "recomp")).toBe("lean bulk");
    expect(resolveProgramGoalMirror("recomp", "cut")).toBe("recomp");
  });

  it("returns null when the stored goal already equals the derived phase (no redundant write)", () => {
    expect(resolveProgramGoalMirror("cut", "cut")).toBeNull();
    expect(resolveProgramGoalMirror("recomp", "recomp")).toBeNull();
    expect(resolveProgramGoalMirror("lean bulk", "lean bulk")).toBeNull();
  });

  it("returns null when there is no programState goal yet (cold-start — never manufacture a partial doc)", () => {
    expect(resolveProgramGoalMirror("cut", null)).toBeNull();
    expect(resolveProgramGoalMirror("cut", undefined)).toBeNull();
  });
});
