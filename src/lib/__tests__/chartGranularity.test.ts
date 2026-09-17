/**
 * chartGranularity — Hist5c pin 7 contract tests.
 * Daily 1W/1M; weekly 3M; monthly 6M/1Y.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
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
  /* Every fixture here is built from LOCAL components, never a `Z`
     literal. `binKeyForDate` answers in the LOCAL day — that is the
     whole point of it — so a fixture pinned to a UTC instant only
     asserts the local day where the two happen to agree, which is near
     UTC and nowhere else. The world spans UTC-12 to UTC+14.

     Measured on the unmodified suite: at Pacific/Midway (UTC-11) the
     daily, weekly and monthly "maps to itself" cases all failed, and at
     Pacific/Kiritimati (UTC+14) the daily one did. 10:00Z on the 21st
     is the 22nd at +14 and still the 20th at -11. */
  it("daily bin returns the day itself", () => {
    const d = new Date(2026, 4, 21, 10, 0, 0);
    expect(binKeyForDate(d, "daily")).toBe("2026-05-21");
  });

  it("weekly bin returns the Monday of the week", () => {
    /* 2026-05-21 is a Thursday → previous Monday is 2026-05-18. */
    const d = new Date(2026, 4, 21, 10, 0, 0);
    expect(binKeyForDate(d, "weekly")).toBe("2026-05-18");
  });

  it("weekly bin: Monday maps to itself", () => {
    const d = new Date(2026, 4, 18, 10, 0, 0);
    expect(binKeyForDate(d, "weekly")).toBe("2026-05-18");
  });

  it("monthly bin returns the 1st of the month", () => {
    const d = new Date(2026, 4, 21, 10, 0, 0);
    expect(binKeyForDate(d, "monthly")).toBe("2026-05-01");
  });

  it("monthly bin: 1st of month maps to itself", () => {
    const d = new Date(2026, 4, 1, 10, 0, 0);
    expect(binKeyForDate(d, "monthly")).toBe("2026-05-01");
  });

  it("same input yields same key across granularities (idempotent)", () => {
    const d = new Date(2026, 4, 21, 10, 0, 0);
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
  /** History's axis side: a local wall-clock cursor moved to its Monday.
   *  Hand-rolled rather than borrowed from `dateHelpers` so the two sides
   *  stay genuinely independent constructions of the same instant. */
  const axisKey = (now: Date) => {
    const cursor = new Date(now);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    return binKeyForDate(cursor, "weekly");
  };

  for (const zone of ZONES) {
    it(`data and axis agree in ${zone}`, () => {
      process.env.TZ = zone;
      // Sunday 5 Jul 2026, 09:00 local — a session logged "today", and
      // the last day of its Monday-anchored week, where an off-by-one
      // anchor shows up most readily.
      expect(axisKey(new Date(2026, 6, 5, 9, 0))).toBe(dataKey("2026-07-05"));
    });

    it(`a local day always bins to its own local week in ${zone}`, () => {
      process.env.TZ = zone;
      // Every day of one week must land on that week's Monday, whatever
      // the offset does to the underlying UTC instant. Mon 6 Jul 2026
      // through Sun 12 Jul.
      for (let i = 0; i < 7; i++) {
        const d = new Date(2026, 6, 6 + i, i * 3, 0); // vary time of day too
        expect(binKeyForDate(d, "weekly")).toBe("2026-07-06");
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
    /* 2026-05-18 is a Monday — a key `binKeyForDate` can actually emit. */
    expect(formatBinLabel("2026-05-18", "weekly")).toBe("18/5");
  });

  it("monthly label is short month name in current year", () => {
    /* Test against May to avoid year-boundary effects. LOCAL year: the
       "current year" this label suppresses is the one the user is living
       in — see the year-boundary describe below, where reading it off a
       UTC clock was the defect. */
    const currentYear = new Date().getFullYear();
    const label = formatBinLabel(`${currentYear}-05-01`, "monthly");
    expect(label).toBe("May");
  });

  it("monthly label appends 2-digit year when not current year", () => {
    /* A bin from 2024 should show "May 24" if current year is not 2024. */
    const currentYear = new Date().getFullYear();
    const pastYear = currentYear - 2;
    const label = formatBinLabel(`${pastYear}-05-01`, "monthly");
    expect(label).toBe(`May ${String(pastYear).slice(2)}`);
  });
});

/**
 * Year-boundary regression (2026-09-17).
 *
 * The monthly label suppresses the year when the bin is in "the current
 * year", and that comparison read the clock's UTC year:
 *
 *   const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
 *
 * `d` is the bin KEY parsed at UTC midnight, so reading it back with
 * `getUTC*` is right — it is a carrier for the string's own digits, not
 * an instant. `now` is an instant, and an instant only has a year once
 * you pick a zone. Picking UTC means the axis disagrees with the user's
 * calendar for as long as their offset holds them in a different year:
 * up to 14 hours after midnight on 1 January east of UTC, and up to 12
 * hours before it west of UTC.
 *
 * Both directions print a wrong label rather than a merely odd one. East
 * of UTC on New Year's morning, THIS January reads "Jan 27" while LAST
 * January reads bare "Jan" — the suppression lands on exactly the bin it
 * exists to disambiguate. West of UTC on New Year's Eve, the December
 * the user is standing in reads "Dec 26".
 *
 * The suite could not have caught this: both tests above computed their
 * expected year with `new Date().getUTCFullYear()`, the same idiom as the
 * defect, so they agreed with it by construction. They now read the local
 * year, and these pin the boundary itself.
 */
describe("formatBinLabel — year boundary away from UTC", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
    vi.useRealTimers();
  });

  it("east of UTC, the local new year is the current year", () => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    vi.useFakeTimers({ toFake: ["Date"] });
    // 00:30 on 1 January 2027 in Kiritimati — 10:30Z on 31 December 2026.
    vi.setSystemTime(new Date("2026-12-31T10:30:00Z"));

    expect(formatBinLabel("2027-01-01", "monthly")).toBe("Jan");
    expect(formatBinLabel("2026-01-01", "monthly")).toBe("Jan 26");
  });

  it("west of UTC, the local old year is still the current year", () => {
    process.env.TZ = "Pacific/Midway"; // UTC-11
    vi.useFakeTimers({ toFake: ["Date"] });
    // 20:00 on 31 December 2026 in Midway — 07:00Z on 1 January 2027.
    vi.setSystemTime(new Date("2027-01-01T07:00:00Z"));

    expect(formatBinLabel("2026-12-01", "monthly")).toBe("Dec");
    expect(formatBinLabel("2025-12-01", "monthly")).toBe("Dec 25");
  });
});
