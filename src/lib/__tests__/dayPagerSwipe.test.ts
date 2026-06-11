import { describe, it, expect } from "vitest";
import { resolveDayPagerDelta } from "../dayPagerSwipe";

/* The inner Programme day-pager maths, shared by the Lift + Run swipers.
   Pins the thresholds and the boundary clamp — the clamp is what lets the
   outer tab-swipe (useSwipeNavigation) take over at the ends. */

describe("resolveDayPagerDelta", () => {
  it("swipe left advances a day when not at the end", () => {
    expect(resolveDayPagerDelta(-80, 0, 1, 5)).toBe(1);
  });

  it("swipe right goes back a day when not at the start", () => {
    expect(resolveDayPagerDelta(80, 0, 1, 5)).toBe(-1);
  });

  it("returns 0 at the end on a left swipe (outer nav takes over)", () => {
    expect(resolveDayPagerDelta(-80, 0, 4, 5)).toBe(0);
  });

  it("returns 0 at the start on a right swipe (outer nav takes over)", () => {
    expect(resolveDayPagerDelta(80, 0, 0, 5)).toBe(0);
  });

  it("ignores a swipe below the 50px distance floor", () => {
    expect(resolveDayPagerDelta(-40, 0, 1, 5)).toBe(0);
  });

  it("ignores a mostly-vertical drag (direction-lock)", () => {
    // |dx| = 60 but |dy| = 60 → 60 <= 60 * 1.5, not horizontal enough
    expect(resolveDayPagerDelta(-60, 60, 1, 5)).toBe(0);
  });

  it("commits when horizontal dominates vertical", () => {
    // |dx| = 100, |dy| = 50 → 100 > 50 * 1.5
    expect(resolveDayPagerDelta(-100, 50, 1, 5)).toBe(1);
  });

  it("single-day / empty pager never advances (always at boundary)", () => {
    expect(resolveDayPagerDelta(-80, 0, 0, 1)).toBe(0);
    expect(resolveDayPagerDelta(80, 0, 0, 1)).toBe(0);
    expect(resolveDayPagerDelta(-80, 0, 0, 0)).toBe(0);
  });
});
