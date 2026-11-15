import { describe, it, expect } from "vitest";
import {
  firstWeek,
  isFirstWeekWorkoutEligible,
  type FirstWeekInput,
} from "../firstWeek";

// Friday 2 October 2026, the day the plan was set up.
const base: FirstWeekInput = {
  startKey: "2026-10-02",
  todayKey: "2026-10-02",
  lifts: true,
  runs: true,
  workoutCount: 0,
  runCount: 0,
  dismissed: false,
};

describe("firstWeek", () => {
  it("lists the first workout and the first run on day one, and nothing else", () => {
    const w = firstWeek(base)!;
    expect(w.day).toBe(1);
    expect(w.items.map((i) => i.key)).toEqual(["workout", "run"]);
    expect(w.items.map((i) => i.label)).toEqual([
      "Finish your first workout",
      "Go for your first run",
    ]);
    expect(w.items.every((i) => !i.done)).toBe(true);
  });

  it("leaves out what the plan doesn't have", () => {
    const keys = firstWeek({ ...base, runs: false })!.items.map((i) => i.key);
    expect(keys).toEqual(["workout"]);
    const runner = firstWeek({ ...base, lifts: false })!.items.map(
      (i) => i.key
    );
    expect(runner).toEqual(["run"]);
    expect(firstWeek({ ...base, lifts: false, runs: false })).toBeNull();
  });

  it("ticks items as they happen", () => {
    const w = firstWeek({ ...base, workoutCount: 1 })!;
    expect(w.items.find((i) => i.key === "workout")!.done).toBe(true);
    expect(w.items.find((i) => i.key === "run")!.done).toBe(false);
  });

  it("counts the days from the start, and goes after the seventh", () => {
    expect(firstWeek({ ...base, todayKey: "2026-10-08" })!.day).toBe(7);
    expect(firstWeek({ ...base, todayKey: "2026-10-09" })).toBeNull();
  });

  it("goes once every item is done, or once dismissed", () => {
    expect(firstWeek({ ...base, workoutCount: 1, runCount: 1 })).toBeNull();
    expect(firstWeek({ ...base, dismissed: true })).toBeNull();
  });

  it("waits for a known start day", () => {
    expect(firstWeek({ ...base, startKey: null })).toBeNull();
  });

  it("counts a day across a clock change as one day", () => {
    // Auckland's clocks go forward on 27 September 2026.
    expect(
      firstWeek({ ...base, startKey: "2026-09-26", todayKey: "2026-09-28" })!
        .day
    ).toBe(3);
  });

  it("puts the only incomplete sport or resumable sport first", () => {
    expect(
      firstWeek({ ...base, workoutCount: 1 })!.items.map((item) => item.key)
    ).toEqual(["run", "workout"]);
    expect(
      firstWeek({ ...base, priorityTask: "run" })!.items.map((item) => item.key)
    ).toEqual(["run", "workout"]);
  });

  it("does not tick a workout for a session without performed work", () => {
    const eligible = (exercises: unknown) =>
      isFirstWeekWorkoutEligible({ exercises } as never);
    expect(eligible([])).toBe(false);
    expect(eligible([{ sets: [{ reps: 0 }] }])).toBe(false);
    expect(eligible([{ sets: [{ reps: 8 }] }])).toBe(true);
    expect(eligible([{ repUnit: "seconds", sets: [{ reps: 30 }] }])).toBe(true);
    expect(
      eligible([{ repUnit: "seconds", durationMinutes: 3, sets: [] }])
    ).toBe(true);
    expect(eligible([{ durationMinutes: 3, sets: [] }])).toBe(false);
  });
});
