import { describe, it, expect } from "vitest";
import { recentRunningContext } from "../recentRunningContext";
import type { RunSummaryItem } from "@/hooks/useRunningStats";

const now = new Date(2026, 8, 13, 12);
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

describe("recorded running context", () => {
  it("uses four complete rolling windows, including the oldest local day", () => {
    const result = recentRunningContext(
      [run("today", 13), run("lastweek", 6), run("oldest", -14)],
      now
    );
    expect(result).toEqual({
      count: 3,
      activeWeeks: 3,
      averageWeeklyMinutes: 22.5,
      longestMinutes: 30,
      latestDate: "2026-09-13",
    });
  });
  it("keeps eligible manual/treadmill workload, ignores future, invalid and duplicate records", () => {
    const result = recentRunningContext(
      [
        run("manual", 13, { activityType: "manual" }),
        run("treadmill", 12, { activityType: "treadmill", duration: 2400 }),
        run("manual", 13),
        run("future", 14),
        run("flagged", 11, { savedAnyway: true }),
        run("bad-gps", 10, { isInvalid: true }),
        run("infinite", 9, { duration: Infinity }),
        run("bad-date", 8, { completedAt: new Date(NaN) }),
        run("outside", -15),
      ],
      now
    );
    expect(result.count).toBe(2);
    expect(result.averageWeeklyMinutes).toBe(17.5);
    expect(result.longestMinutes).toBe(40);
  });
  it("has no latest date when nothing eligible is recorded", () => {
    expect(recentRunningContext([], now)).toEqual({
      count: 0,
      activeWeeks: 0,
      averageWeeklyMinutes: 0,
      longestMinutes: 0,
      latestDate: null,
    });
  });
});
