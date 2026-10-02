import { describe, it, expect } from "vitest";
import {
  beforeStart,
  daysSinceStart,
  scheduledDaysSinceStart,
  startDayKey,
} from "../startDay";

const at = (y: number, m: number, d: number, h = 12) => ({
  toMillis: () => new Date(y, m - 1, d, h).getTime(),
});

describe("startDayKey", () => {
  it("is the local date the account began", () => {
    expect(startDayKey(at(2026, 10, 2, 23))).toBe("2026-10-02");
  });

  it("is unknown before the server timestamp lands", () => {
    // A serverTimestamp() sentinel has no toMillis.
    expect(startDayKey({})).toBeNull();
    expect(startDayKey(null)).toBeNull();
    expect(startDayKey(undefined)).toBeNull();
  });
});

describe("beforeStart", () => {
  it("is true only for days before the start day", () => {
    expect(beforeStart("2026-10-01", "2026-10-02")).toBe(true);
    expect(beforeStart("2026-10-02", "2026-10-02")).toBe(false);
    expect(beforeStart("2026-10-03", "2026-10-02")).toBe(false);
  });

  it("treats an unknown start as no limit", () => {
    expect(beforeStart("2020-01-01", null)).toBe(false);
  });
});

describe("scheduledDaysSinceStart", () => {
  // getDay numbering: 1 Monday … 5 Friday, 0 Sunday.
  const schedule = [
    { day: 1, type: "lift" },
    { day: 2, type: "lift" },
    { day: 3, type: "both" },
    { day: 4, type: "rest" },
    { day: 5, type: "lift" },
    { day: 6, type: "run" },
    { day: 0, type: "rest" },
  ];
  const lifts = ["lift", "both"];

  it("counts only the scheduled days on or after the start day", () => {
    expect(
      scheduledDaysSinceStart(schedule, lifts, "2026-09-28", "2026-10-02")
    ).toBe(1);
  });

  it("counts a Sunday as the week's last day, not its first", () => {
    const sunday = [{ day: 0, type: "lift" }];
    expect(
      scheduledDaysSinceStart(sunday, lifts, "2026-09-28", "2026-10-02")
    ).toBe(1);
  });

  it("counts the whole schedule in any later week", () => {
    expect(
      scheduledDaysSinceStart(schedule, lifts, "2026-10-05", "2026-10-02")
    ).toBe(4);
  });
});

describe("daysSinceStart", () => {
  it("counts the first day as one", () => {
    expect(daysSinceStart("2026-10-02", "2026-10-02")).toBe(1);
    expect(daysSinceStart("2026-10-02", "2026-10-09")).toBe(8);
    expect(daysSinceStart(null, "2026-10-09")).toBeNull();
  });
});
