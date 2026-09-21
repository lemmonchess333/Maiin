import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { THEME } from "@/lib/theme";

/**
 * The two bar charts on Analytics follow ONE emphasis rule, and both
 * offer their value on hover.
 *
 * `VolumeChart` has always done both: its `<Cell>` map steps every bar
 * back to 0.5 except the bin you are in now, and it has carried a
 * tooltip since it was written. Its sibling on the same tab — the
 * running distance chart — had neither. Eight identical coral bars
 * state a series and point at nothing, and with no hover layer the only
 * way to read a bin was to estimate it off the axis.
 *
 * So the rule below is deliberately asserted against BOTH charts from
 * one file, against the same three-bin shape. Two charts a few hundred
 * pixels apart, on one tab, reading in two different visual grammars is
 * the thing this pins — not the numbers themselves. A file per chart
 * would let one drift and stay green.
 *
 * Opacity rather than a second hue, in both: coral still means running
 * and purple still means lifting the whole way along the axis.
 */

/** What both charts must produce for a three-bin series. */
const SHARED_EMPHASIS = [0.5, 0.5, 1];

interface CellProps {
  fill?: unknown;
  fillOpacity?: unknown;
}
interface TooltipProps {
  labelFormatter?: (v: unknown) => string;
  formatter?: (v: unknown) => [string, string];
  contentStyle?: Record<string, unknown>;
}

const cells: CellProps[] = [];
let tooltip: TooltipProps | null = null;

/* Wholesale, so every symbol either chart imports has to be here — a
   missing one renders as `undefined` and dies at the JSX call site
   rather than at the import. `Bar` passes its children through because
   the Cells ARE the assertion; everything else is a stub. */
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: Pass,
    Cell: (props: CellProps) => {
      cells.push(props);
      return null;
    },
    Tooltip: (props: TooltipProps) => {
      tooltip = props;
      return null;
    },
    XAxis: Noop,
    YAxis: Noop,
    CartesianGrid: Noop,
  };
});

/** The reader's unit, flipped per test — the running tooltip's suffix
 *  has to follow it, because the bars are converted on the way in. */
let readerUnit: "km" | "mi" = "km";
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => readerUnit,
}));

let runBins: Array<{
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}> = [];
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    granularity: "weekly",
    binnedData: runBins,
    runs: [],
    loading: false,
  }),
}));

import RunningHistorySection from "@/components/run/RunningHistorySection";
import VolumeChart from "@/components/analytics/VolumeChart";

const WEEKS = ["2026-08-03", "2026-08-10", "2026-08-17"];

function renderRunning(
  bins: Array<{ week: string; distanceKm: number }>,
  unit: "km" | "mi" = "km"
) {
  readerUnit = unit;
  runBins = bins.map((b) => ({
    week: b.week,
    totalDistance: b.distanceKm,
    runCount: 1,
    avgPace: 330,
  }));
  render(<RunningHistorySection rangeDays={90} />);
}

const opacities = () => cells.map((c) => c.fillOpacity);
const fills = () => cells.map((c) => c.fill);

beforeEach(() => {
  cells.length = 0;
  tooltip = null;
  readerUnit = "km";
});

describe("one emphasis rule across the tab's two bar charts", () => {
  it("running: the current bin leads, the ones behind it step back", () => {
    renderRunning([
      { week: WEEKS[0], distanceKm: 12.4 },
      { week: WEEKS[1], distanceKm: 9.1 },
      { week: WEEKS[2], distanceKm: 18.2 },
    ]);
    expect(cells).toHaveLength(3);
    expect(
      opacities(),
      "the bin you are in now is the one at full strength"
    ).toEqual(SHARED_EMPHASIS);
  });

  it("lifting: the same sequence, from the chart that already had it", () => {
    render(
      <VolumeChart
        data={[
          { week: WEEKS[0], volume: 4200 },
          { week: WEEKS[1], volume: 5100 },
          { week: WEEKS[2], volume: 3800 },
        ]}
      />
    );
    expect(
      opacities(),
      "the two charts sit on one tab and must read the same way"
    ).toEqual(SHARED_EMPHASIS);
  });

  it("running keeps coral the whole way along — opacity, not a second hue", () => {
    renderRunning([
      { week: WEEKS[0], distanceKm: 12.4 },
      { week: WEEKS[1], distanceKm: 9.1 },
      { week: WEEKS[2], distanceKm: 18.2 },
    ]);
    expect(fills()).toEqual([THEME.running, THEME.running, THEME.running]);
  });

  it("a lone bin is not stepped back against itself", () => {
    /* The off-by-one that a three-bin fixture cannot see: an index
       compared against `length` rather than `length - 1` de-emphasises
       every bar, and cold start — one bin — is where it shows worst. */
    renderRunning([{ week: WEEKS[0], distanceKm: 5 }]);
    expect(opacities()).toEqual([1]);
  });

  it("lifting still greys a zero bin rather than just dimming it", () => {
    /* Pinned here because this file now owns VolumeChart's Cell map. A
       bodyweight-only session tonnes to zero, and that bar is
       suppressed rather than emphasised — an edit that rewrote the
       emphasis ternary could drop this branch silently. */
    render(
      <VolumeChart
        data={[
          { week: WEEKS[0], volume: 0 },
          { week: WEEKS[1], volume: 5100 },
          { week: WEEKS[2], volume: 3800 },
        ]}
      />
    );
    expect(fills()[0]).toBe("hsl(var(--border))");
    expect(opacities()).toEqual([0.4, 0.5, 1]);
  });
});

describe("the running chart's hover layer", () => {
  it("exists at all, on the shared tooltip treatment", () => {
    renderRunning([{ week: WEEKS[0], distanceKm: 12.4 }]);
    expect(tooltip, "the running chart renders no <Tooltip>").not.toBeNull();
    expect(tooltip!.contentStyle).toMatchObject({
      background: THEME.chartTooltipBg,
      borderRadius: 12,
    });
  });

  it("names the bin by its own day, not its raw key", () => {
    renderRunning([{ week: WEEKS[0], distanceKm: 12.4 }]);
    const label = tooltip!.labelFormatter!(WEEKS[0]);
    // 2026-08-03 is a Monday, and the key is Monday-anchored.
    expect(label).toBe("3/8");
    expect(label).not.toContain("2026");
  });

  it("quotes the distance in the reader's own unit", () => {
    renderRunning([{ week: WEEKS[0], distanceKm: 12.4 }]);
    expect(tooltip!.formatter!(12.4)).toEqual(["12.4 km", "Weekly distance"]);
  });

  it("follows a miles reader, because the bars were converted too", () => {
    /* The suffix and the figure have to agree. A hardcoded "km" here
       would label a converted bar with the unit it was converted OUT
       of — the half-converted state `distanceUnits` exists to stop. */
    renderRunning([{ week: WEEKS[0], distanceKm: 12.4 }], "mi");
    expect(tooltip!.formatter!(7.7)).toEqual(["7.7 mi", "Weekly distance"]);
  });

  it("holds one decimal, which is what the tiles beneath it print", () => {
    renderRunning([{ week: WEEKS[0], distanceKm: 12.4 }]);
    expect(tooltip!.formatter!(9)[0]).toBe("9.0 km");
  });
});
