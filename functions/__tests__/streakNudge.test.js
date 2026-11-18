/**
 * [push] functions/lib/streakNudge.js contract tests (#964, epic #961).
 * Pure eligibility predicate for the streak-at-risk push.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  savableStreak,
  keptToday,
  shouldSendStreakNudge,
  shouldSendFirstWeekNudge,
  localDateKeyInTz,
} from "../lib/streakNudge";

// 20:00 UTC on 2026-06-01 → still 2026-06-01 local in London (UTC+1) and LA (UTC-7).
const NOW = new Date("2026-06-01T20:00:00Z");

function base(over = {}) {
  return {
    currentStreak: 5,
    // The streak's last active day: yesterday, London time.
    lastActiveDate: "2026-05-31",
    remindersOptedIn: true,
    timezone: "Europe/London",
    activeDateKeys: [],
    lastNudgeDateKey: null,
    ...over,
  };
}

describe("shouldSendStreakNudge", () => {
  it("eligible base case → true", () => {
    expect(shouldSendStreakNudge(base(), NOW)).toBe(true);
  });

  it("not opted in → false", () => {
    expect(shouldSendStreakNudge(base({ remindersOptedIn: false }), NOW)).toBe(
      false
    );
  });

  it("streak below 2 → false (boundary: 1 no, 2 yes)", () => {
    expect(shouldSendStreakNudge(base({ currentStreak: 1 }), NOW)).toBe(false);
    expect(shouldSendStreakNudge(base({ currentStreak: 0 }), NOW)).toBe(false);
    expect(shouldSendStreakNudge(base({ currentStreak: 2 }), NOW)).toBe(true);
  });

  it("timezone null → false (skip-on-null invariant, no overnight pings)", () => {
    expect(shouldSendStreakNudge(base({ timezone: null }), NOW)).toBe(false);
  });

  it("invalid timezone → false", () => {
    expect(shouldSendStreakNudge(base({ timezone: "Not/AZone" }), NOW)).toBe(
      false
    );
  });

  it("already logged today → false (meal-only logger: today is in the active-date set)", () => {
    // The user logged only a meal today — present in streaks/data active set,
    // would be MISSED by lastActiveAt (workout/run only). Must NOT nudge.
    expect(
      shouldSendStreakNudge(base({ activeDateKeys: ["2026-06-01"] }), NOW)
    ).toBe(false);
  });

  it("already nudged today → false (≤1/day)", () => {
    expect(
      shouldSendStreakNudge(base({ lastNudgeDateKey: "2026-06-01" }), NOW)
    ).toBe(false);
  });

  it("logged/nudged on a DIFFERENT day does not block today", () => {
    expect(
      shouldSendStreakNudge(
        base({
          activeDateKeys: ["2026-05-31"],
          lastNudgeDateKey: "2026-05-30",
        }),
        NOW
      )
    ).toBe(true);
  });
});

// First-week return nudge (D-1 day-1→day-2 fix). NOW is 2026-06-01 local in
// London; "yesterday" is 2026-05-31.
function fwBase(over = {}) {
  return {
    currentStreak: 1,
    lastActiveDate: "2026-05-31",
    remindersOptedIn: true,
    timezone: "Europe/London",
    activeDateKeys: ["2026-05-31"], // logged yesterday, not today
    lastNudgeDateKey: null,
    firstWeekNudgeDateKey: null,
    ...over,
  };
}

describe("the streak a log today keeps", () => {
  /* The stored currentStreak is the streak as shown, and the morning after a
     rest day shows 0, so the nudge skipped the one evening it is for. Read
     on its own, a streak that died weeks ago was nudged every evening. */
  it("the evening after a rest day: the certificate through the day before → sent", () => {
    // Shown 0 since this morning; 100 days ended on 30 May; 31 May rested.
    const input = base({
      currentStreak: 0,
      lastActiveDate: "2026-05-30",
      anchorStreak: 100,
      anchorDate: "2026-05-30",
    });
    expect(savableStreak(input, NOW)).toBe(100);
    expect(shouldSendStreakNudge(input, NOW)).toBe(true);
  });

  it("a certificate ending yesterday is the ordinary evening", () => {
    const input = base({ anchorStreak: 12, anchorDate: "2026-05-31" });
    expect(savableStreak(input, NOW)).toBe(12);
  });

  it("a streak that ended three days ago is already broken → not sent", () => {
    for (const input of [
      base({ anchorStreak: 40, anchorDate: "2026-05-29" }),
      // A document from before the certificate: its pair, read the same way.
      base({ currentStreak: 40, lastActiveDate: "2026-05-20" }),
    ]) {
      expect(savableStreak(input, NOW)).toBe(0);
      expect(shouldSendStreakNudge(input, NOW)).toBe(false);
    }
  });

  it("an older document's pair stands in for the certificate", () => {
    expect(savableStreak(base(), NOW)).toBe(5);
    expect(
      savableStreak(
        base({ anchorStreak: Number.NaN, anchorDate: "2026-05-31" }),
        NOW
      )
    ).toBe(5);
  });

  it("the day is the user's local day, not UTC's", () => {
    // 01:30 UTC on 2 June is still 1 June in Los Angeles: yesterday there is
    // 31 May, so a streak ending 30 May is still savable.
    const late = new Date("2026-06-02T01:30:00Z");
    const input = base({
      timezone: "America/Los_Angeles",
      anchorStreak: 9,
      anchorDate: "2026-05-30",
    });
    expect(savableStreak(input, late)).toBe(9);
  });
});

