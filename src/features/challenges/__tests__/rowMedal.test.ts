/**
 * The medal a challenge's row shows on Together (Soc16): the tier the
 * person is working toward.
 */
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { rowMedalFace, rowMedalTier } from "../rowMedal";
import type { Challenge } from "../useChallenges";

const tiers = { bronze: 10, silver: 25, gold: 50 };

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: "monthly-2026-09-01",
    name: "September Mileage",
    description: "Every run adds up",
    type: "monthly",
    metric: "total_km",
    icon: "footprints",
    tiers,
    startDate: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")),
    endDate: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
    participantCount: 0,
    ...over,
  } as Challenge;
}

describe("the tier a row's medal shows", () => {
  it("is bronze before any tier, then the next one, then gold", () => {
    expect(rowMedalTier({ tiers })).toBe("bronze");
    expect(rowMedalTier({ tiers }, { tierAchieved: null })).toBe("bronze");
    expect(rowMedalTier({ tiers }, { tierAchieved: "bronze" })).toBe("silver");
    expect(rowMedalTier({ tiers }, { tierAchieved: "silver" })).toBe("gold");
    expect(rowMedalTier({ tiers }, { tierAchieved: "gold" })).toBe("gold");
  });

  it("passes over a tier the challenge does not set", () => {
    const twoTiers = { bronze: 2, gold: 6 } as Challenge["tiers"];
    expect(rowMedalTier({ tiers: twoTiers }, { tierAchieved: "bronze" })).toBe(
      "gold"
    );
  });

  it("is none for a challenge with no tiers", () => {
    expect(rowMedalTier({ tiers: {} as Challenge["tiers"] })).toBeNull();
  });
});

describe("the medal's face", () => {
  it("carries the goal of the tier it shows, in the reader's units", () => {
    expect(rowMedalFace(challenge(), null, "kg", "km")).toMatchObject({
      tier: "bronze",
      sport: "running",
      figure: "10",
      unit: "km",
    });
    expect(
      rowMedalFace(
        challenge(),
        { currentValue: 12, tierAchieved: "bronze" } as never,
        "kg",
        "km"
      )
    ).toMatchObject({ tier: "silver", figure: "25" });
  });

  it("is none for the community goal, which awards no medal", () => {
    expect(
      rowMedalFace(
        challenge({ id: "group-goal-2026-09", collectiveTarget: 1000 }),
        null,
        "kg",
        "km"
      )
    ).toBeNull();
  });
});
