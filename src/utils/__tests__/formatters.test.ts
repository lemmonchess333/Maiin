import { describe, it, expect } from "vitest";
import {
  formatVolume,
  formatDistance,
  abbreviateK,
  percentagesSummingTo100,
  formatDayMonth,
  formatDayMonthYear,
  formatClock,
  formatTimeOfDay,
  keepTogether,
  formatDayMonthLong,
  formatDayMonthYearLong,
  formatWeekdayDayMonthYear,
  formatWeekday,
  formatMonth,
  formatMonthYear,
  formatShortWeekday,
  formatDuration,
  formatSigned,
  withSign,
} from "../formatters";

describe("formatVolume", () => {
  it("returns dash for zero", () => {
    expect(formatVolume(0, "kg")).toEqual({ value: "\u2014", unit: "" });
  });

  it("returns dash for negative", () => {
    expect(formatVolume(-100, "kg")).toEqual({ value: "\u2014", unit: "" });
  });

  it("formats sub-1000 with kg unit", () => {
    expect(formatVolume(500, "kg")).toEqual({ value: "500", unit: "kg" });
  });

  it("rounds sub-1000 values", () => {
    expect(formatVolume(892.7, "kg")).toEqual({ value: "893", unit: "kg" });
  });

  it("formats 1000+ with k suffix and kg unit", () => {
    expect(formatVolume(1000, "kg")).toEqual({ value: "1.0k", unit: "kg" });
  });

  it("formats 1500 as 1.5k", () => {
    expect(formatVolume(1500, "kg")).toEqual({ value: "1.5k", unit: "kg" });
  });

  it("formats large volumes", () => {
    expect(formatVolume(14020, "kg")).toEqual({ value: "14.0k", unit: "kg" });
  });

  it("formats a lifetime's volume in millions, never as thousands of k", () => {
    expect(formatVolume(999_900, "kg")).toEqual({
      value: "999.9k",
      unit: "kg",
    });
    expect(formatVolume(999_960, "kg")).toEqual({ value: "1.0M", unit: "kg" });
    expect(formatVolume(1_500_000, "kg")).toEqual({
      value: "1.5M",
      unit: "kg",
    });
    expect(formatVolume(12_345_600, "kg")).toEqual({
      value: "12.3M",
      unit: "kg",
    });
  });

  it("reads in lb for a lifter who lifts in lb (Lift18)", () => {
    expect(formatVolume(100, "lbs")).toEqual({ value: "220", unit: "lb" });
    expect(formatVolume(1000, "lbs")).toEqual({ value: "2.2k", unit: "lb" });
  });
});

describe("formatDistance", () => {
  it("returns dash for zero", () => {
    expect(formatDistance(0)).toBe("\u2014");
  });

  it("returns dash for null", () => {
    expect(formatDistance(null)).toBe("\u2014");
  });

  it("returns dash for undefined", () => {
    expect(formatDistance(undefined)).toBe("\u2014");
  });

  it("returns dash for negative", () => {
    expect(formatDistance(-1)).toBe("\u2014");
  });

  it("formats positive distance to 1 decimal", () => {
    expect(formatDistance(5.234)).toBe("5.2");
  });

  it("formats exact km", () => {
    expect(formatDistance(10)).toBe("10.0");
  });
});

describe("abbreviateK", () => {
  it("keeps sub-1000 values whole and abbreviates past 1000 at ONE decimal", () => {
    expect(abbreviateK(500)).toBe("500");
    expect(abbreviateK(999)).toBe("999");
    expect(abbreviateK(1000)).toBe("1.0k");
    // The drift this kills: VolumeChart's axis rounded 1500 to "2k"
    // while its own tooltip said "1.5k" for the same value.
    expect(abbreviateK(1500)).toBe("1.5k");
    expect(abbreviateK(12345)).toBe("12.3k");
  });

  it("rounds sub-1000 values and survives non-finite input", () => {
    expect(abbreviateK(499.6)).toBe("500");
    expect(abbreviateK(NaN)).toBe("0");
    expect(abbreviateK(Infinity)).toBe("0");
  });
});

describe("percentagesSummingTo100", () => {
  it("always sums to exactly 100 (largest-remainder)", () => {
    // Independent rounding gives 33+33+33 = 99 here.
    expect(percentagesSummingTo100([33.3, 33.3, 33.4])).toEqual([33, 33, 34]);
    // And 34+33+34 = 101 here (0.335/0.33/0.335 of the total).
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(percentagesSummingTo100([335, 330, 335]))).toBe(100);
    expect(sum(percentagesSummingTo100([1, 1, 1, 1, 1, 1, 1]))).toBe(100);
  });

  it("gives the extra point to the largest fractional remainder", () => {
    expect(percentagesSummingTo100([50, 25, 25])).toEqual([50, 25, 25]);
    expect(percentagesSummingTo100([2, 1])).toEqual([67, 33]);
  });

  it("zero/empty totals return all zeros", () => {
    expect(percentagesSummingTo100([0, 0, 0])).toEqual([0, 0, 0]);
    expect(percentagesSummingTo100([])).toEqual([]);
  });
});

