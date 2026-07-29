import { describe, expect, it } from "vitest";

import { isSetEligibleForStrengthPr } from "../sessionSetPolicy";

describe("isSetEligibleForStrengthPr", () => {
  it("rejects warm-ups so they cannot create phantom rep PRs", () => {
    expect(isSetEligibleForStrengthPr("warmup", undefined)).toBe(false);
  });

  it("rejects duration-based holds from repetition and volume PR buckets", () => {
    expect(isSetEligibleForStrengthPr("working", "seconds")).toBe(false);
  });

  it("keeps ordinary working sets eligible", () => {
    expect(isSetEligibleForStrengthPr("working", undefined)).toBe(true);
  });
});
