import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { streakAcross } from "../useStreaks";
import { streakMoment } from "@/lib/postMoments";

/**
 * What a session saved on a day does to the streak, for the post's streak
 * moment (Soc15): the same walk, grace and stored anchor as the streak
 * shown everywhere else, before the day is active and after.
 */

// Pinned "now", clear of any DST transition in either hemisphere, so
// calendar-day offsets are stable in the test timezone.
const NOW = new Date("2026-05-15T12:00:00");
const dayKey = (offset: number) =>
  format(new Date(NOW.getTime() - offset * 86400000), "yyyy-MM-dd");
const days = (...offsets: number[]) => new Set(offsets.map(dayKey));
const run = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("streakAcross", () => {
  it("adds today to a streak that ran through yesterday", () => {
    const across = streakAcross(days(...run(1, 6)), null, dayKey(0), NOW);
    expect(across).toEqual({ before: 6, after: 7 });
    expect(streakMoment(across)).toEqual({ kind: "streak", days: 7 });
  });

  it("changes nothing on a day already active: the meal that morning reached it", () => {
    const across = streakAcross(days(...run(0, 6)), null, dayKey(0), NOW);
    expect(across).toEqual({ before: 7, after: 7 });
    expect(streakMoment(across)).toBeNull();
  });

  it("starts at one for a first day, a cold start with nothing behind it", () => {
    expect(streakAcross(new Set(), null, dayKey(0), NOW)).toEqual({
      before: 0,
      after: 1,
    });
  });

  it("measures the morning after a rest day from the streak it keeps", () => {
    // Active up to the day before yesterday; yesterday a rest day. The
    // streak shown is 0, but the one logging today keeps is 13, and the
    // session bridges yesterday into 15.
    const across = streakAcross(days(...run(2, 14)), null, dayKey(0), NOW);
    expect(across).toEqual({ before: 13, after: 15 });
    expect(streakMoment(across)).toEqual({ kind: "streak", days: 14 });
  });

  it("reaches 100 through the stored anchor, past the 90-day window", () => {
    // The window holds only the last few days; the stored pair certifies
    // the 98 days through the day before yesterday.
    const anchor = { streak: 98, lastActiveDate: dayKey(2) };
    const across = streakAcross(days(1, 2), anchor, dayKey(0), NOW);
    expect(across).toEqual({ before: 99, after: 100 });
    expect(streakMoment(across)).toEqual({ kind: "streak", days: 100 });
  });

  it("counts a session dated yesterday, begun before midnight, on its own day", () => {
    const across = streakAcross(days(...run(2, 7)), null, dayKey(1), NOW);
    expect(across).toEqual({ before: 6, after: 7 });
  });
});
