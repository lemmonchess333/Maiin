import { describe, expect, it } from "vitest";
import { group } from "@/test/localeGrouping";
import { joinedProgress } from "../joinedProgress";

const days = {
  metric: "active_days",
  tiers: { bronze: 8, silver: 12, gold: 20 },
};
const km = { metric: "total_km", tiers: { bronze: 10, silver: 25, gold: 50 } };
const fastest = {
  metric: "fastest_effort",
  tiers: { bronze: 2100, silver: 1800, gold: 1500 },
};

describe("a joined challenge's progress line", () => {
  it("aims at bronze first, saying the unit once", () => {
    expect(joinedProgress(days, 3)).toEqual({
      line: "3 of 8 days",
      fraction: 3 / 8,
    });
    expect(joinedProgress(km, 4.5).line).toBe("4.5 of 10 km");
  });

  it("keeps both units when they differ in number", () => {
    // "1 day" and "8 days" are one unit, said once.
    expect(joinedProgress(days, 1).line).toBe("1 of 8 days");
  });

  it("names the tier held and aims at the next one", () => {
    expect(joinedProgress(days, 9)).toEqual({
      line: "Bronze · 9 of 12 days",
      fraction: 9 / 12,
    });
    expect(joinedProgress(days, 22)).toEqual({
      line: "Gold · 22 days",
      fraction: 1,
    });
  });

  it("counts sessions and points in words", () => {
    expect(
      joinedProgress(
        { metric: "workout_count", tiers: { bronze: 2, silver: 4, gold: 6 } },
        1
      ).line
    ).toBe("1 of 2 sessions");
    expect(
      joinedProgress(
        {
          metric: "hybrid_score",
          tiers: { bronze: 3000, silver: 6000, gold: 9000 },
        },
        1200
      ).line
    ).toBe(`${group(1200)} of ${group(3000)} points`);
  });

  it("reads a fastest effort as a best time against the next tier's", () => {
    expect(joinedProgress(fastest, 0)).toEqual({
      line: "Bronze at 35:00",
      fraction: 0,
    });
    expect(joinedProgress(fastest, 2400)).toEqual({
      line: "Best 40:00 · Bronze at 35:00",
      fraction: 2100 / 2400,
    });
    expect(joinedProgress(fastest, 1900).line).toBe(
      "Bronze · Best 31:40 · Silver at 30:00"
    );
  });

  it("speaks the reader's units", () => {
    expect(joinedProgress(km, 8.05, "kg", "mi").line).toBe("5 of 6.2 mi");
  });
});
