/**
 * The collapsed entry to the not-joined challenges says what its number
 * counts, and no deadline: the monthly challenges all end on the same
 * day, which the featured card above it already says.
 */
import { describe, it, expect } from "vitest";
import { moreChallengesLabel } from "../useChallenges";

describe("moreChallengesLabel", () => {
  it("counts the challenges in plain words", () => {
    expect(moreChallengesLabel(1)).toBe("See 1 more challenge");
    expect(moreChallengesLabel(5)).toBe("See 5 more challenges");
  });

  it("carries no time left", () => {
    expect(moreChallengesLabel(3)).not.toMatch(/left|·/);
  });
});
