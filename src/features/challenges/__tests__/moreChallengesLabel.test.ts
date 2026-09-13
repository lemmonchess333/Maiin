/**
 * The collapsed entry to the not-joined challenges says what its number
 * counts. It used to render "See all challenges · 1 · 20 days left".
 */
import { describe, it, expect } from "vitest";
import { moreChallengesLabel } from "../useChallenges";

describe("moreChallengesLabel", () => {
  it("counts the challenges in plain words, with the nearest deadline", () => {
    expect(moreChallengesLabel(1, "20 days left")).toBe(
      "See 1 more challenge · 20 days left"
    );
    expect(moreChallengesLabel(3, "5 days left")).toBe(
      "See 3 more challenges · 5 days left"
    );
  });

  it("drops the deadline when there is none to show", () => {
    expect(moreChallengesLabel(2, null)).toBe("See 2 more challenges");
    expect(moreChallengesLabel(2, "")).toBe("See 2 more challenges");
  });
});