describe("formatDayMonth / formatDayMonthYear", () => {
  it("renders en-GB day + short month with no leading zero", () => {
    expect(formatDayMonth(new Date("2026-03-20T12:00:00"))).toBe("20 Mar");
    expect(formatDayMonth(new Date("2026-01-05T12:00:00"))).toBe("5 Jan");
  });

  it("year variant appends the year", () => {
    expect(formatDayMonthYear(new Date("2026-03-20T12:00:00"))).toBe(
      "20 Mar 2026"
    );
  });

  it("both variants agree on the day+month prefix", () => {
    const d = new Date("2026-12-31T12:00:00");
    expect(formatDayMonthYear(d).startsWith(formatDayMonth(d))).toBe(true);
  });
});

describe("formatTimeOfDay (the one clock time of day, 24-hour)", () => {
  /* Local-time constructors, read back in local time: the same on every
     runner's zone and locale (CI runs Kiritimati, Midway, Auckland, de-DE
     and fr-FR). No date here sits on a DST change. */
  const at = (h: number, m: number, s = 0) => new Date(2026, 0, 15, h, m, s);

  it("reads 24-hour with the hour zero-padded", () => {
    expect(formatTimeOfDay(at(7, 10))).toBe("07:10");
    expect(formatTimeOfDay(at(13, 13))).toBe("13:13");
    expect(formatTimeOfDay(at(19, 42))).toBe("19:42");
  });

  it("runs from 00:00 to 23:59", () => {
    expect(formatTimeOfDay(at(0, 0))).toBe("00:00");
    expect(formatTimeOfDay(at(0, 5))).toBe("00:05");
    expect(formatTimeOfDay(at(12, 0))).toBe("12:00");
    expect(formatTimeOfDay(at(23, 59))).toBe("23:59");
  });

  it("drops the seconds rather than rounding them up", () => {
    expect(formatTimeOfDay(at(13, 13, 59))).toBe("13:13");
  });
});

describe("keepTogether", () => {
  it("makes every space non-breaking, and nothing else", () => {
    expect(keepTogether("target 180 g")).toBe("target\u00A0180\u00A0g");
    expect(keepTogether("30 Aug")).toBe("30\u00A0Aug");
    expect(keepTogether("2,350")).toBe("2,350");
  });
});

describe("formatClock (the one m:ss / h:mm:ss formatter — twelve local copies retired)", () => {
  it("reads m:ss below an hour and h:mm:ss from an hour", () => {
    expect(formatClock(8)).toBe("0:08");
    expect(formatClock(72)).toBe("1:12");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("rounds to the nearest second and never goes negative", () => {
    expect(formatClock(59.6)).toBe("1:00");
    expect(formatClock(59.4)).toBe("0:59");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("the long date forms", () => {
  const d = new Date("2026-08-22T12:00:00");

  it("write the month in full, day first", () => {
    expect(formatDayMonthLong(d)).toBe("22 August");
    expect(formatDayMonthYearLong(d)).toBe("22 August 2026");
  });

  it("put the year after the weekday form with no comma", () => {
    expect(formatWeekdayDayMonthYear(d)).toBe("Saturday 22 August 2026");
  });

  it("name the weekday and the month alone, in full", () => {
    expect(formatWeekday(d)).toBe("Saturday");
    expect(formatMonth(d)).toBe("August");
  });

  it("write a short weekday, and a month with its year", () => {
    expect(formatShortWeekday(d)).toBe("Sat");
    expect(formatMonthYear(d)).toBe("August 2026");
  });
});

describe("withSign / formatSigned (the true minus)", () => {
  it("writes U+2212 for a negative and + for a positive", () => {
    expect(formatSigned(-0.27, 2)).toBe("\u22120.27");
    expect(formatSigned(0.25, 2)).toBe("+0.25");
    expect(formatSigned(-3)).toBe("\u22123");
    expect(formatSigned(-3)).not.toMatch(/-/);
  });

  it("gives no sign to a figure that reads as zero", () => {
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(-0.001, 2)).toBe("0.00");
    expect(withSign(-0.2, "0")).toBe("0");
  });

  it("signs a size already written for the reader", () => {
    expect(withSign(-2400, (2400).toLocaleString())).toBe(
      `\u2212${(2400).toLocaleString()}`
    );
    expect(withSign(1.5, "1.5")).toBe("+1.5");
  });
});

describe("formatDuration (a span in words, units spaced)", () => {
  it("rounds to the minute by default", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(634)).toBe("11 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3900)).toBe("1 h 5 min");
    expect(formatDuration(3599)).toBe("1 h");
  });

  it("keeps the part minute when asked", () => {
    expect(formatDuration(90, { seconds: true })).toBe("1 min 30 s");
    expect(formatDuration(180, { seconds: true })).toBe("3 min");
    expect(formatDuration(30, { seconds: true })).toBe("30 s");
    expect(formatDuration(3725, { seconds: true })).toBe("1 h 2 min 5 s");
  });

  it("never glues a unit or reads as a clock", () => {
    for (const s of [5, 59, 60, 61, 125, 3600, 3661, 7322])
      for (const seconds of [false, true]) {
        const text = formatDuration(s, { seconds });
        expect(text, `${s}`).not.toMatch(/\d[hms]|\d:\d/);
      }
  });
});
