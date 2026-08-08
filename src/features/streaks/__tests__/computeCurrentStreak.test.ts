import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  computeCurrentStreak,
  computeStreakSpan,
  computeStreakSpanAnchored,
} from "../useStreaks";

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

describe("backfill rescue mechanism (Tier B) — simulation property", () => {
  // The hook surfaces the backfill nudge by adding yesterday to the set and
  // re-running the engine. These assert the underlying property the nudge
  // relies on: backfilling yesterday revives an otherwise-broken streak.
  const withYesterday = (...offsets: number[]) => {
    const set = activeSet(...offsets);
    set.add(dayKey(1));
    return computeCurrentStreak(set, NOW);
  };

  it("is broken when the last active day is 2 days ago", () => {
    // today + yesterday both missed → anchor fails → 0
    expect(streak(2, 3, 4, 5)).toBe(0);
  });

  it("revives the streak when yesterday is backfilled", () => {
    // last active offset 2; logging yesterday re-anchors → 5-day span
    expect(withYesterday(2, 3, 4, 5)).toBe(5);
  });

  it("revives across a grace-bridgeable older gap (last active 3 days ago)", () => {
    // backfilling yesterday makes day-2 an isolated gap grace then bridges
    expect(withYesterday(3, 4, 5)).toBe(5);
  });

  it("does not revive when the gap is too large to bridge", () => {
    // last active offset 4: yesterday + day-2 + day-3 missed → grace can't
    // span two consecutive misses, so backfill yields a trivial streak
    expect(withYesterday(4, 5, 6)).toBeLessThan(3);
  });
});

describe("computeStreakSpanAnchored — long streaks survive a bounded window", () => {
  // Probe sweep 2026-08-05, verifier-confirmed: the meal window is
  // DOC-bounded (500 docs ≈ 167 days at 3 meals/day), and the windowed
  // recompute persisted its own truncation back — a meal-driven streak froze
  // at ~167 while the user kept logging daily, and the 365-day badge was
  // unreachable for any ≥2-meals/day logger. The persisted
  // {count, lastActiveDate} pair is the fix: a certificate for the days that
  // aged out of the window.
  const NOW = new Date("2026-08-05T12:00:00");
  const key = (daysAgo: number) =>
    format(new Date(NOW.getTime() - daysAgo * 86_400_000), "yyyy-MM-dd");
  /** An unbroken active set covering today .. daysAgo. */
  const activeBack = (daysAgo: number) =>
    new Set(Array.from({ length: daysAgo + 1 }, (_, i) => key(i)));

  it("THE FREEZE, healed: a 300-day streak survives a 30-day window", () => {
    // Window shows 31 unbroken days; the anchor certifies 270 more ending at
    // the window's oldest visible day. Pure walk: 31. Anchored: 300.
    const set = activeBack(30);
    const anchor = { streak: 270, lastActiveDate: key(30) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(300);
    // …and the day after another log, it advances by one (fixed-point + 1).
    const TOMORROW = new Date(NOW.getTime() + 86_400_000);
    const setTomorrow = new Set([
      ...activeBack(30),
      format(TOMORROW, "yyyy-MM-dd"),
    ]);
    expect(
      computeStreakSpanAnchored(
        setTomorrow,
        { streak: 300, lastActiveDate: key(0) },
        TOMORROW
      ).streak
    ).toBe(301);
  });

  it("the recompute is a fixed point of its own persist", () => {
    // Re-running with the anchor the recompute just wrote must return the
    // same number, or the memo↔subscription pair would oscillate.
    const set = activeBack(10);
    const first = computeStreakSpanAnchored(
      set,
      { streak: 200, lastActiveDate: key(10) },
      NOW
    ).streak;
    expect(first).toBe(210);
    expect(
      computeStreakSpanAnchored(
        set,
        { streak: first, lastActiveDate: key(0) },
        NOW
      ).streak
    ).toBe(210);
  });

  it("a broken chain ignores the anchor — no resurrection", () => {
    // Active today+yesterday, then a 5-day hole, then the anchor day. The
    // walk breaks before reaching it (grace can't bridge consecutive
    // misses), so the certified 200 stays dead.
    const set = new Set([key(0), key(1), key(7)]);
    const anchor = { streak: 200, lastActiveDate: key(7) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(2);
  });

  it("a stale-LOW anchor never truncates what the window can prove", () => {
    // The window shows 31 unbroken days but the anchor (written mid-freeze)
    // says only 5 ended three days ago. Anchored walk would stop early at
    // day 3 with 3 + 5 = 8; the pure walk proves 31. Max wins.
    const set = activeBack(30);
    const anchor = { streak: 5, lastActiveDate: key(3) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(31);
  });

  it("grace still bridges on the way to the anchor", () => {
    // Today..day4 active, day5 missed (bridgeable), day6 = anchor day.
    const set = new Set([key(0), key(1), key(2), key(3), key(4), key(6)]);
    const anchor = { streak: 100, lastActiveDate: key(6) };
    const span = computeStreakSpanAnchored(set, anchor, NOW);
    expect(span.streak).toBe(106); // 5 walked + 1 bridged + 100 certified
    expect(span.bridgedDates).toContain(key(5));
  });

  it("garbage anchors fall back to the pure walk", () => {
    const set = activeBack(3);
    for (const anchor of [
      null,
      { streak: 0, lastActiveDate: key(3) },
      { streak: Number.NaN, lastActiveDate: key(3) },
      { streak: 50, lastActiveDate: "not-a-date" },
      { streak: 50, lastActiveDate: key(20) }, // not in the active set
    ]) {
      expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(4);
    }
  });
});
