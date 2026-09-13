import { describe, expect, it } from "vitest";
import { nonRaceGoalProgress, isNonRaceGoal } from "../nonRaceGoal";
import type { RunSummaryItem } from "@/hooks/useRunningStats";

const run = (
  id: string,
  day: number,
  extra: Partial<RunSummaryItem> = {}
): RunSummaryItem => ({
  id,
  distance: 5000,
  duration: 1800,
  completedAt: new Date(2026, 8, day, 10),
  avgPace: 360,
  elevationGain: 0,
  calories: 0,
  activityType: "run",
  relativeEffort: null,
  ...extra,
});
describe("weekly free-running goals", () => {
  it("counts eligible actual runs once within the local Monday–Sunday week", () => {
    const runs = [
      run("sun", 6),
      run("mon", 7),
      run("manual", 13, { activityType: "manual" }),
      run("manual", 13),
      run("future", 14),
      run("invalid", 12, { isInvalid: true }),
      run("bad", 12, { duration: Infinity }),
    ];
    expect(
      nonRaceGoalProgress(
        { kind: "runs", target: 3 },
        runs,
        new Date(2026, 8, 13, 12)
      )
    ).toEqual({ current: 2, target: 3, complete: false });
    expect(
      nonRaceGoalProgress(
        { kind: "minutes", target: 60 },
        runs,
        new Date(2026, 8, 13, 12)
      )
    ).toEqual({ current: 60, target: 60, complete: true });
    expect(
      nonRaceGoalProgress(
        { kind: "runs", target: 3 },
        runs,
        new Date(2026, 8, 14, 9)
      ).current
    ).toBe(0);
  });
  it("reflects corrections and removals without a separate counter", () => {
    const goal = { kind: "minutes" as const, target: 60 };
    const now = new Date(2026, 8, 13, 12);
    expect(
      nonRaceGoalProgress(goal, [run("one", 13, { duration: 3600 })], now)
        .complete
    ).toBe(true);
    expect(
      nonRaceGoalProgress(goal, [run("one", 13, { duration: 1200 })], now)
        .current
    ).toBe(20);
    expect(nonRaceGoalProgress(goal, [], now).current).toBe(0);
  });
  it.each([
    { kind: "runs", target: 0 },
    { kind: "runs", target: 8 },
    { kind: "minutes", target: 9 },
    { kind: "minutes", target: Infinity },
    { kind: "race", target: 3 },
    null,
  ])("rejects invalid target %#", (value) =>
    expect(isNonRaceGoal(value)).toBe(false)
  );
});
