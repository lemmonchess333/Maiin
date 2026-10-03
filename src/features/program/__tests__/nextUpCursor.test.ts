/**
 * The next-up cursor, as one table. Train, Home's today, tomorrow and
 * rest-day cards and the finish screen all read it, so a case here is a
 * case on every one of them.
 */
import { describe, it, expect } from "vitest";
import { nextUpIndex } from "../nextUpCursor";
import type { WorkoutDay } from "../programTypes";

const day = (flags: "" | "done" | "skipped" = ""): WorkoutDay => ({
  dayName: "Day",
  dayType: "full",
  exercises: [],
  completed: flags === "done",
  ...(flags === "skipped" ? { skipped: true } : {}),
});

describe("nextUpIndex", () => {
  const cases: {
    name: string;
    workouts: WorkoutDay[];
    chosen?: number;
    passing?: number;
    next: number;
  }[] = [
    {
      name: "a fresh week starts at the first",
      workouts: [day(), day(), day()],
      next: 0,
    },
    {
      name: "a done workout is passed",
      workouts: [day("done"), day(), day()],
      next: 1,
    },
    {
      name: "a skipped workout is passed",
      workouts: [day("skipped"), day(), day()],
      next: 1,
    },
    {
      name: "the order holds over a gap",
      workouts: [day("done"), day("skipped"), day()],
      next: 2,
    },
    {
      name: "a week all done or skipped has none",
      workouts: [day("done"), day("skipped")],
      next: -1,
    },
    { name: "an empty programme has none", workouts: [], next: -1 },
    {
      name: "a chosen workout comes first",
      workouts: [day(), day(), day()],
      chosen: 2,
      next: 2,
    },
    {
      name: "a chosen workout since done falls back to the order",
      workouts: [day(), day(), day("done")],
      chosen: 2,
      next: 0,
    },
    {
      name: "a chosen workout since skipped falls back to the order",
      workouts: [day(), day("skipped"), day()],
      chosen: 1,
      next: 0,
    },
    {
      name: "a choice that names no workout falls back to the order",
      workouts: [day(), day()],
      chosen: 5,
      next: 0,
    },
    {
      name: "a passed workout is not next",
      workouts: [day(), day(), day()],
      passing: 0,
      next: 1,
    },
    {
      name: "a passed chosen workout gives way to the order",
      workouts: [day(), day(), day()],
      chosen: 1,
      passing: 1,
      next: 0,
    },
    {
      name: "a chosen workout holds while another is passed",
      workouts: [day(), day(), day()],
      chosen: 2,
      passing: 0,
      next: 2,
    },
    {
      name: "passing the last to do leaves none",
      workouts: [day("done"), day()],
      passing: 1,
      next: -1,
    },
  ];

  it.each(cases)("$name", ({ workouts, chosen, passing, next }) => {
    expect(
      nextUpIndex(
        {
          workouts,
          ...(chosen === undefined ? {} : { nextWorkoutOverride: chosen }),
        },
        passing
      )
    ).toBe(next);
  });

  it("has none without a programme", () => {
    expect(nextUpIndex(null)).toBe(-1);
    expect(nextUpIndex(undefined)).toBe(-1);
  });
});
