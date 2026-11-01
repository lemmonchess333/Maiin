import { describe, expect, it } from "vitest";
import {
  goalDayName,
  goalDayQuestion,
  raceGoalEntry,
  RACE_GOAL_ENTRY_OPTIONS,
} from "../raceGoalEntry";

/* Run9 STATUS 2026-11-01: a distance goal is a race entered or run on
   your own; the plan is the same, the last day's name is not. */
describe("a race entered, or on your own", () => {
  it("reads a goal from before the question as a race", () => {
    expect(raceGoalEntry({ distance: "10k" })).toBe("race");
    expect(raceGoalEntry(null)).toBe("race");
    expect(raceGoalEntry({ distance: "10k", entry: "own" })).toBe("own");
  });

  it("names a race's day Race day, and a goal on your own by its distance", () => {
    expect(goalDayName({ distance: "10k", entry: "race" })).toBe("Race day");
    expect(goalDayName({ distance: "10k" })).toBe("Race day");
    expect(goalDayName({ distance: "5k", entry: "own" })).toBe("Your 5K");
    expect(goalDayName({ distance: "10k", entry: "own" })).toBe("Your 10K");
    expect(goalDayName({ distance: "half", entry: "own" })).toBe(
      "Your half marathon"
    );
    expect(goalDayName({ distance: "marathon", entry: "own" })).toBe(
      "Your marathon"
    );
  });

  it("asks after it the same way", () => {
    expect(goalDayQuestion({ distance: "10k" })).toBe("Did you race?");
    expect(goalDayQuestion({ distance: "10k", entry: "own" })).toBe(
      "Ran your 10K?"
    );
  });

  it("offers the race first, then on your own", () => {
    expect(RACE_GOAL_ENTRY_OPTIONS.map((o) => o.label)).toEqual([
      "A race I've entered",
      "On my own",
    ]);
  });
});
