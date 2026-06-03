import { describe, it, expect } from "vitest";
import {
  getActivationFraming,
  isWithinActivationWindow,
  ACTIVATION_WINDOW_DAYS,
  type ActivationFramingInput,
} from "../activationFraming";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-03T12:00:00Z");

function base(
  overrides: Partial<ActivationFramingInput> = {}
): ActivationFramingInput {
  return {
    createdAtMs: NOW - 2 * DAY, // 2 days old → within window
    nowMs: NOW,
    todayType: "rest",
    workoutCount: 0,
    runCount: 0,
    mealCount: 0,
    ...overrides,
  };
}

describe("isWithinActivationWindow", () => {
  it("true at day 0 and at the boundary, false past it and for future/null", () => {
    expect(isWithinActivationWindow(NOW, NOW)).toBe(true);
    expect(
      isWithinActivationWindow(NOW - ACTIVATION_WINDOW_DAYS * DAY, NOW)
    ).toBe(true);
    expect(
      isWithinActivationWindow(NOW - (ACTIVATION_WINDOW_DAYS + 1) * DAY, NOW)
    ).toBe(false);
    expect(isWithinActivationWindow(NOW + DAY, NOW)).toBe(false); // future skew
    expect(isWithinActivationWindow(null, NOW)).toBe(false);
  });
});

describe("getActivationFraming (#972) — day-type × domain matrix", () => {
  it("lift day, no workouts, within window → frames first workout only", () => {
    const f = getActivationFraming(base({ todayType: "lift" }));
    expect(f).toMatchObject({
      firstWorkout: true,
      firstRun: false,
      firstMeal: false,
    });
  });

  it("run day, no runs, within window → frames first run only", () => {
    const f = getActivationFraming(base({ todayType: "run" }));
    expect(f).toMatchObject({
      firstWorkout: false,
      firstRun: true,
      firstMeal: false,
    });
  });

  it("both day frames first workout AND first run", () => {
    const f = getActivationFraming(base({ todayType: "both" }));
    expect(f.firstWorkout).toBe(true);
    expect(f.firstRun).toBe(true);
    expect(f.firstMeal).toBe(false);
  });

  it("rest day, no meals, within window → shows first-meal card only", () => {
    const f = getActivationFraming(base({ todayType: "rest" }));
    expect(f).toMatchObject({
      firstWorkout: false,
      firstRun: false,
      firstMeal: true,
    });
  });

  it("per-domain independence: a lifter who never logged food still gets the rest-day meal nudge", () => {
    const f = getActivationFraming(
      base({ todayType: "rest", workoutCount: 40, runCount: 12, mealCount: 0 })
    );
    expect(f.firstMeal).toBe(true);
  });

  it("a domain with lifetime count > 0 is never framed as first", () => {
    expect(getActivationFraming(base({ todayType: "lift", workoutCount: 3 })).firstWorkout).toBe(false);
    expect(getActivationFraming(base({ todayType: "run", runCount: 1 })).firstRun).toBe(false);
    expect(getActivationFraming(base({ todayType: "rest", mealCount: 5 })).firstMeal).toBe(false);
  });

  it("past the 14-day window → nothing frames, regardless of empty domains", () => {
    const old = base({
      createdAtMs: NOW - 20 * DAY,
      todayType: "both",
      workoutCount: 0,
      runCount: 0,
      mealCount: 0,
    });
    const f = getActivationFraming(old);
    expect(f.withinWindow).toBe(false);
    expect(f.firstWorkout).toBe(false);
    expect(f.firstRun).toBe(false);
    expect(f.firstMeal).toBe(false);
  });

  it("null createdAt (sentinel not yet a Timestamp) → nothing frames", () => {
    const f = getActivationFraming(base({ createdAtMs: null, todayType: "lift" }));
    expect(f.firstWorkout).toBe(false);
  });

  it("rest-day meal framing does not fire on a lift/run/both day", () => {
    expect(getActivationFraming(base({ todayType: "lift" })).firstMeal).toBe(false);
    expect(getActivationFraming(base({ todayType: "run" })).firstMeal).toBe(false);
    expect(getActivationFraming(base({ todayType: "both" })).firstMeal).toBe(false);
  });
});
