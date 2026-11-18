/**
 * What the streak's count stands against (DS5 rule 46): the longest
 * streak, and the next tier above the current one with how far off it is.
 */
import { describe, expect, it } from "vitest";
import { STREAK_TIERS, streakStanding } from "../streakStanding";

const none = new Set<string>();

describe("the streak's tiers", () => {
  it("are the streak badges from 3 days to 365, shortest first, without First Step", () => {
    expect(STREAK_TIERS.map((t) => t.threshold)).toEqual([
      3, 7, 14, 30, 60, 100, 365,
    ]);
    expect(STREAK_TIERS.map((t) => t.id)).not.toContain("first_step");
  });
});

describe("streakStanding", () => {
  it("names the next tier above the current streak and the days to it", () => {
    const s = streakStanding(12, 21, none);
    expect(s.next?.badge.id).toBe("two_week");
    expect(s.next?.days).toBe(14);
    expect(s.next?.toGo).toBe(2);
  });

  it("at a tier's own length, points at the one after it", () => {
    expect(streakStanding(2, 2, none).next).toMatchObject({ days: 3, toGo: 1 });
    expect(streakStanding(3, 3, none).next).toMatchObject({ days: 7, toGo: 4 });
    expect(streakStanding(364, 364, none).next).toMatchObject({
      days: 365,
      toGo: 1,
    });
  });

  it("has no next tier from 365 days on", () => {
    expect(streakStanding(365, 365, none).next).toBeNull();
    expect(streakStanding(400, 400, none).next).toBeNull();
  });

  it("follows the current streak, and says when its badge is already held", () => {
    // Longest 40, five days into a new one: two days from Week Warrior,
    // held since the long one, not 55 days from the next badge to earn.
    const held = new Set(["three_day", "week_warrior", "two_week"]);
    const s = streakStanding(5, 40, held);
    expect(s.next).toMatchObject({ days: 7, toGo: 2, earned: true });
    expect(streakStanding(5, 40, none).next?.earned).toBe(false);
  });

  it("keeps the longest at least as long as the current streak", () => {
    expect(streakStanding(12, 21, none)).toMatchObject({
      longest: 21,
      isLongest: false,
    });
    expect(streakStanding(12, 12, none)).toMatchObject({
      longest: 12,
      isLongest: true,
    });
    // A stored longest that lags the live count is the live count.
    expect(streakStanding(12, 9, none)).toMatchObject({
      longest: 12,
      isLongest: true,
    });
  });

  it("reads nonsense as no days, and no streak as not the longest", () => {
    expect(streakStanding(Number.NaN, undefined, none)).toMatchObject({
      longest: 0,
      isLongest: false,
      next: { days: 3, toGo: 3 },
    });
    expect(streakStanding(0, 30, none)).toMatchObject({
      longest: 30,
      isLongest: false,
    });
  });
});
