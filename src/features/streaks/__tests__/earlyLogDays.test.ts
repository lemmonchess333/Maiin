import { describe, expect, it } from "vitest";
import {
  earlyDayOf,
  earlyDaysOf,
  keptEarlyDays,
  storedEarlyDays,
} from "../earlyLogDays";

describe("earlyDayOf", () => {
  it("names the local day of a log before 07:00, and nothing after", () => {
    expect(earlyDayOf(new Date(2026, 9, 21, 6, 59))).toBe("2026-10-21");
    expect(earlyDayOf(new Date(2026, 9, 21, 7, 0))).toBeNull();
    expect(earlyDayOf(null)).toBeNull();
    expect(earlyDayOf(new Date(Number.NaN))).toBeNull();
  });

  it("collects distinct days", () => {
    expect(
      earlyDaysOf([
        new Date(2026, 9, 21, 5, 0),
        new Date(2026, 9, 21, 6, 0),
        new Date(2026, 9, 22, 12, 0),
      ])
    ).toEqual(["2026-10-21"]);
  });
});

describe("storedEarlyDays", () => {
  it("tells a document without the field from one counted empty", () => {
    expect(storedEarlyDays(undefined)).toBeUndefined();
    expect(storedEarlyDays([])).toEqual([]);
    expect(storedEarlyDays(["2026-10-21", 7, "21/10", null])).toEqual([
      "2026-10-21",
    ]);
  });
});

describe("keptEarlyDays", () => {
  it("merges the sources and keeps the earliest five", () => {
    expect(
      keptEarlyDays(["2026-10-05", "2026-10-01"], null, [
        "2026-10-01",
        "2026-10-09",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
      ])
    ).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });
});