describe("the plan's rest days keep the streak (App1 Q32)", () => {
  /* The app saves `keptThrough` with the certificate: the day the streak's
     span ends, then the plan's rest days straight after it. The server reads
     no plan; a rest day is a day the stored streak is kept through. NOW is
     Monday 1 June in London. */
  it("today is a rest day: kept, and neither nudge asks for a log", () => {
    // Lifted Saturday 30 May; Sunday and Monday are the plan's rest.
    const input = base({
      anchorStreak: 9,
      anchorDate: "2026-05-30",
      keptThrough: "2026-06-01",
    });
    expect(keptToday(input, NOW)).toBe(true);
    expect(savableStreak(input, NOW)).toBe(9);
    expect(shouldSendStreakNudge(input, NOW)).toBe(false);
    expect(
      shouldSendFirstWeekNudge(
        {
          ...fwBase(),
          anchorStreak: 1,
          anchorDate: "2026-05-31",
          keptThrough: "2026-06-02",
        },
        NOW
      )
    ).toBe(false);
  });

  it("the training day after a rest weekend: kept through yesterday, so sent", () => {
    // Lifted Friday 29 May; Saturday and Sunday rested; Monday lifts.
    const input = base({
      anchorStreak: 12,
      anchorDate: "2026-05-29",
      keptThrough: "2026-05-31",
    });
    expect(keptToday(input, NOW)).toBe(false);
    expect(savableStreak(input, NOW)).toBe(12);
    expect(shouldSendStreakNudge(input, NOW)).toBe(true);
    // Without the rest days the same certificate is three days gone.
    const { keptThrough: _ignored, ...withoutRest } = input;
    expect(savableStreak(withoutRest, NOW)).toBe(0);
  });

  it("a forecast older than the certificate is ignored", () => {
    // An older app saved a newer certificate and left the forecast behind.
    const input = base({
      anchorStreak: 4,
      anchorDate: "2026-05-31",
      keptThrough: "2026-05-20",
    });
    expect(savableStreak(input, NOW)).toBe(4);
    expect(keptToday(input, NOW)).toBe(false);
  });

  it("a malformed forecast is ignored", () => {
    const input = base({
      anchorStreak: 4,
      anchorDate: "2026-05-31",
      keptThrough: "soon",
    });
    expect(keptToday(input, NOW)).toBe(false);
    expect(shouldSendStreakNudge(input, NOW)).toBe(true);
  });
});

