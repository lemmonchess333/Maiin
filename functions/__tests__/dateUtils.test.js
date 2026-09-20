/**
 * functions/lib/dateUtils.js — shared UTC date helpers.
 *
 * These two helpers anchor the grace-window math in the reconciliation triggers
 * (no-show, recovery-exit), so an off-by-one here silently shifts when a user's
 * race flips to no-show or their recovery clears. UTC-anchored by design (all
 * users evaluated against the same boundary). Previously had no direct unit
 * test — exercised only indirectly through the integration suites.
 */
import { describe, it, expect } from "vitest";
import { utcDateString, parseUtcDate, isCalendarDate } from "../lib/dateUtils";

describe("utcDateString", () => {
  it("formats a UTC instant as YYYY-MM-DD", () => {
    expect(utcDateString(new Date(Date.UTC(2026, 5, 1, 12, 0, 0)))).toBe(
      "2026-06-01"
    );
  });

  it("zero-pads single-digit months and days", () => {
    expect(utcDateString(new Date(Date.UTC(2026, 0, 5, 0, 0, 0)))).toBe(
      "2026-01-05"
    );
  });

  it("uses the UTC date, not local — a 23:30 UTC instant stays that UTC day", () => {
    // 2026-03-10 23:30 UTC is still the 10th in UTC even though it's the 11th
    // in +01:00 zones; getUTCDate() makes this TZ-independent.
    expect(utcDateString(new Date(Date.UTC(2026, 2, 10, 23, 30, 0)))).toBe(
      "2026-03-10"
    );
  });

  it("rolls to the next day exactly at the UTC midnight boundary", () => {
    expect(utcDateString(new Date(Date.UTC(2026, 11, 31, 23, 59, 59)))).toBe(
      "2026-12-31"
    );
    expect(utcDateString(new Date(Date.UTC(2027, 0, 1, 0, 0, 0)))).toBe(
      "2027-01-01"
    );
  });
});

describe("parseUtcDate", () => {
  it("parses YYYY-MM-DD to UTC midnight", () => {
    const d = parseUtcDate("2026-06-01");
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 1, 0, 0, 0, 0));
    expect(d.getUTCHours()).toBe(0);
  });

  it("handles month boundaries without local-offset drift", () => {
    expect(parseUtcDate("2026-01-01").getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(parseUtcDate("2026-12-31").getTime()).toBe(Date.UTC(2026, 11, 31));
  });
});

describe("round-trip", () => {
  it("parseUtcDate ∘ utcDateString preserves the calendar day", () => {
    for (const iso of [
      "2026-06-01",
      "2026-01-05",
      "2027-02-28",
      "2024-02-29",
    ]) {
      expect(utcDateString(parseUtcDate(iso))).toBe(iso);
    }
  });

  it("a grace-window subtraction lands on the expected UTC day", () => {
    // The shape the reconciliation triggers use: parse a stored date, subtract
    // a grace window in ms, format back. 3 days before 2026-06-01 = 2026-05-29.
    const start = parseUtcDate("2026-06-01");
    const threeDaysEarlier = new Date(start.getTime() - 3 * 86400000);
    expect(utcDateString(threeDaysEarlier)).toBe("2026-05-29");
  });
});

describe("isCalendarDate", () => {
  /* The round-trip block above asserts the property for a handful of known
     dates; this is that property used as a predicate, and the reason it has
     to be the round trip rather than a parse check.

     JS date construction ROLLS OVER instead of refusing. `2026-09-31`
     becomes 1 October and `2026-02-30` becomes 2 March, both with a
     perfectly finite timestamp — so `Number.isFinite(Date.parse(...))`
     returns true for a day that does not exist. Formatting back and
     comparing is what catches it: a rolled-over date formats as the day it
     rolled TO, which cannot equal what was passed in. */

  it("accepts real days, including both leap-year answers", () => {
    for (const good of [
      "2026-09-20",
      "2026-01-01",
      "2026-12-31",
      "2024-02-29",
    ]) {
      expect(isCalendarDate(good)).toBe(true);
    }
  });

  it("rejects an out-of-range DAY, which parses fine by rolling over", () => {
    // The half a Date.parse check misses. Asserted alongside the rollover
    // itself so the reason is visible rather than asserted on trust.
    expect(Number.isFinite(Date.parse("2026-09-31T00:00:00Z"))).toBe(true);
    expect(utcDateString(parseUtcDate("2026-09-31"))).toBe("2026-10-01");
    expect(isCalendarDate("2026-09-31")).toBe(false);

    expect(Number.isFinite(Date.parse("2026-02-30T00:00:00Z"))).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);

    // 2026 is not a leap year; 2024 is (asserted above).
    expect(isCalendarDate("2026-02-29")).toBe(false);
  });

  it("rejects an out-of-range MONTH, the half a parse check did catch", () => {
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
  });

  it("rejects anything that is not a YYYY-MM-DD string", () => {
    for (const bad of [
      "31/12/2026",
      "2026-1-1",
      "2026-01-01T00:00:00Z",
      "",
      null,
      undefined,
      20261231,
      new Date(),
    ]) {
      expect(isCalendarDate(bad)).toBe(false);
    }
  });
});
