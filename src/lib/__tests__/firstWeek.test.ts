import { describe, it, expect } from "vitest";
import { firstWeek, type FirstWeekInput } from "../firstWeek";

// Friday 2 October 2026; the first recap comes Monday 5 October.
const base: FirstWeekInput = {
  startKey: "2026-10-02",
  todayKey: "2026-10-02",
  lifts: true,
  runs: true,
  workoutCount: 0,
  runCount: 0,
  mealCount: 0,
  weighInCount: 0,
  dismissed: false,
};

describe("firstWeek", () => {
  it("lists the first workout, run, meal and three weigh-ins on day one", () => {
    const w = firstWeek(base)!;
    expect(w.day).toBe(1);
    expect(w.items.map((i) => i.key)).toEqual([
      "workout",
      "run",
      "meal",
      "weigh-in",
    ]);
    expect(w.items.every((i) => !i.done)).toBe(true);
    expect(w.items[3].progress).toBe("0 of 3");
  });

  it("leaves out what the plan doesn't have", () => {
    const keys = firstWeek({ ...base, runs: false })!.items.map((i) => i.key);
    expect(keys).toEqual(["workout", "meal", "weigh-in"]);
    const runner = firstWeek({ ...base, lifts: false })!.items.map(
      (i) => i.key
    );
    expect(runner).toEqual(["run", "meal", "weigh-in"]);
  });

  it("ticks items as they happen, the weigh-ins at three", () => {
    const w = firstWeek({
      ...base,
      workoutCount: 1,
      mealCount: 4,
      weighInCount: 2,
    })!;
    expect(w.items.find((i) => i.key === "workout")!.done).toBe(true);
    expect(w.items.find((i) => i.key === "meal")!.done).toBe(true);
    const weigh = w.items.find((i) => i.key === "weigh-in")!;
    expect(weigh.done).toBe(false);
    expect(weigh.progress).toBe("2 of 3");
  });

  it("names the first recap only once something is logged, and only before it", () => {
    expect(firstWeek(base)!.recapKey).toBeNull();
    expect(firstWeek({ ...base, mealCount: 1 })!.recapKey).toBe("2026-10-05");
    expect(
      firstWeek({ ...base, mealCount: 1, todayKey: "2026-10-05" })!.recapKey
    ).toBeNull();
  });

  it("counts the days from the start, and goes after the seventh", () => {
    expect(firstWeek({ ...base, todayKey: "2026-10-08" })!.day).toBe(7);
    expect(firstWeek({ ...base, todayKey: "2026-10-09" })).toBeNull();
  });

  it("goes once every item is done, or once dismissed", () => {
    expect(
      firstWeek({
        ...base,
        workoutCount: 1,
        runCount: 1,
        mealCount: 1,
        weighInCount: 3,
      })
    ).toBeNull();
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
});
