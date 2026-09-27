import { describe, it, expect } from "vitest";
import {
  countChange,
  percentChange,
  previousRangeLabel,
  rollingRangeLabel,
  summaryBins,
  summaryGranularity,
} from "../periodSummary";
import { rollingWindowStart } from "../dateHelpers";

/* A fixed Sunday noon, local. Every date below is a local day key, and the
   windows are derived the way History derives them, so the suite reads
   the same in every zone the CI matrix runs (Auckland's clocks change on
   this very day, which is the point of choosing it). */
const TODAY = new Date(2026, 8, 27, 12);

describe("the range headings", () => {
  const RANGES = ["1W", "1M", "3M", "6M", "1Y"] as const;

  it.each(RANGES)(
    "%s heads a rolling window, so it makes no calendar claim",
    (range) => {
      // "This month" over thirty trailing days is a claim the data does
      // not support. The window is the honest name.
      const heading = rollingRangeLabel(range);
      expect(heading).not.toMatch(/\bthis\b/i);
      expect(heading).toMatch(/^Last \d+ (days|months)$/);
    }
  );

  it("gives each range its own heading", () => {
    expect(new Set(RANGES.map(rollingRangeLabel)).size).toBe(RANGES.length);
  });

  it("falls back to the shortest window", () => {
    expect(rollingRangeLabel(undefined)).toBe("Last 7 days");
  });

  it.each(RANGES)("%s compares with the same span just before", (range) => {
    const span = rollingRangeLabel(range).replace(/^Last /, "");
    expect(previousRangeLabel(range)).toBe(`the ${span} before`);
  });
});

describe("summaryGranularity", () => {
  it("draws days for a week, weeks up to three months, months beyond", () => {
    expect(summaryGranularity(7)).toBe("daily");
    expect(summaryGranularity(30)).toBe("weekly");
    expect(summaryGranularity(90)).toBe("weekly");
    expect(summaryGranularity(180)).toBe("monthly");
    expect(summaryGranularity(365)).toBe("monthly");
  });
});

describe("summaryBins", () => {
  it("covers every week of a 30-day window, empty weeks included", () => {
    const bins = summaryBins({
      since: rollingWindowStart(30, TODAY),
      today: TODAY,
      liftDates: ["2026-08-29", "2026-09-01", "2026-09-03", "2026-09-26"],
      runDates: ["2026-09-02", "2026-09-27"],
      granularity: "weekly",
    });
    expect(bins).toEqual([
      { key: "2026-08-24", lifts: 1, runs: 0, current: false },
      { key: "2026-08-31", lifts: 2, runs: 1, current: false },
      { key: "2026-09-07", lifts: 0, runs: 0, current: false },
      { key: "2026-09-14", lifts: 0, runs: 0, current: false },
      { key: "2026-09-21", lifts: 1, runs: 1, current: true },
    ]);
  });

  it("draws the seven days of a week, ending on today", () => {
    const bins = summaryBins({
      since: rollingWindowStart(7, TODAY),
      today: TODAY,
      liftDates: ["2026-09-22"],
      runDates: [],
      granularity: "daily",
    });
    expect(bins.map((b) => b.key)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(bins[1].lifts).toBe(1);
    expect(bins.filter((b) => b.current).map((b) => b.key)).toEqual([
      "2026-09-27",
    ]);
  });

  it("draws the thirteen months a year's window touches", () => {
    const bins = summaryBins({
      since: rollingWindowStart(365, TODAY),
      today: TODAY,
      liftDates: ["2025-10-15", "2026-09-02"],
      runDates: ["2025-10-20"],
      granularity: "monthly",
    });
    expect(bins).toHaveLength(13);
    expect(bins[0].key).toBe("2025-09-01");
    expect(bins[1]).toEqual({
      key: "2025-10-01",
      lifts: 1,
      runs: 1,
      current: false,
    });
    expect(bins[12]).toMatchObject({ key: "2026-09-01", current: true });
  });

  it("counts every session exactly once", () => {
    const liftDates = ["2026-09-01", "2026-09-01", "2026-09-15"];
    const runDates = ["2026-09-02", "2026-09-26", "2026-09-27"];
    const bins = summaryBins({
      since: rollingWindowStart(30, TODAY),
      today: TODAY,
      liftDates,
      runDates,
      granularity: "weekly",
    });
    expect(bins.reduce((s, b) => s + b.lifts, 0)).toBe(liftDates.length);
    expect(bins.reduce((s, b) => s + b.runs, 0)).toBe(runDates.length);
  });
});

describe("the changes", () => {
  it("states a change in sessions as a count", () => {
    expect(countChange(18, 16)).toEqual({ direction: "up", text: "2" });
    expect(countChange(12, 16)).toEqual({ direction: "down", text: "4" });
  });

  it("says nothing when the count held", () => {
    expect(countChange(16, 16)).toBeNull();
  });

  it("counts from an empty range before, which a percentage cannot", () => {
    expect(countChange(3, 0)).toEqual({ direction: "up", text: "3" });
  });

  it("says nothing when the range before is unknown", () => {
    // A failed read is not a range with no sessions.
    expect(countChange(3, null)).toBeNull();
    expect(percentChange(52, null)).toBeNull();
  });

  it("states a change in a total as a percentage", () => {
    expect(percentChange(52.8, 56.2)).toEqual({
      direction: "down",
      text: "6%",
    });
    expect(percentChange(52, 46.8)).toEqual({ direction: "up", text: "11%" });
  });

  it("keeps the shared rules: no base, no change; under 1%, no change", () => {
    expect(percentChange(52, 0)).toBeNull();
    expect(percentChange(100.4, 100)).toBeNull();
  });
});
