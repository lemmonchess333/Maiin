/**
 * The medal rules the app reads (Soc15): a stored line read as a medal or
 * skipped, the trophy case's order, the words and figures a medal says in
 * the reader's units, and which medal a visit reveals.
 *
 * Dates are built from the clock where a window has to contain them (the
 * reveal's fortnight); the edition labels use fixed day keys, which no
 * window contains. No assertion spells a thousands separator
 * (src/test/localeGrouping.ts says why).
 */
import { describe, it, expect } from "vitest";
import {
  MEDAL_REVEAL_WINDOW_DAYS,
  medalEdition,
  medalEditionDates,
  medalFace,
  medalFromChallenge,
  medalGoalFace,
  medalGoalLine,
  medalStillRunning,
  medalTitle,
  medalToReveal,
  medalValueLabel,
  parseMedal,
  parseMedalSummary,
  sortMedals,
  type Medal,
} from "../medals";
import { group } from "@/test/localeGrouping";

const DAY = 86_400_000;

const line = (over: Record<string, unknown> = {}) => ({
  tier: "gold",
  name: "November Mileage",
  metric: "total_km",
  type: "monthly",
  value: 52.4,
  goal: 50,
  startDate: "2026-11-01",
  endDate: "2026-12-01",
  ...over,
});

const medal = (over: Partial<Medal> = {}): Medal => ({
  ...(parseMedal("monthly-2026-11-01", line()) as Medal),
  ...over,
});

describe("reading a stored medal", () => {
  it("reads a summary line", () => {
    expect(parseMedal("monthly-2026-11-01", line())).toEqual({
      challengeId: "monthly-2026-11-01",
      name: "November Mileage",
      metric: "total_km",
      type: "monthly",
      tier: "gold",
      value: 52.4,
      goal: 50,
      startDate: "2026-11-01",
      endDate: "2026-12-01",
    });
  });

  it("skips what is not a medal", () => {
    for (const bad of [
      null,
      "gold",
      [],
      line({ tier: "platinum" }),
      line({ name: "" }),
      line({ name: 7 }),
      line({ metric: undefined }),
      line({ startDate: "1 Nov" }),
      line({ endDate: "2026-11-01" }),
    ]) {
      expect(parseMedal("x", bad)).toBeNull();
    }
  });

  it("reads a bad figure as nothing rather than drawing it", () => {
    expect(parseMedal("x", line({ value: "52", goal: -1 }))).toMatchObject({
      value: 0,
      goal: 0,
    });
  });

  it("reads the summary newest first, the higher tier first within an edition", () => {
    const medals = parseMedalSummary({
      october: line({ startDate: "2026-10-01", endDate: "2026-11-01" }),
      novSilver: line({ tier: "silver", name: "November Strength" }),
      novGold: line(),
      junk: { tier: "gold" },
    });
    expect(medals.map((m) => m.challengeId)).toEqual([
      "novGold",
      "novSilver",
      "october",
    ]);
  });

  it("reads nothing from a summary that is not a map", () => {
    expect(parseMedalSummary(undefined)).toEqual([]);
    expect(parseMedalSummary("medals")).toEqual([]);
    expect(parseMedalSummary([line()])).toEqual([]);
  });

  it("sorts without changing its input", () => {
    const input = [
      medal({ endDate: "2026-10-01", startDate: "2026-09-01" }),
      medal(),
    ];
    const sorted = sortMedals(input);
    expect(sorted[0].endDate).toBe("2026-12-01");
    expect(input[0].endDate).toBe("2026-10-01");
  });
});

