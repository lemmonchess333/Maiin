import { describe, it, expect } from "vitest";
import {
  countChange,
  distanceChange,
  previousRangeLabel,
  rollingRangeLabel,
  summaryBins,
  summaryFirstDayKey,
  summaryGranularity,
  usualBinAmount,
  USUAL_BIN_MIN_BINS,
  volumeChange,
} from "../periodSummary";
import { rollingWindowStart } from "../dateHelpers";

/* A fixed Sunday noon, local. Every date below is a local day key, and the
   windows are derived the way History derives them, so the suite reads
   the same in every zone the CI matrix runs (Auckland's clocks change on
   this very day, which is the point of choosing it). */
const TODAY = new Date(2026, 8, 27, 12);

const lift = (date: string, volumeKg = 1000) => ({ date, volumeKg });
const run = (date: string, distanceM = 5000) => ({ date, distanceM });

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
      lifts: [
        lift("2026-08-29"),
        lift("2026-09-01"),
        lift("2026-09-03"),
        lift("2026-09-26"),
      ],
      runs: [run("2026-09-02"), run("2026-09-27")],
      granularity: "weekly",
    });
    expect(
      bins.map(({ key, lifts, runs, current }) => ({
        key,
        lifts,
        runs,
        current,
      }))
    ).toEqual([
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
      lifts: [lift("2026-09-22")],
      runs: [],
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
      lifts: [lift("2025-10-15", 800), lift("2026-09-02")],
      runs: [run("2025-10-20", 12000)],
      granularity: "monthly",
    });
    expect(bins).toHaveLength(13);
    expect(bins[0].key).toBe("2025-09-01");
    expect(bins[1]).toEqual({
      key: "2025-10-01",
      lifts: 1,
      runs: 1,
      volumeKg: 800,
      distanceM: 12000,
      current: false,
    });
    expect(bins[12]).toMatchObject({ key: "2026-09-01", current: true });
  });

  it("counts every session, kilogram and metre exactly once", () => {
    const lifts = [
      lift("2026-09-01", 1200),
      lift("2026-09-01", 900),
      lift("2026-09-15", 3050),
    ];
    const runs = [
      run("2026-09-02", 5000),
      run("2026-09-26", 8200),
      run("2026-09-27", 21100),
    ];
    const bins = summaryBins({
      since: rollingWindowStart(30, TODAY),
      today: TODAY,
      lifts,
      runs,
      granularity: "weekly",
    });
    const sum = (key: "lifts" | "runs" | "volumeKg" | "distanceM") =>
      bins.reduce((s, b) => s + b[key], 0);
    expect(sum("lifts")).toBe(lifts.length);
    expect(sum("runs")).toBe(runs.length);
    expect(sum("volumeKg")).toBe(5150);
    expect(sum("distanceM")).toBe(34300);
  });

  it("puts each session's kilograms and metres in its own week", () => {
    const bins = summaryBins({
      since: rollingWindowStart(30, TODAY),
      today: TODAY,
      lifts: [lift("2026-09-01", 1200), lift("2026-09-22", 4000)],
      runs: [run("2026-09-02", 5000), run("2026-09-27", 21100)],
      granularity: "weekly",
    });
    const week = (key: string) => bins.find((b) => b.key === key)!;
    expect(week("2026-08-31")).toMatchObject({
      volumeKg: 1200,
      distanceM: 5000,
    });
    expect(week("2026-09-21")).toMatchObject({
      volumeKg: 4000,
      distanceM: 21100,
    });
    expect(week("2026-09-07")).toMatchObject({ volumeKg: 0, distanceM: 0 });
  });

  it("fills the first bar with its whole week, days before the window included", () => {
    /* The first bar is named "24 Aug" and read as "Week of 24 Aug", and
       the window only starts on Saturday 29 Aug. History hands the bins
       every session from the first bar's first day, and the bar counts
       all of them rather than the window's two days. */
    const since = rollingWindowStart(30, TODAY);
    const bins = summaryBins({
      since,
      today: TODAY,
      lifts: [lift("2026-08-24", 2000), lift("2026-08-29", 1000)],
      runs: [run("2026-08-26", 8000)],
      granularity: "weekly",
    });
    expect(summaryFirstDayKey(since, "weekly")).toBe("2026-08-24");
    expect(bins[0]).toEqual({
      key: "2026-08-24",
      lifts: 2,
      runs: 1,
      volumeKg: 3000,
      distanceM: 8000,
      current: false,
    });
  });

  it("treats a missing or broken amount as nothing, not as NaN", () => {
    const bins = summaryBins({
      since: rollingWindowStart(7, TODAY),
      today: TODAY,
      lifts: [lift("2026-09-22", Number.NaN)],
      runs: [run("2026-09-22", Number.POSITIVE_INFINITY)],
      granularity: "daily",
    });
    expect(bins[1]).toMatchObject({
      lifts: 1,
      runs: 1,
      volumeKg: 0,
      distanceM: 0,
    });
  });
});

