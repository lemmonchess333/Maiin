import { describe, it, expect } from "vitest";
import {
  pickEducationWinner,
  type EducationRegistration,
} from "../educationLane";

function reg(
  id: string,
  priority: number,
  eligible: boolean
): EducationRegistration {
  return { id, priority, eligible };
}

describe("pickEducationWinner (#995 tier-3 lane)", () => {
  it("returns the highest-priority eligible card", () => {
    expect(
      pickEducationWinner([
        reg("expenditure", 10, true),
        reg("welcome", 30, true),
        reg("body-metrics", 20, true),
      ])
    ).toBe("welcome");
  });

  it("skips ineligible cards (dismissed → eligible false)", () => {
    // welcome dismissed → body-metrics is next.
    expect(
      pickEducationWinner([
        reg("welcome", 30, false),
        reg("body-metrics", 20, true),
        reg("expenditure", 10, true),
      ])
    ).toBe("body-metrics");
  });

  it("falls through to the lowest card when higher ones are gone", () => {
    expect(
      pickEducationWinner([
        reg("welcome", 30, false),
        reg("body-metrics", 20, false),
        reg("expenditure", 10, true),
      ])
    ).toBe("expenditure");
  });

  it("returns null when nothing is eligible", () => {
    expect(
      pickEducationWinner([reg("a", 30, false), reg("b", 20, false)])
    ).toBeNull();
  });

  it("returns null for an empty registry", () => {
    expect(pickEducationWinner([])).toBeNull();
  });

  it("breaks ties deterministically by id", () => {
    expect(
      pickEducationWinner([reg("zeta", 10, true), reg("alpha", 10, true)])
    ).toBe("alpha");
  });
});
