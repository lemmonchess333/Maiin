/**
 * A recent session's day in the Space composer's "Attach a session" list
 * (the Social pass, 2026-10-13): two 5 km runs or two push days read the
 * same without one, so each row names its day.
 */
import { describe, expect, it } from "vitest";
import { recentSessionDay, type RecentSession } from "../useRecentSessions";

const now = new Date(2026, 9, 13, 21, 0); // Tue 13 Oct 2026, evening

const run = (completedAt: Date): RecentSession =>
  ({ kind: "run", run: { completedAt } }) as unknown as RecentSession;
const workout = (date: string): RecentSession =>
  ({
    kind: "workout",
    workout: { date, exercises: [] },
  }) as unknown as RecentSession;

describe("recentSessionDay", () => {
  it("names today and yesterday", () => {
    expect(recentSessionDay(run(new Date(2026, 9, 13, 7, 10)), now)).toBe(
      "Today"
    );
    expect(recentSessionDay(workout("2026-10-12"), now)).toBe("Yesterday");
  });

  it("gives an older session its weekday and date, day first", () => {
    expect(recentSessionDay(run(new Date(2026, 9, 10, 9, 0)), now)).toBe(
      "Sat 10 Oct"
    );
    expect(recentSessionDay(workout("2026-10-06"), now)).toBe("Tue 6 Oct");
  });

  it("says nothing for a session with no readable day", () => {
    expect(recentSessionDay(workout(""), now)).toBe("");
    expect(recentSessionDay(run(new Date(Number.NaN)), now)).toBe("");
  });
});
