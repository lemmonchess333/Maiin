/**
 * [push] functions/lib/streakNudge.js contract tests (#964, epic #961).
 * Pure eligibility predicate for the streak-at-risk push.
 */
import { describe, it, expect } from "vitest";
import { shouldSendStreakNudge, localDateKeyInTz } from "../lib/streakNudge";

// 20:00 UTC on 2026-06-01 → still 2026-06-01 local in London (UTC+1) and LA (UTC-7).
const NOW = new Date("2026-06-01T20:00:00Z");

function base(over = {}) {
  return {
    currentStreak: 5,
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
