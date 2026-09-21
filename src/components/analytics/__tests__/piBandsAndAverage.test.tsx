import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import { THEME } from "@/lib/theme";

/**
 * The bands move into the plot, and the legend that decoded them goes.
 *
 * `resolveLoadBand` resolves to `computeLoadBand(pi)` — thresholds at
 * 85 / 70 / 45 / 25, identical in `src/lib/performanceEngine.ts` and
 * `functions/lib/perfScoring.js` and pinned by
 * `performanceEngineParity.cross.test.ts`. So a week's band is a
 * function of its own PI, which means the dot's colour was a function of
 * the dot's HEIGHT, and the five-item legend beneath the chart existed
 * to translate a y-position back into the y-position it had already
 * shown. One encoding, not two: the zones say the band.
 *
 * What the zones must NOT be is five hues. `performanceColour.ts` locks
 * PI to brand purple and amber-when-backing-off; a rainbow behind a
 * purple line would be a sixth vocabulary on a two-colour surface.
 */

interface AreaProps {
  y1?: unknown;
  y2?: unknown;
  fill?: unknown;
  fillOpacity?: unknown;
  label?: { value?: unknown };
}
interface LineProps {
  dataKey?: unknown;
  strokeDasharray?: unknown;
  stroke?: unknown;
  connectNulls?: unknown;
}

const zones: AreaProps[] = [];
const lines: LineProps[] = [];
const refLines: Record<string, unknown>[] = [];
let chartData: Array<Record<string, unknown>> = [];
let dotRender: ((p: unknown) => unknown) | null = null;

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    AreaChart: ({
      data,
      children,
    }: {
      data: Array<Record<string, unknown>>;
      children?: ReactNode;
    }) => {
      chartData = data;
      return <div>{children}</div>;
    },
    Area: (props: { dot?: (p: unknown) => unknown }) => {
      dotRender = props.dot ?? null;
      return null;
    },
    Line: (props: LineProps) => {
      lines.push(props);
      return null;
    },
    ReferenceArea: (props: AreaProps) => {
      zones.push(props);
      return null;
    },
    ReferenceLine: (props: Record<string, unknown>) => {
      refLines.push(props);
      return null;
    },
    XAxis: Noop,
    YAxis: Noop,
    CartesianGrid: Noop,
    Tooltip: Noop,
  };
});

import PerformanceIndexChart from "../PerformanceIndexChart";

function week(
  pi: number,
  confidence: "high" | "medium" | "low" = "high"
): PerformanceWeekDoc {
  return {
    weekKey: `2026-08-${String(3 + pi).padStart(2, "0")}`,
    performanceIndex: pi,
    breakdown: { liftLoadScore: 50, runLoadScore: 50, recoveryScore: 50 },
    confidence,
  } as unknown as PerformanceWeekDoc;
}

const BAND_LABELS = ["Deload", "Low", "Moderate", "High", "Overreach"];

beforeEach(() => {
  zones.length = 0;
  lines.length = 0;
  refLines.length = 0;
  chartData = [];
  dotRender = null;
});

function renderChart(weeks = [week(40), week(60), week(88)]) {
  render(<PerformanceIndexChart weeks={weeks} />);
}

describe("the bands are drawn where the reader can see them", () => {
  it("draws all five, spanning the axis with no gap and no overlap", () => {
    renderChart();
    expect(zones).toHaveLength(5);
    expect(zones.map((z) => [z.y1, z.y2])).toEqual([
      [0, 25],
      [25, 45],
      [45, 70],
      [70, 85],
      [85, 100],
    ]);
  });

  it("puts the boundaries where computeLoadBand puts them", () => {
    /* The zones are a picture of a function. If either engine moved a
       threshold this would be a chart telling a confident lie, so the
       edges are asserted against the same literals the two engines use
       — 85 / 70 / 45 / 25. */
    renderChart();
    const edges = zones.flatMap((z) => [z.y1, z.y2]);
    for (const t of [25, 45, 70, 85]) expect(edges).toContain(t);
  });

  it("labels each zone rather than leaving a colour to be decoded", () => {
    renderChart();
    expect(zones.map((z) => z.label?.value)).toEqual(BAND_LABELS);
  });

  it("colours only the caution band", () => {
    /* Four neutrals and one amber. Five hues would be a new vocabulary
       on a surface `performanceColour.ts` locks to two. */
    renderChart();
    const coloured = zones.filter((z) => z.fill === THEME.amber);
    expect(coloured).toHaveLength(1);
    expect(zones[4].fill).toBe(THEME.amber);
    for (const z of zones.slice(0, 4)) {
      expect(z.fill).toBe("hsl(var(--muted-foreground))");
    }
  });

  it("keeps every zone as a wash, never competing with the series", () => {
    renderChart();
    for (const z of zones) {
      expect(Number(z.fillOpacity)).toBeLessThanOrEqual(0.12);
      expect(Number(z.fillOpacity)).toBeGreaterThan(0);
    }
  });

  it("retires the two dashed threshold lines the zones replaced", () => {
    /* 70 and 85 were already drawn as ReferenceLines — two of the four
       boundaries, in two different hues, with nothing naming them. */
    renderChart();
    expect(refLines).toHaveLength(0);
  });
});

describe("the legend goes, and the dot colour with it", () => {
  it("renders no band legend", () => {
    renderChart();
    for (const label of BAND_LABELS) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("paints every dot the one series colour", () => {
    /* The dot used to be painted from the band, i.e. from its own
       height. A dot that still changed colour would mean the redundant
       encoding came back. */
    renderChart([week(10), week(50), week(95)]);
    expect(dotRender, "the Area renders no custom dot").toBeTypeOf("function");
    const fills = chartData.map((d) => {
      const el = dotRender!({ cx: 0, cy: 0, payload: d }) as {
        props: { style: { fill: string } };
      };
      return el.props.style.fill;
    });
    expect(new Set(fills).size).toBe(1);
    expect(fills[0]).toBe(THEME.brand);
  });

  it("stops carrying a band on every data point", () => {
    renderChart();
    for (const d of chartData) expect(d.band).toBeUndefined();
  });
});

describe("the rolling average line", () => {
  it("is drawn, dashed and muted, against the solid series", () => {
    renderChart();
    const avg = lines.find((l) => l.dataKey === "avg");
    expect(avg, "no average line is drawn").toBeTruthy();
    expect(avg!.strokeDasharray).toBeTruthy();
    expect(avg!.stroke).toBe("hsl(var(--muted-foreground))");
  });

  it("leaves a gap rather than joining across a week with no baseline", () => {
    renderChart();
    expect(lines.find((l) => l.dataKey === "avg")!.connectNulls).toBe(false);
  });

  it("carries a trailing mean on every point", () => {
    renderChart([week(60), week(80), week(40)]);
    expect(chartData.map((d) => d.avg)).toEqual([60, 70, 60]);
  });

  it("captions the figure with the window it actually covers", () => {
    /* Two active weeks and one silent one: the caption must say two. */
    renderChart([week(80), week(0, "low"), week(80)]);
    expect(
      screen.getByText("Average 80 over your last 2 active weeks")
    ).toBeInTheDocument();
  });

  it("says nothing at all when no week qualifies", () => {
    renderChart([week(70, "low")]);
    expect(screen.queryByText(/Average .* active/)).toBeNull();
  });
});