describe("what a medal says", () => {
  it("is titled by its tier and its challenge", () => {
    expect(medalTitle(medal())).toBe("Gold · November Mileage");
  });

  it("carries its edition: a month, a week, a season", () => {
    expect(medalEdition(medal())).toBe("Nov 2026");
    expect(
      medalEdition(
        medal({
          type: "weekly",
          startDate: "2026-11-02",
          endDate: "2026-11-09",
        })
      )
    ).toBe("2–8 Nov");
    expect(
      medalEdition(
        medal({
          type: "weekly",
          startDate: "2026-11-30",
          endDate: "2026-12-07",
        })
      )
    ).toBe("30 Nov–6 Dec");
    expect(
      medalEdition(
        medal({
          type: "seasonal",
          startDate: "2026-09-01",
          endDate: "2026-12-01",
        })
      )
    ).toMatch(/^Sept?–Nov 2026$/);
    expect(
      medalEdition(
        medal({
          type: "seasonal",
          startDate: "2026-12-01",
          endDate: "2027-03-01",
        })
      )
    ).toBe("Dec–Feb 2027");
  });

  it("gives the edition's dates in full, the last day the day before the next opens", () => {
    expect(medalEditionDates(medal())).toBe("1–30 November 2026");
    expect(
      medalEditionDates(
        medal({ startDate: "2026-09-01", endDate: "2026-12-01" })
      )
    ).toBe("1 September – 30 November 2026");
    expect(
      medalEditionDates(
        medal({ startDate: "2026-12-28", endDate: "2027-01-04" })
      )
    ).toBe("28 December 2026 – 3 January 2027");
  });

  it("says its figure in the reader's units", () => {
    expect(medalValueLabel(medal(), "kg", "km")).toBe("52.4 km");
    expect(medalValueLabel(medal(), "kg", "mi")).toBe("32.6 mi");
    expect(
      medalValueLabel({ metric: "total_volume", value: 12840 }, "lbs", "km")
    ).toBe(`${group(28307)} lb`);
    expect(medalValueLabel({ metric: "fastest_effort", value: 1421 })).toBe(
      "23:41"
    );
    expect(medalValueLabel({ metric: "workout_count", value: 1 })).toBe(
      "1 lift"
    );
    expect(medalValueLabel({ metric: "workout_count", value: 7 })).toBe(
      "7 lifts"
    );
    expect(medalValueLabel({ metric: "hybrid_score", value: 8400 })).toBe(
      `${group(8400)} points`
    );
    expect(medalValueLabel({ metric: "active_days", value: 12 })).toBe(
      "12 days"
    );
    expect(medalValueLabel({ metric: "training_minutes", value: 340.6 })).toBe(
      "340 min"
    );
  });

  it("puts the tier's goal on its face, short enough to fit", () => {
    expect(medalGoalFace(medal())).toEqual({ figure: "50", unit: "km" });
    expect(medalGoalFace(medal(), "kg", "mi")).toEqual({
      figure: "31.1",
      unit: "mi",
    });
    expect(
      medalGoalFace({
        metric: "fastest_effort",
        goal: 1500,
        targetDistance: 5000,
      })
    ).toEqual({ figure: "25:00", unit: "5K" });
    expect(medalGoalFace({ metric: "total_volume", goal: 30000 })).toEqual({
      figure: "30k",
      unit: "kg",
    });
    expect(
      medalGoalFace({ metric: "total_volume", goal: 5000 }, "lbs")
    ).toEqual({ figure: "11k", unit: "lb" });
    expect(medalGoalFace({ metric: "hybrid_score", goal: 1500 })).toEqual({
      figure: "1.5k",
      unit: "points",
    });
    expect(medalGoalFace({ metric: "workout_count", goal: 6 })).toEqual({
      figure: "6",
      unit: "lifts",
    });
  });

  it("says what the tier stood for", () => {
    expect(medalGoalLine(medal())).toBe("Gold was 50 km.");
    expect(
      medalGoalLine(
        medal({
          tier: "silver",
          metric: "fastest_effort",
          goal: 1800,
          targetDistance: 5000,
        })
      )
    ).toBe("Silver was a 5K in 30:00 or faster.");
  });

  it("draws in its sport's colours", () => {
    expect(medalFace(medal()).sport).toBe("running");
    expect(medalFace(medal({ metric: "total_volume" })).sport).toBe("lifting");
    expect(medalFace(medal({ metric: "hybrid_score" })).sport).toBe("mixed");
  });

  it("is still running until local midnight of its end day", () => {
    const end = new Date(2026, 11, 1).getTime();
    expect(medalStillRunning(medal(), end - 1)).toBe(true);
    expect(medalStillRunning(medal(), end)).toBe(false);
  });
});

describe("a finished challenge's own medal", () => {
  const challenge = {
    id: "monthly-2026-11-01",
    name: "November Mileage",
    metric: "total_km",
    type: "monthly",
    tiers: { bronze: 10, silver: 25, gold: 50 },
    startDate: new Date(Date.UTC(2026, 10, 1)),
    endDate: new Date(Date.UTC(2026, 11, 1)),
  };

  it("is the medal the server writes for that standing", () => {
    expect(
      medalFromChallenge(challenge, {
        tierAchieved: "gold",
        currentValue: 52.4,
      })
    ).toEqual(medal());
  });

  it("is none below bronze, and none for a community goal", () => {
    expect(
      medalFromChallenge(challenge, { tierAchieved: null, currentValue: 4 })
    ).toBeNull();
    expect(
      medalFromChallenge(
        { ...challenge, collectiveTarget: 1000 },
        { tierAchieved: "gold", currentValue: 1200 }
      )
    ).toBeNull();
  });
});

describe("which medal a visit reveals", () => {
  const now = Date.now();
  const earned = (id: string, tier: Medal["tier"], daysAgo: number) =>
    medal({
      challengeId: id,
      tier,
      earnedAt: new Date(now - daysAgo * DAY).toISOString(),
    });

  it("one not yet revealed, the highest tier first, then the newest", () => {
    const medals = [
      earned("a", "bronze", 1),
      earned("b", "gold", 3),
      earned("c", "gold", 2),
    ];
    expect(medalToReveal(medals, {}, now)?.challengeId).toBe("c");
  });

  it("a silver after its bronze was revealed is a new moment; the same tier is not", () => {
    const silver = earned("a", "silver", 1);
    expect(medalToReveal([silver], { a: 1 }, now)).toBe(silver);
    expect(medalToReveal([silver], { a: 2 }, now)).toBeNull();
    expect(medalToReveal([earned("a", "bronze", 1)], { a: 2 }, now)).toBeNull();
  });

  it("none older than the window, and none without the day it came", () => {
    expect(
      medalToReveal(
        [earned("a", "gold", MEDAL_REVEAL_WINDOW_DAYS + 1)],
        {},
        now
      )
    ).toBeNull();
    expect(medalToReveal([medal()], {}, now)).toBeNull();
  });
});
