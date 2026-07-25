/**
 * chartGranularity — Hist5c pin 7 contract tests.
 * Daily 1W/1M; weekly 3M; monthly 6M/1Y.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  granularityForRange,
  binKeyForDate,
  formatBinLabel,
} from "../chartGranularity";
import { parseLocalDate } from "../dateHelpers";

describe("granularityForRange", () => {
  it("returns daily for 1W (7 days)", () => {
    expect(granularityForRange(7)).toBe("daily");
  });

  it("returns daily for 1M (30 days)", () => {
    expect(granularityForRange(30)).toBe("daily");
  });

  it("returns weekly for 3M (90 days)", () => {
    expect(granularityForRange(90)).toBe("weekly");
  });

  it("returns monthly for 6M (180 days)", () => {
    expect(granularityForRange(180)).toBe("monthly");
  });

  it("returns monthly for 1Y (365 days)", () => {
    expect(granularityForRange(365)).toBe("monthly");
  });

  it("boundary at 30 days inclusive (daily)", () => {
    expect(granularityForRange(30)).toBe("daily");
    expect(granularityForRange(31)).toBe("weekly");
  });

  it("boundary at 90 days inclusive (weekly)", () => {
    expect(granularityForRange(90)).toBe("weekly");
    expect(granularityForRange(91)).toBe("monthly");
  });
});

describe("binKeyForDate", () => {
  it("daily bin returns the day itself", () => {
    const d = new Date("2026-05-21T10:00:00Z");
    expect(binKeyForDate(d, "daily")).toBe("2026-05-21");
  });

  it("weekly bin returns the Sunday of the week", () => {
    /* 2026-05-21 is a Thursday → previous Sunday is 2026-05-17. */
    const d = new Date("2026-05-21T10:00:00Z");
    expect(binKeyForDate(d, "weekly")).toBe("2026-05-17");
  });

  it("weekly bin: Sunday maps to itself", () => {
    const d = new Date("2026-05-17T10:00:00Z");
    expect(binKeyForDate(d, "weekly")).toBe("2026-05-17");
  });

  it("monthly bin returns the 1st of the month", () => {
    const d = new Date("2026-05-21T10:00:00Z");
    expect(binKeyForDate(d, "monthly")).toBe("2026-05-01");
  });

  it("monthly bin: 1st of month maps to itself", () => {
    const d = new Date("2026-05-01T10:00:00Z");
    expect(binKeyForDate(d, "monthly")).toBe("2026-05-01");
  });

  it("same input yields same key across granularities (idempotent)", () => {
    const d = new Date("2026-05-21T10:00:00Z");
    expect(binKeyForDate(new Date(d), "daily")).toBe(binKeyForDate(d, "daily"));
    expect(binKeyForDate(new Date(d), "weekly")).toBe(
      binKeyForDate(d, "weekly")
    );
    expect(binKeyForDate(new Date(d), "monthly")).toBe(
      binKeyForDate(d, "monthly")
    );
  });
});

/**
 * Zone regression (2026-07-25).
 *
 * `binKeyForDate` used to anchor to UTC, and History fed it two different
 * KINDS of Date: the data side parsed the local "YYYY-MM-DD" with
 * `new Date(s)` (UTC midnight), the axis side built a local wall-clock
 * cursor. Under UTC anchoring those agree only where the offset happens to
 * keep them on the same UTC day — so from UTC+10 the axis sat a full week
 * behind the data and the current week's sparkline bar read zero, forever,
 * for every user in Australia and New Zealand.
 *
 * These run the real matrix. Node re-reads `process.env.TZ` per Date
 * construction, so each zone is exercised for real rather than reasoned
 * about — a fixed-zone test would have passed before the fix, since CI
 * runs in UTC, which is precisely why this shipped.
 */
describe("binKeyForDate — timezone agreement", () => {
  const ZONES = [
    "UTC",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
    "Pacific/Kiritimati", // UTC+14, the extreme
  ];
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  /** History's data side: a local "YYYY-MM-DD" from a workout doc. */
  const dataKey = (day: string) => binKeyForDate(parseLocalDate(day), "weekly");
  /** History's axis side: a local wall-clock cursor moved to its Sunday. */
  const axisKey = (now: Date) => {
    const cursor = new Date(now);
    cursor.setDate(cursor.getDate() - cursor.getDay());
    return binKeyForDate(cursor, "weekly");
  };

  for (const zone of ZONES) {
    it(`data and axis agree in ${zone}`, () => {
      process.env.TZ = zone;
      // Sunday 5 Jul 2026, 09:00 local — a session logged "today".
      expect(axisKey(new Date(2026, 6, 5, 9, 0))).toBe(dataKey("2026-07-05"));
    });

    it(`a local day always bins to its own local week in ${zone}`, () => {
      process.env.TZ = zone;
      // Every day of one week must land on that week's Sunday, whatever
      // the offset does to the underlying UTC instant.
      for (let i = 0; i < 7; i++) {
        const d = new Date(2026, 6, 5 + i, i * 3, 0); // vary time of day too
        expect(binKeyForDate(d, "weekly")).toBe("2026-07-05");
      }
    });

    it(`daily bin is the LOCAL day in ${zone}`, () => {
      process.env.TZ = zone;
      // 23:30 local is still today — under UTC anchoring it moved a day in
      // either direction depending on the sign of the offset.
      expect(binKeyForDate(new Date(2026, 6, 5, 23, 30), "daily")).toBe(
        "2026-07-05"
      );
      expect(binKeyForDate(new Date(2026, 6, 5, 0, 30), "daily")).toBe(
        "2026-07-05"
      );
    });

    it(`monthly bin is the LOCAL first-of-month in ${zone}`, () => {
      process.env.TZ = zone;
      expect(binKeyForDate(new Date(2026, 6, 1, 0, 30), "monthly")).toBe(
        "2026-07-01"
      );
      expect(binKeyForDate(new Date(2026, 6, 31, 23, 30), "monthly")).toBe(
        "2026-07-01"
      );
    });
  }
});

describe("formatBinLabel", () => {
  it("daily label is day/month", () => {
    expect(formatBinLabel("2026-05-21", "daily")).toBe("21/5");
  });

  it("weekly label is day/month (week-start)", () => {
    expect(formatBinLabel("2026-05-17", "weekly")).toBe("17/5");
  });

  it("monthly label is short month name in current year", () => {
    /* Test against May to avoid year-boundary effects. */
    const currentYear = new Date().getUTCFullYear();
    const label = formatBinLabel(`${currentYear}-05-01`, "monthly");
    expect(label).toBe("May");
  });

  it("monthly label appends 2-digit year when not current year", () => {
    /* A bin from 2024 should show "May 24" if current year is not 2024. */
    const currentYear = new Date().getUTCFullYear();
    const pastYear = currentYear - 2;
    const label = formatBinLabel(`${pastYear}-05-01`, "monthly");
    expect(label).toBe(`May ${String(pastYear).slice(2)}`);
  });
});
