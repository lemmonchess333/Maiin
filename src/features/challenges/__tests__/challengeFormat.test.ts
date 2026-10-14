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
