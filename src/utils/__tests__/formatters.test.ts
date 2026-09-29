import { describe, it, expect } from "vitest";
import {
  formatVolume,
  formatDistance,
  abbreviateK,
  percentagesSummingTo100,
  formatDayMonth,
  formatDayMonthYear,
  formatClock,
  formatLoadKg,
  keepTogether,
} from "../formatters";

describe("formatVolume", () => {
  it("returns dash for zero", () => {
    expect(formatVolume(0)).toEqual({ value: "\u2014", unit: "" });
  });

  it("returns dash for negative", () => {
    expect(formatVolume(-100)).toEqual({ value: "\u2014", unit: "" });
  });

  it("formats sub-1000 with kg unit", () => {
    expect(formatVolume(500)).toEqual({ value: "500", unit: "kg" });
  });

  it("rounds sub-1000 values", () => {
    expect(formatVolume(892.7)).toEqual({ value: "893", unit: "kg" });
  });

  it("formats 1000+ with k suffix and kg unit", () => {
    expect(formatVolume(1000)).toEqual({ value: "1.0k", unit: "kg" });
  });

  it("formats 1500 as 1.5k", () => {
    expect(formatVolume(1500)).toEqual({ value: "1.5k", unit: "kg" });
  });

  it("formats large volumes", () => {
    expect(formatVolume(14020)).toEqual({ value: "14.0k", unit: "kg" });
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

describe("formatLoadKg (moved out of the pages, 2026-09)", () => {
  it("load: BW for bodyweight, whole or one-decimal kg otherwise", () => {
    expect(formatLoadKg(0)).toBe("BW");
    expect(formatLoadKg(60)).toBe("60 kg");
    expect(formatLoadKg(62.5)).toBe("62.5 kg");
  });
});
