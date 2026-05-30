import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { computeCurrentStreak, computeStreakSpan } from "../useStreaks";

// Pinned "now" — mid-May is well clear of any DST transition in either
// hemisphere, so calendar-day offsets are stable in the test timezone.
const NOW = new Date("2026-05-15T12:00:00");

// offset 0 = today, 1 = yesterday, 2 = day-before, ...
const dayKey = (offset: number) =>
  format(new Date(NOW.getTime() - offset * 86400000), "yyyy-MM-dd");
const activeSet = (...offsets: number[]) => new Set(offsets.map(dayKey));
const streak = (...offsets: number[]) =>
  computeCurrentStreak(activeSet(...offsets), NOW);

describe("computeCurrentStreak — base behaviour", () => {
  it("returns 0 for an empty set", () => {
    expect(computeCurrentStreak(new Set(), NOW)).toBe(0);
  });

  it("counts a single active today as 1", () => {
    expect(streak(0)).toBe(1);
  });

  it("counts a contiguous run ending today", () => {
    expect(streak(0, 1, 2, 3, 4)).toBe(5);
  });

  it("anchors on yesterday when today is missing (at-risk, not broken)", () => {
    expect(streak(1, 2, 3)).toBe(3);
  });

  it("returns 0 when neither today nor yesterday is active", () => {
    expect(streak(3, 4, 5)).toBe(0);
  });
});

describe("computeCurrentStreak — grace forgiveness", () => {
  it("bridges a single isolated gap (active–gap–active)", () => {
    // today active, yesterday missed, day-2 active → 3-day span
    expect(streak(0, 2)).toBe(3);
  });

  it("never forgives twice — two consecutive misses break the streak", () => {
    // today active, day-1 + day-2 missed, day-3 active → only today counts
    expect(streak(0, 3)).toBe(1);
  });

  it("does not inflate the streak into pre-history (unconfirmed gap dropped)", () => {
    // A trailing miss with no older active day behind it is not counted.
    expect(streak(0, 1, 2)).toBe(3);
  });

  it("caps grace at ≤1 per rolling 7 days (every-other-day cannot game it)", () => {
    // today, gap, day-2, gap, day-4... — only the first gap is bridged,
    // the next gap (2 days later) is within spacing and stops the walk.
    expect(streak(0, 2, 4, 6)).toBe(3);
  });

  it("denies a second grace that is closer than the spacing window", () => {
    // gaps at offsets 3 and 9 (only 6 days apart) — the second is denied,
    // so the walk stops at the 9-offset gap. Active 0,1,2,4,5,6,7,8 = 8 days
    // plus the one bridged gap at offset 3 → span of 9.
    expect(streak(0, 1, 2, 4, 5, 6, 7, 8, 10, 11)).toBe(9);
  });

  it("allows a second grace once the spacing window has elapsed (≥7 apart)", () => {
    // gaps at offsets 3 and 10 (exactly 7 apart) — both bridged.
    // Active 0,1,2,4,5,6,7,8,9,11,12,13,14 = 13 days + 2 grace = 15.
    expect(streak(0, 1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14)).toBe(15);
  });

  it("grace applies regardless of whether the anchor is today or yesterday", () => {
    // today missing (anchor = yesterday), then an isolated gap at day-2.
    expect(streak(1, 3)).toBe(3);
  });
});

describe("computeStreakSpan — bridged-date reporting", () => {
  const span = (...offsets: number[]) =>
    computeStreakSpan(activeSet(...offsets), NOW);

  it("reports no bridged dates for an unbroken streak", () => {
    expect(span(0, 1, 2, 3).bridgedDates).toEqual([]);
  });

  it("reports the single bridged date (yesterday) when one was forgiven", () => {
    const result = span(0, 2);
    expect(result.streak).toBe(3);
    expect(result.bridgedDates).toEqual([dayKey(1)]);
  });

  it("does not report an unconfirmed trailing gap as bridged", () => {
    // miss at offset 1 with no confirming older active day → not bridged
    expect(span(0).bridgedDates).toEqual([]);
    expect(span(0, 1, 2).bridgedDates).toEqual([]);
  });

  it("reports two bridged dates when both gaps are far enough apart", () => {
    const result = span(0, 1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14);
    expect(result.streak).toBe(15);
    expect(result.bridgedDates).toEqual([dayKey(3), dayKey(10)]);
  });
});
