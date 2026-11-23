import { describe, expect, it } from "vitest";
import {
  daysLeftIncludingToday,
  outOfReach,
  reachTurnsOnDaysTrained,
  type ReachChallenge,
} from "../challengeReach";

/* November's days challenge as the server writes it (challengeDefs.js):
   [1 Nov, 1 Dec), first goal 8 days. */
const days = (overrides: Partial<ReachChallenge> = {}): ReachChallenge => ({
  id: "featured-monthly-2026-11-01",
  metric: "active_days",
  tiers: { bronze: 8 },
  startDate: new Date("2026-11-01T00:00:00Z"),
  endDate: new Date("2026-12-01T00:00:00Z"),
  ...overrides,
});

describe("daysLeftIncludingToday", () => {
  it("counts today and every day to the window's end", () => {
    expect(daysLeftIncludingToday(days(), "2026-11-01")).toBe(30);
    expect(daysLeftIncludingToday(days(), "2026-11-23")).toBe(8);
    expect(daysLeftIncludingToday(days(), "2026-11-30")).toBe(1);
  });
  it("is null outside the window", () => {
    expect(daysLeftIncludingToday(days(), "2026-12-01")).toBeNull();
    expect(daysLeftIncludingToday(days(), "2026-10-31")).toBeNull();
  });
});

describe("outOfReach — days still needed against days left, today included", () => {
  it("is reachable while the days needed fit in the days left", () => {
    // 23 Nov: 8 days left, today included, and 8 needed from nothing.
    expect(outOfReach(days(), 0, "2026-11-23")).toBe(false);
    // 27 Nov: 4 left, and 4 still needed after 4 trained.
    expect(outOfReach(days(), 4, "2026-11-27")).toBe(false);
  });
  it("is out of reach once the days needed outnumber the days left", () => {
    expect(outOfReach(days(), 0, "2026-11-24")).toBe(true);
    expect(outOfReach(days(), 3, "2026-11-27")).toBe(true);
  });
  it("never once the goal is met", () => {
    expect(outOfReach(days(), 8, "2026-11-30")).toBe(false);
    expect(outOfReach(days(), 12, "2026-11-30")).toBe(false);
  });
  it("takes an unknown count as reachable", () => {
    expect(outOfReach(days(), null, "2026-11-30")).toBe(false);
  });
  it("never calls a distance, volume, minutes, sessions or points goal out of reach", () => {
    for (const metric of [
      "total_km",
      "total_volume",
      "training_minutes",
      "workout_count",
      "hybrid_score",
      "fastest_effort",
    ])
      expect(outOfReach(days({ metric }), 0, "2026-11-30"), metric).toBe(false);
  });
  it("needs the days trained only when the goal is longer than the days left", () => {
    expect(reachTurnsOnDaysTrained(days(), "2026-11-23")).toBe(false);
    expect(reachTurnsOnDaysTrained(days(), "2026-11-24")).toBe(true);
    expect(reachTurnsOnDaysTrained(days(), "2026-12-01")).toBe(false);
  });
});
