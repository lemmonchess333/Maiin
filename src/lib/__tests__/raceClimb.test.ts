import { describe, expect, it } from "vitest";
import {
  climbFieldMaxLength,
  climbFieldNote,
  climbFieldText,
  parseClimbField,
} from "@/lib/raceClimb";
import { MAX_RACE_CLIMB_M } from "@/features/program/runPlanTiming";

/* Run26 (2): the race's climb as setup and the run-plan editor ask for it,
   typed in metres or feet and saved in whole metres. */
describe("the climb field", () => {
  it("reads an empty field as no climb, and whole numbers in the reader's unit", () => {
    expect(parseClimbField("", "km")).toBe(0);
    expect(parseClimbField("  ", "mi")).toBe(0);
    expect(parseClimbField("1500", "km")).toBe(1500);
    expect(parseClimbField("1,500", "km")).toBe(1500);
    // 5,000 ft is 1,524 m.
    expect(parseClimbField("5000", "mi")).toBe(1524);
  });

  it("refuses what isn't a whole number up to the bound", () => {
    for (const text of ["-10", "abc", "12a", "1e3"])
      expect(parseClimbField(text, "km"), text).toBeNull();
    expect(parseClimbField(String(MAX_RACE_CLIMB_M), "km")).toBe(
      MAX_RACE_CLIMB_M
    );
    expect(parseClimbField(String(MAX_RACE_CLIMB_M + 1), "km")).toBeNull();
    // 65,700 ft is 20,025 m, past the bound.
    expect(parseClimbField("65700", "mi")).toBeNull();
  });

  it("shows a stored climb in the reader's unit, and none as empty", () => {
    expect(climbFieldText(undefined, "km")).toBe("");
    expect(climbFieldText(0, "km")).toBe("");
    expect(climbFieldText(1500, "km")).toBe("1500");
    expect(climbFieldText(1524, "mi")).toBe("5000");
  });

  it("says when the climb makes a trail plan, from the plan's own rule", () => {
    // 10 m a km: 500 m over a 50K, 211 m over a half (to the nearest 10).
    expect(climbFieldNote({ distance: "50k", climbM: 0, unit: "km" })).toBe(
      "The course’s total climb. 500 m or more makes a trail plan."
    );
    expect(climbFieldNote({ distance: "half", climbM: 0, unit: "km" })).toBe(
      "The course’s total climb. 210 m or more makes a trail plan."
    );
    expect(climbFieldNote({ distance: "50k", climbM: 499, unit: "km" })).toBe(
      "The course’s total climb. 500 m or more makes a trail plan."
    );
    expect(climbFieldNote({ distance: "50k", climbM: 500, unit: "km" })).toBe(
      "A trail plan: long runs in time, hill work, run by effort."
    );
    expect(
      climbFieldNote({ distance: "10k", climbM: null, unit: "km" })
    ).toMatch(/^Enter the climb as a whole number, up to 20.000 m\.$/);
    // In feet for a reader in miles: 500 m is 1,640 ft.
    expect(climbFieldNote({ distance: "50k", climbM: 0, unit: "mi" })).toMatch(
      /^The course’s total climb\. 1.640 ft or more makes a trail plan\.$/
    );
  });
});

describe("climbFieldMaxLength", () => {
  /* The field took twelve digits and ran out of its box (owner's
     recording, 23 November 2026). It takes as many characters as the
     largest climb it keeps, written with its thousands comma. */
  it("holds the largest climb with its comma, in metres and in feet", () => {
    expect(climbFieldMaxLength("km")).toBe("20,000".length);
    expect(climbFieldMaxLength("mi")).toBe("65,617".length);
  });

  it("lets every climb it keeps be typed, and the largest with its comma", () => {
    for (const unit of ["km", "mi"] as const) {
      const largest = climbFieldText(MAX_RACE_CLIMB_M, unit);
      const withComma = Number(largest).toLocaleString("en-GB");
      expect(withComma.length).toBeLessThanOrEqual(climbFieldMaxLength(unit));
      expect(parseClimbField(withComma, unit)).not.toBeNull();
    }
  });
});
