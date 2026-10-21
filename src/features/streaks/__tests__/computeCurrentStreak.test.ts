import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  computeStreakSpan,
  computeStreakSpanAnchored,
  computeStreakState,
} from "../useStreaks";

// Pinned "now" — mid-May is well clear of any DST transition in either
// hemisphere, so calendar-day offsets are stable in the test timezone.
const NOW = new Date("2026-05-15T12:00:00");

// offset 0 = today, 1 = yesterday, 2 = day-before, ...
const dayKey = (offset: number) =>
  format(new Date(NOW.getTime() - offset * 86400000), "yyyy-MM-dd");
const activeSet = (...offsets: number[]) => new Set(offsets.map(dayKey));
const streak = (...offsets: number[]) =>
  computeStreakSpan(activeSet(...offsets), NOW).streak;

describe("the streak walk — base behaviour", () => {
  it("returns 0 for an empty set", () => {
    expect(computeStreakSpan(new Set(), NOW).streak).toBe(0);
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

describe("the streak walk — grace forgiveness", () => {
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
    return computeStreakSpan(set, NOW).streak;
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
    // Today..day4 active, day5 missed (bridgeable), day6 = anchor day. The
    // days just before the anchor are in the window, as they are in the app
    // (the pair is saved on every visit): the walk checks them because its
    // own grace is within a week of the anchor.
    const set = new Set([
      key(0),
      key(1),
      key(2),
      key(3),
      key(4),
      ...Array.from({ length: 10 }, (_, i) => key(6 + i)),
    ]);
    const anchor = { streak: 100, lastActiveDate: key(6) };
    const span = computeStreakSpanAnchored(set, anchor, NOW);
    expect(span.streak).toBe(106); // 5 walked + 1 bridged + 100 certified
    expect(span.bridgedDates).toContain(key(5));
  });

  it("deleting the anchor day's only log keeps the certificate, one day shorter", () => {
    // 200 days saved through today, then today's one log deleted: the
    // window shows 90 days ending yesterday. The span still certifies 199
    // through yesterday; the plain walk alone reads 90, and the save would
    // store that over the 200.
    const set = new Set(Array.from({ length: 90 }, (_, i) => key(i + 1)));
    const anchor = { streak: 200, lastActiveDate: key(0) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(199);
    expect(computeStreakState(set, anchor, NOW).anchor).toEqual({
      streak: 199,
      lastActiveDate: key(1),
    });
  });

  it("deleting three days of logs still ends the streak", () => {
    // Three days of logs deleted: the span certifies 197 through key(3),
    // but today and the two days before are empty, so the streak is over.
    const set = new Set(Array.from({ length: 60 }, (_, i) => key(i + 3)));
    const anchor = { streak: 200, lastActiveDate: key(0) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(0);
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

describe("the anchor and the grace spacing", () => {
  /* The anchor certifies its own forgiven days against each other, not
     against one the walk has just spent. Credited at once, every-other-day
     logging with the pair written back each day added two days a day. */
  const NOW = new Date("2026-08-05T12:00:00");
  const key = (daysAgo: number) =>
    format(new Date(NOW.getTime() - daysAgo * 86_400_000), "yyyy-MM-dd");

  it("a forgiven day inside the anchored span, a few days behind this walk's, ends the chain", () => {
    // Active today, day 2, day 4, ... (every other day). The pair saved on
    // day 2 says 21. Today bridges yesterday; day 3 is a second miss two
    // days later, so the rule allows 3 (today, yesterday, day 2).
    const set = new Set(Array.from({ length: 21 }, (_, i) => key(i * 2)));
    const anchor = { streak: 21, lastActiveDate: key(2) };
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(3);
  });

  it("a forgiven day a week behind this walk's is the anchor's own, and holds", () => {
    // Today, yesterday missed, days 2..8 active, day 9 missed, then the
    // anchored span. Day 9 is 8 days behind yesterday: both forgiven.
    const set = new Set([
      key(0),
      ...Array.from({ length: 7 }, (_, i) => key(2 + i)),
      ...Array.from({ length: 30 }, (_, i) => key(10 + i)),
    ]);
    const anchor = { streak: 100, lastActiveDate: key(2) };
    // today + bridged yesterday + the certified 100 (which includes day 9).
    expect(computeStreakSpanAnchored(set, anchor, NOW).streak).toBe(102);
  });

  it("with no grace near it, the anchor is credited without the days behind it", () => {
    // The window can end right at the anchor then: nothing needs checking.
    const set = new Set([key(0), key(1), key(2)]);
    expect(
      computeStreakSpanAnchored(
        set,
        { streak: 300, lastActiveDate: key(2) },
        NOW
      ).streak
    ).toBe(302);
  });
});

describe("computeStreakState — what is shown, what is savable, what is stored", () => {
  const NOW = new Date("2026-08-05T12:00:00");
  const key = (daysAgo: number) =>
    format(new Date(NOW.getTime() - daysAgo * 86_400_000), "yyyy-MM-dd");
  const days = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => key(from + i));

  it("the morning after a rest day: shows 0, keeps the 100-day certificate, 100 is savable", () => {
    // 100 days ending the day before yesterday; yesterday rested; today
    // nothing yet. Saving the 0 threw the certificate away, so the evening's
    // log read only the window: 32 in the probe, for 102.
    const set = new Set(days(2, 40));
    const stored = { streak: 100, lastActiveDate: key(2) };
    const morning = computeStreakState(set, stored, NOW);
    expect(morning.live.streak).toBe(0);
    expect(morning.savable).toBe(100);
    expect(morning.anchor).toEqual(stored);
    // The evening's log, walked from what the morning stored.
    const evening = computeStreakState(
      new Set([key(0), ...set]),
      morning.anchor,
      NOW
    );
    expect(evening.live.streak).toBe(102);
    expect(evening.anchor).toEqual({ streak: 102, lastActiveDate: key(0) });
  });

  it("backfilling yesterday stores the span it counts, so today's log reads 102, not 103", () => {
    const stored = { streak: 100, lastActiveDate: key(2) };
    // This morning: yesterday backfilled. The streak ends yesterday.
    const backfilled = computeStreakState(new Set(days(1, 40)), stored, NOW);
    expect(backfilled.live.streak).toBe(101);
    expect(backfilled.anchor).toEqual({ streak: 101, lastActiveDate: key(1) });
    // Saved against the day before (101 through day 2), today's log read 103.
    const logged = computeStreakState(
      new Set(days(0, 40)),
      backfilled.anchor,
      NOW
    );
    expect(logged.live.streak).toBe(102);
  });

  it("a broken streak leaves the stored pair alone and has nothing savable", () => {
    const set = new Set(days(3, 40));
    const state = computeStreakState(
      set,
      { streak: 100, lastActiveDate: key(3) },
      NOW
    );
    expect(state.live.streak).toBe(0);
    expect(state.savable).toBe(0);
    expect(state.anchor).toBeNull();
  });

  it("a live streak is its own savable count, stored with the day it ends", () => {
    const state = computeStreakState(new Set(days(1, 10)), null, NOW);
    expect(state.live.streak).toBe(10);
    expect(state.savable).toBe(10);
    expect(state.anchor).toEqual({ streak: 10, lastActiveDate: key(1) });
  });
});
