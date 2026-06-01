import { describe, it, expect } from "vitest";
import { nutritionPhaseLabel } from "@/lib/nutritionPhaseLabel";
import { GOAL_CALORIE_OFFSET } from "@/lib/macroConstants";

/**
 * Pins the onboarding review-step "Nutrition" row copy — the derived
 * phase + calorie consequence that goalToFitnessGoal previously made
 * invisible. Drives the row at Onboarding step 12.
 */
describe("nutritionPhaseLabel", () => {
  it("cut → deficit, signed", () => {
    expect(nutritionPhaseLabel("cut", GOAL_CALORIE_OFFSET["cut"])).toBe(
      "Cutting · -500 cal/day deficit"
    );
  });

  it("lean bulk → surplus, +signed", () => {
    expect(
      nutritionPhaseLabel("lean bulk", GOAL_CALORIE_OFFSET["lean bulk"])
    ).toBe("Lean bulk · +300 cal/day surplus");
  });

  it("recomp → maintenance (no number)", () => {
    expect(nutritionPhaseLabel("recomp", GOAL_CALORIE_OFFSET["recomp"])).toBe(
      "Recomp · maintenance calories"
    );
  });

  it("names match the three FitnessGoal values", () => {
    expect(nutritionPhaseLabel("cut", -500)).toMatch(/^Cutting/);
    expect(nutritionPhaseLabel("lean bulk", 300)).toMatch(/^Lean bulk/);
    expect(nutritionPhaseLabel("recomp", 0)).toMatch(/^Recomp/);
  });
});