describe("summaryFirstDayKey", () => {
  it("starts a week's bars on the Monday of the window's first week", () => {
    // Monday 21 Sep at 1M: the window opens on Sunday 23 Aug, whose week
    // is the week of 17 Aug.
    const monday = new Date(2026, 8, 21, 12);
    expect(summaryFirstDayKey(rollingWindowStart(30, monday), "weekly")).toBe(
      "2026-08-17"
    );
  });

  it("starts a year's bars on the 1st of the window's first month", () => {
    expect(summaryFirstDayKey(rollingWindowStart(365, TODAY), "monthly")).toBe(
      "2025-09-01"
    );
  });

  it("starts a week of daily bars on the window's first day", () => {
    expect(summaryFirstDayKey(rollingWindowStart(7, TODAY), "daily")).toBe(
      "2026-09-21"
    );
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
    expect(volumeChange(52800, null)).toBeNull();
    expect(distanceChange(52000, null, "km")).toBeNull();
  });

  it("states a change in kilograms as kilograms, not a percentage", () => {
    expect(volumeChange(52800, 56200)).toEqual({
      direction: "down",
      text: "3.4k kg",
    });
    expect(volumeChange(900, 600)).toEqual({ direction: "up", text: "300 kg" });
  });

  it("moves kilograms in the steps the figure shows", () => {
    // Past a tonne the figure reads "52.8k", so 40 kg is no visible move.
    expect(volumeChange(52840, 52800)).toBeNull();
    expect(volumeChange(52860, 52800)).toEqual({
      direction: "up",
      text: "100 kg",
    });
    // Under a tonne every kilogram shows.
    expect(volumeChange(640, 600)).toEqual({ direction: "up", text: "40 kg" });
  });

  it("states a change in distance in the reader's unit", () => {
    // 52 km after 11 km: the amount, where a percentage said 373%.
    expect(distanceChange(52000, 11000, "km")).toEqual({
      direction: "up",
      text: "41.0 km",
    });
    expect(distanceChange(11000, 52000, "mi")).toEqual({
      direction: "down",
      text: "25.5 mi",
    });
  });

  it("says nothing for a distance change under the figure's decimal", () => {
    expect(distanceChange(52030, 52000, "km")).toBeNull();
  });

  it("counts an amount from an empty range before, as a count does", () => {
    expect(volumeChange(2200, 0)).toEqual({ direction: "up", text: "2.2k kg" });
    expect(distanceChange(5000, 0, "km")).toEqual({
      direction: "up",
      text: "5.0 km",
    });
  });
});

describe("the usual bin", () => {
  const since = rollingWindowStart(30, TODAY);
  const sinceKey = [
    since.getFullYear(),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ].join("-");
  // TODAY is a Sunday, so its week began on 21 Sep and is not over.
  const bins = summaryBins({
    since,
    today: TODAY,
    lifts: [],
    runs: [
      run(sinceKey, 50_000),
      run("2026-09-01", 30_000),
      // Nothing in the week of 7 Sep.
      run("2026-09-16", 40_000),
      run("2026-09-22", 9_000),
    ],
    granularity: "weekly",
  });
  const metres = (b: { distanceM: number }) => b.distanceM;

  it("averages the whole bins, a quiet one included, not the part ones", () => {
    // The weeks of 31 Aug, 7 and 14 Sep: 30, 0 and 40 km. The range's
    // first day and this week so far are left out.
    expect(
      usualBinAmount(bins, metres, { sinceKey, firstSessionKey: "2026-01-01" })
    ).toBe(70_000 / 3);
  });

  it("leaves out the bins from before the user's first session", () => {
    expect(
      usualBinAmount(bins, metres, { sinceKey, firstSessionKey: "2026-09-07" })
    ).toBe(20_000);
  });

  it("is not an average of one week, or of none", () => {
    expect(USUAL_BIN_MIN_BINS).toBe(2);
    expect(
      usualBinAmount(bins, metres, { sinceKey, firstSessionKey: "2026-09-08" })
    ).toBeNull();
    expect(
      usualBinAmount(bins, metres, { sinceKey, firstSessionKey: "2026-09-22" })
    ).toBeNull();
    expect(
      usualBinAmount(bins, metres, { sinceKey, firstSessionKey: null })
    ).toBeNull();
  });
});
