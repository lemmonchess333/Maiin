import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  challengeGoal,
  formatChallengeValue,
  type ChallengeGoalSource,
} from "../challengeFormat";
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

  it("names distinct activity days, including the singular and zero", () => {
    expect(formatChallengeValue("active_days", 0)).toBe("0 days");
    expect(formatChallengeValue("active_days", 1)).toBe("1 day");
    expect(formatChallengeValue("active_days", 8, "lbs", "mi")).toBe("8 days");
  });

  it("shows only completed training minutes without rounding up", () => {
    expect(formatChallengeValue("training_minutes", 0)).toBe("0 min");
    expect(formatChallengeValue("training_minutes", 59.999)).toBe("59 min");
    expect(formatChallengeValue("training_minutes", 60)).toBe("60 min");
    expect(formatChallengeValue("training_minutes", 1200.5, "lbs", "mi")).toBe(
      `${group(1200)} min`
    );
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

/* The goal a card says: the challenge's own first target, its metric and
   its period, in the reader's units. */
describe("challengeGoal", () => {
  const monthly = (
    metric: string,
    bronze: number,
    over: Partial<ChallengeGoalSource> = {}
  ): ChallengeGoalSource => ({
    metric,
    type: "monthly",
    tiers: { bronze },
    ...over,
  });

  it("says each server metric's goal from its first target", () => {
    expect(challengeGoal(monthly("total_km", 10))).toBe(
      "Run 10 km this month."
    );
    expect(challengeGoal(monthly("total_volume", 5000))).toBe(
      `Lift ${group(5000)} kg in total this month.`
    );
    expect(challengeGoal(monthly("hybrid_score", 3000))).toBe(
      `Score ${group(3000)} points from running and lifting this month.`
    );
    expect(challengeGoal(monthly("active_days", 8))).toBe(
      "Train on 8 days this month."
    );
    expect(challengeGoal(monthly("training_minutes", 120))).toBe(
      "Train for 120 min this month."
    );
    expect(
      challengeGoal(
        monthly("fastest_effort", 35 * 60, { targetDistance: 5000 })
      )
    ).toBe("Run a 5K in 35:00 or faster this month.");
    expect(
      challengeGoal({
        metric: "workout_count",
        type: "seasonal",
        tiers: { bronze: 8 },
      })
    ).toBe("Lift 8 times this season.");
    expect(
      challengeGoal({
        metric: "workout_count",
        type: "weekly",
        tiers: { bronze: 2 },
      })
    ).toBe("Lift 2 times this week.");
  });

  it("reads in the reader's units", () => {
    expect(challengeGoal(monthly("total_km", 10), "kg", "mi")).toBe(
      "Run 6.2 mi this month."
    );
    expect(challengeGoal(monthly("total_volume", 5000), "lbs")).toBe(
      `Lift ${group(11023)} lb in total this month.`
    );
  });

  it("aims a collective challenge at its shared total", () => {
    expect(
      challengeGoal(monthly("total_km", 1000, { collectiveTarget: 1000 }))
    ).toBe("Run 1000 km together this month.");
  });

  it("leaves out a period it does not know, and says nothing for a metric it does not know", () => {
    expect(challengeGoal({ metric: "total_km", tiers: { bronze: 20 } })).toBe(
      "Run 20 km."
    );
    expect(challengeGoal(monthly("streak_days", 7))).toBeNull();
    expect(challengeGoal(monthly("total_km", 0))).toBeNull();
    expect(challengeGoal({ metric: "total_km" })).toBeNull();
  });

  it("phrases every challenge the server defines, so none falls back", () => {
    const require = createRequire(import.meta.url);
    const { buildCurrentChallenges } =
      require("../../../../functions/lib/challengeDefs") as {
        buildCurrentChallenges: (now: Date) => ChallengeGoalSource[];
      };
    // A year of months covers every season and every featured rotation.
    let seen = 0;
    for (let month = 0; month < 12; month++)
      for (const c of buildCurrentChallenges(
        new Date(Date.UTC(2026, month, 15))
      )) {
        seen++;
        expect(challengeGoal(c), c.metric).toMatch(
          /^[A-Z].* this (week|month|season)\.$/
        );
      }
    expect(seen).toBeGreaterThan(12);
  });
});
