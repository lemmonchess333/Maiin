/**
 * Tests for `foodCelebration.ts` — the pure detection helpers that
 * gate the Food hero card's once-per-day streak celebration.
 *
 * Three contracts to pin:
 *   1. `allMacrosHit` — ≥ comparison (not within ±5%), AND of all
 *      three macros.
 *   2. `didJustCompleteAll` — fires only on the transition; prev not
 *      all-hit AND next all-hit. Idempotent: doesn't re-fire when
 *      both prev and next are already all-hit.
 *   3. `todayIsoDate` — local-time YYYY-MM-DD, used as the
 *      localStorage flag to dedupe celebrations per calendar day.
 */
import { describe, it, expect } from "vitest";
import {
  allMacrosHit,
  didJustCompleteAll,
  todayIsoDate,
} from "../foodCelebration";

const TARGETS = { protein: 150, carbs: 200, fat: 60 };

describe("allMacrosHit", () => {
  it("returns true when all three macros meet target", () => {
    expect(
      allMacrosHit({ protein: 150, carbs: 200, fat: 60 }, TARGETS),
    ).toBe(true);
  });

  it("returns true when all three exceed target", () => {
    expect(
      allMacrosHit({ protein: 200, carbs: 250, fat: 80 }, TARGETS),
    ).toBe(true);
  });

  it("returns false when any single macro is short", () => {
    expect(
      allMacrosHit({ protein: 149, carbs: 200, fat: 60 }, TARGETS),
    ).toBe(false);
    expect(
      allMacrosHit({ protein: 150, carbs: 199, fat: 60 }, TARGETS),
    ).toBe(false);
    expect(
      allMacrosHit({ protein: 150, carbs: 200, fat: 59 }, TARGETS),
    ).toBe(false);
  });

  it("returns false when all macros are short", () => {
    expect(
      allMacrosHit({ protein: 0, carbs: 0, fat: 0 }, TARGETS),
    ).toBe(false);
  });
});

describe("didJustCompleteAll", () => {
  it("fires when the latest log pushed the user from not-all-hit to all-hit", () => {
    const prev = { protein: 100, carbs: 200, fat: 60 };
    const next = { protein: 160, carbs: 200, fat: 60 };
    expect(didJustCompleteAll(prev, next, TARGETS)).toBe(true);
  });

  it("does NOT fire when prev was already all-hit (idempotent)", () => {
    /* The flag should only trigger the celebration once per
       crossing — re-evaluating after subsequent logs shouldn't
       re-trigger it. */
    const prev = { protein: 200, carbs: 200, fat: 60 };
    const next = { protein: 250, carbs: 250, fat: 80 };
    expect(didJustCompleteAll(prev, next, TARGETS)).toBe(false);
  });

  it("does NOT fire when next is still short", () => {
    const prev = { protein: 0, carbs: 0, fat: 0 };
    const next = { protein: 100, carbs: 100, fat: 30 };
    expect(didJustCompleteAll(prev, next, TARGETS)).toBe(false);
  });

  it("does NOT fire when only some macros crossed (partial completion)", () => {
    /* User hit protein with this log, but carbs is still short.
       Celebration waits for the full set. */
    const prev = { protein: 100, carbs: 100, fat: 60 };
    const next = { protein: 160, carbs: 100, fat: 60 };
    expect(didJustCompleteAll(prev, next, TARGETS)).toBe(false);
  });
});

describe("todayIsoDate", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("zero-pads single-digit months and days", () => {
    /* January 5th 2026 must be "2026-01-05", not "2026-1-5". Used
       as a localStorage key so string equality has to be exact. */
    const earlyJan = new Date(2026, 0, 5, 10, 0, 0);
    expect(todayIsoDate(earlyJan)).toBe("2026-01-05");
  });

  it("uses local time zones (not UTC)", () => {
    /* The flag dedupes per calendar day in the viewer's TZ — a
       celebration that fires at 11pm local should not re-fire at
       midnight local even if UTC just rolled over. */
    const localMidnight = new Date(2026, 6, 4, 0, 0, 0);
    expect(todayIsoDate(localMidnight)).toBe("2026-07-04");
  });

  it("formats end-of-year boundary correctly", () => {
    expect(todayIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "2026-12-31",
    );
  });
});
