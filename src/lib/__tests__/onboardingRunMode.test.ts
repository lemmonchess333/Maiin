import { describe, it, expect } from "vitest";
import { resolveOnboardingRunMode } from "../onboardingRunMode";

describe("resolveOnboardingRunMode (#975)", () => {
  it("race_prep WITH a date stays race_prep", () => {
    expect(
      resolveOnboardingRunMode({
        runFrequency: "3x",
        runMode: "race_prep",
        hasRaceDate: true,
      })
    ).toBe("race_prep");
  });

  it("race_prep WITHOUT a date collapses to the freeform substrate (Run9a)", () => {
    expect(
      resolveOnboardingRunMode({
        runFrequency: "3x",
        runMode: "race_prep",
        hasRaceDate: false,
      })
    ).toBe("freeform");
  });

  it("no running at all is always freeform, regardless of mode/date", () => {
    expect(
      resolveOnboardingRunMode({
        runFrequency: "none",
        runMode: "race_prep",
        hasRaceDate: true,
      })
    ).toBe("freeform");
    expect(
      resolveOnboardingRunMode({
        runFrequency: "none",
        runMode: "structured",
        hasRaceDate: false,
      })
    ).toBe("freeform");
  });

  it("freeform passes through untouched", () => {
    expect(
      resolveOnboardingRunMode({
        runFrequency: "3x",
        runMode: "freeform",
        hasRaceDate: false,
      })
    ).toBe("freeform");
  });

  it("structured is never coerced by the race-date rule", () => {
    expect(
      resolveOnboardingRunMode({
        runFrequency: "4x",
        runMode: "structured",
        hasRaceDate: false,
      })
    ).toBe("structured");
  });
});
