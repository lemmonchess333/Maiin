import { describe, it, expect } from "vitest";
import {
  VALID_EXPERIENCE,
  VALID_EQUIPMENT,
  VALID_RACE_DISTANCE,
} from "../programTypes";

/**
 * Pins the single-source plan-measure vocabularies (D3). The types derive from
 * these arrays (`(typeof VALID_*)[number]`), so they can't drift from each
 * other by construction; this pins the VALUES so a change is a conscious edit,
 * and guards against accidental dupes. The onboarding + settings capture
 * surfaces (Onboarding.tsx, ProgrammeSettings.tsx) now import these instead of
 * re-declaring them — the build is what enforces that alignment.
 */
describe("plan-measure vocabularies (D3 single source)", () => {
  it("experience", () => {
    expect([...VALID_EXPERIENCE]).toEqual([
      "beginner",
      "intermediate",
      "advanced",
    ]);
  });
  it("equipment", () => {
    expect([...VALID_EQUIPMENT]).toEqual(["full_gym", "home_gym", "minimal"]);
  });
  it("race distance", () => {
    expect([...VALID_RACE_DISTANCE]).toEqual(["5k", "10k", "half", "marathon"]);
  });
  it("no duplicate values within a vocabulary", () => {
    for (const v of [VALID_EXPERIENCE, VALID_EQUIPMENT, VALID_RACE_DISTANCE]) {
      expect(new Set(v).size).toBe(v.length);
    }
  });
});
