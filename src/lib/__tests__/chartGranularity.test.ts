/**
 * chartGranularity — Hist5c pin 7 contract tests.
 * Daily 1W/1M; weekly 3M; monthly 6M/1Y.
 */
import { describe, it, expect } from "vitest";
import {
  granularityForRange,
  binKeyForDate,
  formatBinLabel,
} from "../chartGranularity";

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
    expect(binKeyForDate(new Date(d), "weekly")).toBe(binKeyForDate(d, "weekly"));
    expect(binKeyForDate(new Date(d), "monthly")).toBe(binKeyForDate(d, "monthly"));
  });
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
