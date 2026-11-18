/**
 * Social at small numbers (App1 Q6): leagues, challenges and Spaces are
 * offered once the server's counts say enough people are training on
 * Tropos, the league's own GROUP_MIN; someone in a room keeps it.
 */
import { describe, expect, it } from "vitest";
import { GROUP_MIN } from "@/features/league/leagueRules";
import {
  communityGoalIds,
  hasEnoughPeople,
  peopleTrainingLately,
  roomShown,
} from "../enoughPeople";

describe("communityGoalIds", () => {
  it("names this UTC month's community goal and last month's", () => {
    expect(communityGoalIds(new Date("2026-11-14T09:00:00Z"))).toEqual([
      "group-goal-2026-11-01",
      "group-goal-2026-10-01",
    ]);
  });

  it("reaches back across a new year", () => {
    expect(communityGoalIds(new Date("2027-01-01T00:30:00Z"))).toEqual([
      "group-goal-2027-01-01",
      "group-goal-2026-12-01",
    ]);
  });

  it("goes by the UTC month, as the server names the goal", () => {
    // 23:30 on 31 October in UTC-5 is already November in UTC.
    expect(communityGoalIds(new Date("2026-11-01T04:30:00Z"))[0]).toBe(
      "group-goal-2026-11-01"
    );
  });
});

describe("peopleTrainingLately", () => {
  it("takes the largest of the counts", () => {
    expect(peopleTrainingLately([4, 12, 7])).toBe(12);
  });

  it("counts anything that is not a whole count as none", () => {
    expect(peopleTrainingLately([undefined, null, "12", -3, 2.5, NaN])).toBe(0);
    expect(peopleTrainingLately([undefined, 3])).toBe(3);
  });

  it("is 0 with nothing to read", () => {
    expect(peopleTrainingLately([])).toBe(0);
  });
});

describe("hasEnoughPeople", () => {
  it("opens at the league's own number, and not one below it", () => {
    expect(GROUP_MIN).toBe(10);
    expect(hasEnoughPeople(GROUP_MIN)).toBe(true);
    expect(hasEnoughPeople(GROUP_MIN - 1)).toBe(false);
    expect(hasEnoughPeople(0)).toBe(false);
  });
});

describe("roomShown", () => {
  it("always shows a room to someone in it, whatever the count", () => {
    expect(roomShown(true, false)).toBe(true);
    expect(roomShown(true, null)).toBe(true);
  });

  it("offers a room to anyone else only once there are enough people", () => {
    expect(roomShown(false, true)).toBe(true);
    expect(roomShown(false, false)).toBe(false);
  });

  it("offers nothing while the count is still being read", () => {
    expect(roomShown(false, null)).toBe(false);
  });
});
