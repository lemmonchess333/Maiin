import { describe, it, expect } from "vitest";
import { formatChallengeValue } from "../challengeFormat";
import { group } from "@/test/localeGrouping";

/* Lift18: a volume challenge's figures are stored in kg and read in the
   reader's lifting unit. */
describe("formatChallengeValue", () => {
  it("reads a volume total in kg by default", () => {
    expect(formatChallengeValue("total_volume", 12840)).toBe(
      `${group(12840)} kg`
    );
  });

  it("reads it in lb for an lb reader", () => {
    // 12,840 kg is 28,307 lb.
    expect(formatChallengeValue("total_volume", 12840, "lbs")).toBe(
      `${group(28307)} lb`
    );
  });

  it("leaves the other metrics alone", () => {
    expect(formatChallengeValue("fastest_effort", 1530, "lbs")).toBe("25:30");
    expect(formatChallengeValue("workout_count", 12, "lbs")).toBe("12");
  });
});

/* Together pass: a distance challenge reads in the reader's distance unit,
   as their runs do, to a tenth without a trailing ".0". */
describe("formatChallengeValue for distance", () => {
  it("reads km, whole without its .0", () => {
    expect(formatChallengeValue("total_km", 20)).toBe("20 km");
    expect(formatChallengeValue("total_km", 26.4)).toBe("26.4 km");
  });

  it("reads miles for a miles reader", () => {
    expect(formatChallengeValue("total_km", 26.4, "kg", "mi")).toBe("16.4 mi");
    expect(formatChallengeValue("total_km", 20, "kg", "mi")).toBe("12.4 mi");
  });
});