describe("the cron hands the certificate to the predicate", () => {
  // No test runs maybeSendStreakNudge; without the two fields the predicate
  // falls back to the shown streak and the morning-after evening is skipped.
  it("maybeSendStreakNudge passes the stored pair and the certificate", () => {
    const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("async function maybeSendStreakNudge"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    for (const field of [
      "lastActiveDate: streak.lastActiveDate",
      "anchorStreak: streak.anchorStreak",
      "anchorDate: streak.anchorDate",
      "keptThrough: streak.keptThrough",
    ]) {
      expect(fn).toContain(field);
    }
  });
});

describe("shouldSendFirstWeekNudge", () => {
  it("day-2 base case → true (logged yesterday, not today, streak 1, never sent)", () => {
    expect(shouldSendFirstWeekNudge(fwBase(), NOW)).toBe(true);
  });

  it("not opted in → false (consent gate is absolute)", () => {
    expect(
      shouldSendFirstWeekNudge(fwBase({ remindersOptedIn: false }), NOW)
    ).toBe(false);
  });

  it("already sent once → false forever (once-EVER marker, any date)", () => {
    expect(
      shouldSendFirstWeekNudge(
        fwBase({ firstWeekNudgeDateKey: "2026-01-15" }),
        NOW
      )
    ).toBe(false);
  });

  it("streak at/above the regular floor → false (disjoint with shouldSendStreakNudge)", () => {
    expect(shouldSendFirstWeekNudge(fwBase({ currentStreak: 2 }), NOW)).toBe(
      false
    );
    expect(shouldSendFirstWeekNudge(fwBase({ currentStreak: 5 }), NOW)).toBe(
      false
    );
  });

  it("streak 0 with a yesterday log still sends (grace/rounding can zero a 1-day streak)", () => {
    expect(shouldSendFirstWeekNudge(fwBase({ currentStreak: 0 }), NOW)).toBe(
      true
    );
  });

  it("timezone null/invalid → false (skip-on-null invariant)", () => {
    expect(shouldSendFirstWeekNudge(fwBase({ timezone: null }), NOW)).toBe(
      false
    );
    expect(
      shouldSendFirstWeekNudge(fwBase({ timezone: "Not/AZone" }), NOW)
    ).toBe(false);
  });

  it("already logged today → false (they came back on their own)", () => {
    expect(
      shouldSendFirstWeekNudge(
        fwBase({ activeDateKeys: ["2026-05-31", "2026-06-01"] }),
        NOW
      )
    ).toBe(false);
  });

  it("no log yesterday → false (never an acquisition ping)", () => {
    expect(shouldSendFirstWeekNudge(fwBase({ activeDateKeys: [] }), NOW)).toBe(
      false
    );
    // A log two days ago doesn't qualify either — the nudge is anchored to
    // the morning-after, not to "some past activity".
    expect(
      shouldSendFirstWeekNudge(fwBase({ activeDateKeys: ["2026-05-30"] }), NOW)
    ).toBe(false);
  });

  it("already nudged today (e.g. recap suppression marker) → false (≤1 push/day)", () => {
    expect(
      shouldSendFirstWeekNudge(fwBase({ lastNudgeDateKey: "2026-06-01" }), NOW)
    ).toBe(false);
  });

  it("is disjoint with the regular nudge on the same input", () => {
    // Below the floor: first-week may fire, regular never.
    expect(shouldSendStreakNudge(fwBase(), NOW)).toBe(false);
    // At/above the floor: regular may fire, first-week never.
    const above = fwBase({ currentStreak: 2 });
    expect(shouldSendFirstWeekNudge(above, NOW)).toBe(false);
    expect(shouldSendStreakNudge(above, NOW)).toBe(true);
  });
});

describe("localDateKeyInTz", () => {
  it("resolves the user's LOCAL day across the UTC date boundary", () => {
    // 02:00 UTC on 2026-06-01: still 2026-06-01 in London, but 2026-05-31 in LA.
    const earlyUtc = new Date("2026-06-01T02:00:00Z");
    expect(localDateKeyInTz(earlyUtc, "Europe/London")).toBe("2026-06-01");
    expect(localDateKeyInTz(earlyUtc, "America/Los_Angeles")).toBe(
      "2026-05-31"
    );
  });

  it("null/invalid timezone → null", () => {
    expect(localDateKeyInTz(NOW, null)).toBeNull();
    expect(localDateKeyInTz(NOW, "Bogus/Zone")).toBeNull();
  });
});
