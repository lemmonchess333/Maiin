import { describe, expect, it } from "vitest";
import { previewWeekLayout } from "../weekReset";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const current: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "rest" },
  { day: 3, type: "lift" },
  { day: 4, type: "run" },
  { day: 5, type: "lift" },
  { day: 6, type: "both" },
];

describe("guided usual-week preview", () => {
  it("shows changed weekdays in Monday order and counts both sports on Both days", () => {
    const next = current.map((item) => ({ ...item }));
    next[0].type = "run";
    next[2].type = "lift";
    next[6].type = "rest";
    expect(previewWeekLayout(current, next)).toEqual({
      before: { lifts: 4, runs: 2 },
      after: { lifts: 4, runs: 2 },
      changes: [
        { day: 2, before: "rest", after: "lift" },
        { day: 6, before: "both", after: "rest" },
        { day: 0, before: "rest", after: "run" },
      ],
      rebuildsLifts: false,
    });
  });

  it("flags a lift-count change for the separate rebuild confirmation", () => {
    const next = current.map((item) => ({ ...item }));
    next[2].type = "lift";
    expect(previewWeekLayout(current, next)).toMatchObject({
      before: { lifts: 4, runs: 2 },
      after: { lifts: 5, runs: 2 },
      rebuildsLifts: true,
    });
  });

  it("does not promise a rebuild confirmation when removing every lift day", () => {
    const next = current.map((item) => ({
      ...item,
      type:
        item.type === "lift" || item.type === "both"
          ? ("rest" as const)
          : item.type,
    }));
    expect(previewWeekLayout(current, next)).toMatchObject({
      after: { lifts: 0 },
      rebuildsLifts: false,
    });
  });

  it("refuses an incomplete or duplicated weekday schedule", () => {
    expect(previewWeekLayout(current, current.slice(1))).toBeNull();
    const duplicate = current.map((item) => ({ ...item }));
    duplicate[0].day = 1;
    expect(previewWeekLayout(current, duplicate)).toBeNull();
  });
});
