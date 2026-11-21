/**
 * What the streak's count stands against (DS5 rule 46): the longest
 * streak, and the next tier above the current one with how far off it is.
 */
import { describe, expect, it } from "vitest";
import { STREAK_TIERS, standingLines, streakStanding } from "../streakStanding";

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

describe("the band's words", () => {
  const words = (current: number, longest: number, held: string[] = []) =>
    standingLines(streakStanding(current, longest, new Set(held)), current);

  it("names the badge ahead and the days to it, then the longest", () => {
    expect(words(12, 21)).toEqual({
      title: "Two Week Wonder in 2 days",
      progress: "12 of 14 days",
      held: null,
      best: "Longest 21 days, 10 days to pass it",
    });
  });

  it("says one day, never one days", () => {
    expect(words(13, 13).title).toBe("Two Week Wonder in 1 day");
    expect(words(20, 21).best).toBe("Longest 21 days, 2 days to pass it");
    expect(words(20, 20, []).best).toBe("This is your longest");
    expect(words(2, 2).title).toBe("Getting Started in 1 day");
    expect(words(0, 1).best).toBe("Longest 1 day, 2 days to pass it");
  });

  it("for a badge already held, points at the length and says it is held", () => {
    expect(words(5, 40, ["three_day", "week_warrior"])).toEqual({
      title: "2 days to a 7-day streak",
      progress: "5 of 7 days",
      held: "Week Warrior already earned",
      best: "Longest 40 days, 36 days to pass it",
    });
  });

  it("past the last tier, names its badge, held or not", () => {
    expect(words(400, 400, ["year_long"])).toEqual({
      title: "Year of Tropos",
      progress: null,
      held: "Already earned",
      best: "This is your longest",
    });
    // The server's award not read yet: no claim either way.
    expect(words(365, 500)).toEqual({
      title: "Year of Tropos",
      progress: null,
      held: null,
      best: "Longest 500 days, 136 days to pass it",
    });
  });

  it("with no streak and no record, says nothing of a longest", () => {
    expect(words(0, 0)).toEqual({
      title: "Getting Started in 3 days",
      progress: "0 of 3 days",
      held: null,
      best: null,
    });
  });
});

describe("the last tier", () => {
  it("is set only once the current streak has reached it", () => {
    expect(streakStanding(364, 364, new Set()).lastTier).toBeNull();
    expect(
      streakStanding(365, 365, new Set(["year_long"])).lastTier
    ).toMatchObject({
      badge: { id: "year_long" },
      earned: true,
    });
  });
});
