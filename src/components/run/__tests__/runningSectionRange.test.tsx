import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type React from "react";

/**
 * The running history card's window is the page's window.
 *
 * It asked `useRunningStats` for a hardcoded 90 days while sitting inside
 * History's range-scoped body, directly under the time-range control. So
 * "1W" drew thirteen weeks, "1Y" drew ninety days, and the three tiles
 * below the chart reported a 90-day distance, run count and best pace a
 * few hundred pixels under `PeriodOverview`'s range-scoped totals for the
 * same two quantities — one page, two windows, with nothing on screen
 * saying which was which. Filmed at 1W and 1Y against the rich seed: the
 * chart was pixel-identical at both.
 *
 * The page was not missing the right numbers. History already calls
 * `useRunningStats(rangeDays)` for its own aggregates; this component
 * re-derived the same thing against a different window — the "computed in
 * one place, displayed from another" shape the nutrition sweep named.
 *
 * Two halves are pinned here because the type system only reaches one of
 * them. `rangeDays` being required means History must pass SOMETHING; only
 * the source assertion catches it passing a literal.
 */

const mockUseRunningStats = vi.fn();
vi.mock("../../../hooks/useRunningStats", () => ({
  useRunningStats: (days: number) => mockUseRunningStats(days),
}));
const unitRef = { current: "km" as "km" | "mi" };
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => unitRef.current,
}));

/** The values Recharts is actually handed for the bar it draws. */
const captured: { data?: { distance: number }[]; dataKey?: string } = {};
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Noop = () => null;
  return {
    ...actual,
    ResponsiveContainer: Pass,
    BarChart: ({
      data,
      children,
    }: {
      data: { distance: number }[];
      children?: React.ReactNode;
    }) => {
      captured.data = data;
      return <div>{children}</div>;
    },
    Bar: (props: { dataKey?: string }) => {
      captured.dataKey = props.dataKey;
      return null;
    },
    XAxis: Noop,
    YAxis: Noop,
    CartesianGrid: Noop,
  };
});

function chartSeries(): number[] {
  expect(captured.dataKey, "Bar has no dataKey").toBeTruthy();
  return (captured.data ?? []).map(
    (d) => (d as Record<string, number>)[captured.dataKey!]
  );
}

import RunningHistorySection from "../RunningHistorySection";

beforeEach(() => {
  vi.clearAllMocks();
  unitRef.current = "km";
  mockUseRunningStats.mockReturnValue({
    runs: [
      {
        id: "r1",
        distance: 5200,
        avgPace: 300,
        duration: 1560,
        activityType: "outdoor",
        completedAt: new Date("2026-09-10T08:00:00Z"),
      },
    ],
    binnedData: [{ week: "2026-09-07", totalDistance: 5.2 }],
    granularity: "weekly",
    loading: false,
  });
});
afterEach(() => cleanup());

describe("running history card — window", () => {
  it("asks for the window it was given, not 90 days", () => {
    render(<RunningHistorySection rangeDays={7} />);
    expect(mockUseRunningStats).toHaveBeenCalledWith(7);
    expect(mockUseRunningStats).not.toHaveBeenCalledWith(90);
  });

  it("follows the prop when it changes, at every range the page offers", () => {
    // 90 is a real range (3M), so asserting "never 90" alone would be a
    // false positive there. Each value must arrive on its own render.
    for (const days of [7, 30, 90, 180, 365]) {
      cleanup();
      vi.clearAllMocks();
      render(<RunningHistorySection rangeDays={days} />);
      expect(mockUseRunningStats).toHaveBeenCalledWith(days);
      expect(mockUseRunningStats.mock.calls.every((c) => c[0] === days)).toBe(
        true
      );
    }
  });

  it("still renders its chart and tiles", () => {
    render(<RunningHistorySection rangeDays={30} />);
    expect(screen.getByText("Weekly distance (km)")).toBeInTheDocument();
    expect(screen.getByText("best pace")).toBeInTheDocument();
  });
});

describe("the caption names the bin it is drawing", () => {
  /* Honouring the range brings a second claim with it: weekly bins over
     a year are the "~52 unreadable bars" the lifting volume chart already
     moved off (Hist5c pin 7), so the running chart bins adaptively too —
     and a card headed "Weekly distance" over monthly bars would be the
     same claim-vs-reality gap the fixed 90-day window was. */
  for (const [granularity, caption] of [
    ["daily", "Daily distance"],
    ["weekly", "Weekly distance"],
    ["monthly", "Monthly distance"],
  ] as const) {
    it(`says "${caption}" when binning ${granularity}`, () => {
      mockUseRunningStats.mockReturnValue({
        runs: [
          {
            id: "r1",
            distance: 5200,
            avgPace: 300,
            duration: 1560,
            activityType: "outdoor",
            completedAt: new Date("2026-09-10T08:00:00Z"),
          },
        ],
        binnedData: [{ week: "2026-09-07", totalDistance: 5.2 }],
        granularity,
      });
      render(<RunningHistorySection rangeDays={30} />);
      // The unit stays parenthesised — the y-axis is bare numbers, so the
      // caption is the only place the unit appears.
      expect(screen.getByText(`${caption} (km)`)).toBeInTheDocument();
      for (const other of ["Daily", "Weekly", "Monthly"]) {
        if (caption.startsWith(other)) continue;
        expect(screen.queryByText(new RegExp(`${other} distance`))).toBeNull();
      }
    });
  }
});

describe("History hands it the page's own range", () => {
  it("passes rangeDays, not a literal", () => {
    const src = readFileSync("src/pages/History.tsx", "utf8");
    const render = src.match(/<RunningHistorySection[^/>]*\/>/);
    expect(
      render,
      "History no longer renders RunningHistorySection"
    ).not.toBeNull();
    expect(
      render![0].replace(/\s+/g, " "),
      "the card must take the page's own range variable — a literal here " +
        "reinstates the two-windows-one-page bug that tsc cannot see"
    ).toBe("<RunningHistorySection rangeDays={rangeDays} />");
  });
});

/* ── The bars are in the reader's unit ─────────────────────────────── */

describe("the chart plots the unit its caption names", () => {
  /* `totalDistance` is kilometres — the aggregator's currency — and the
     chart drew it raw while the three tiles beneath convert through
     `distanceValue(…, unit)`. A mile-preferring runner read bars about
     1.6x their own totals. */
  const BIN = { week: "2026-09-07", totalDistance: 16.09344 };

  function seriesFor(unit: "km" | "mi") {
    unitRef.current = unit;
    mockUseRunningStats.mockReturnValue({
      runs: [
        {
          id: "r1",
          distance: 16093,
          avgPace: 300,
          duration: 4800,
          activityType: "outdoor",
          completedAt: new Date("2026-09-10T08:00:00Z"),
        },
      ],
      binnedData: [BIN],
      granularity: "weekly",
    });
    render(<RunningHistorySection rangeDays={30} />);
    return chartSeries();
  }

  it("keeps kilometres for a metric reader", () => {
    expect(seriesFor("km")).toEqual([16.1]);
    expect(screen.getByText("Weekly distance (km)")).toBeInTheDocument();
  });

  it("converts for an imperial reader", () => {
    // 16.09344 km is exactly 10 miles — a value where a missing
    // conversion is unmistakable rather than a rounding argument.
    expect(seriesFor("mi")).toEqual([10]);
    expect(screen.getByText("Weekly distance (mi)")).toBeInTheDocument();
  });
});
