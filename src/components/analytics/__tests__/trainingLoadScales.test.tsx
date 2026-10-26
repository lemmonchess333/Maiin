import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LoadPoint } from "@/lib/trainingLoad";

/**
 * Two drawn scales for one unit.
 *
 * Everything on the card is effort-weighted minutes (`trainingLoad.ts`),
 * over different windows: a bar is one day's minutes, fitness and fatigue
 * are 42- and 7-day averages of them. A training day is a multiple of the
 * average, by far the most for someone who trains once a week or has just
 * started, so on one shared axis the curves lie on the floor under the
 * bars: a fitness of 6 under a 160-minute day reads as a flat line at
 * zero, and "Fitness 6" in the header has nothing to be read against.
 *
 * So the curves read against the left scale and the day's bars against
 * the right one, TrainingPeaks' Performance Management Chart's shape. What
 * these tests keep from the one-scale design: both scales are DRAWN (a
 * hidden scale is not a scale), both start at zero and take no fractions,
 * all three header numbers are on the plot, and the hover names each
 * series in words.
 */

interface AxisProps {
  yAxisId?: unknown;
  orientation?: unknown;
  hide?: unknown;
  domain?: unknown;
  width?: unknown;
  allowDecimals?: unknown;
}
interface SeriesProps {
  dataKey?: unknown;
  yAxisId?: unknown;
  stroke?: unknown;
  strokeDasharray?: unknown;
}

const axes: AxisProps[] = [];
const bars: SeriesProps[] = [];
const areas: SeriesProps[] = [];
const lines: SeriesProps[] = [];
let grid: { yAxisId?: unknown } | null = null;
let xAxis: {
  dataKey?: unknown;
  tickFormatter?: (v: unknown, i: number) => string;
} | null = null;
let tooltip: {
  separator?: unknown;
  formatter?: (v: unknown, n: unknown) => [string, string];
  labelFormatter?: (l: unknown, p: unknown) => string;
} | null = null;

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Pass,
    ComposedChart: Pass,
    Area: (p: SeriesProps) => {
      areas.push(p);
      return null;
    },
    Bar: (p: SeriesProps) => {
      bars.push(p);
      return null;
    },
    Line: (p: SeriesProps) => {
      lines.push(p);
      return null;
    },
    YAxis: (p: AxisProps) => {
      axes.push(p);
      return null;
    },
    Tooltip: (p: typeof tooltip) => {
      tooltip = p;
      return null;
    },
    CartesianGrid: (p: typeof grid) => {
      grid = p;
      return null;
    },
    XAxis: (p: typeof xAxis) => {
      xAxis = p;
      return null;
    },
  };
});

import TrainingLoadCard from "../TrainingLoadCard";

/** A sparse window: two long days against a fitness of 6, the shape that
 *  laid the curves on the floor of a shared axis. */
function point(i: number, load: number): LoadPoint {
  return {
    dateKey: `2026-08-${String(i + 1).padStart(2, "0")}`,
    load,
    runLoad: i === 4 ? load : 0,
    liftLoad: i === 1 ? load : 0,
    fitness: 6,
    fatigue: 14,
    form: -8,
  };
}
const POINTS = Array.from({ length: 6 }, (_, i) =>
  point(i, i === 1 ? 160 : i === 4 ? 45 : 0)
);

beforeEach(() => {
  axes.length = 0;
  bars.length = 0;
  areas.length = 0;
  lines.length = 0;
  grid = null;
  xAxis = null;
  tooltip = null;
});

function renderCard(points: LoadPoint[] = POINTS) {
  render(<TrainingLoadCard points={points} loading={false} />);
}

/** Recharts' id for an axis or series that names none. */
const axisOf = (p: { yAxisId?: unknown }) => p.yAxisId ?? 0;

describe("the curves and the day's bars each have a drawn scale", () => {
  it("draws two y-axes, the curves' on the left and the days' on the right", () => {
    renderCard();
    expect(axes).toHaveLength(2);
    const [curves, days] = axes;
    expect(axisOf(curves)).not.toBe(axisOf(days));
    expect(curves.orientation ?? "left").toBe("left");
    expect(days.orientation).toBe("right");
  });

  it("shows both, so every number has something to sit against", () => {
    renderCard();
    for (const axis of axes) {
      expect(axis.hide, "a hidden scale is not a scale").toBeFalsy();
    }
  });

  it("puts fitness and fatigue on the left scale and both bars on the right", () => {
    renderCard();
    const [curves, days] = axes;
    for (const s of [...areas, ...lines]) {
      expect(axisOf(s), String(s.dataKey)).toBe(axisOf(curves));
    }
    expect(bars).toHaveLength(2);
    for (const b of bars) {
      expect(axisOf(b), String(b.dataKey)).toBe(axisOf(days));
    }
  });

  it("rules the grid on the curves' scale, so a gridline meets a label", () => {
    renderCard();
    expect(grid, "no grid").not.toBeNull();
    expect(axisOf(grid!)).toBe(axisOf(axes[0]));
  });

  it("starts both at zero, leaves room for three digits and refuses half-minute ticks", () => {
    /* Effort-minutes reach three figures on a heavy day, and an auto
       domain over a near-empty window otherwise labels its gridlines
       0.5 / 1 / 1.5. A scale that starts at zero keeps a small drift in
       fitness from reading as a climb. */
    renderCard();
    for (const axis of axes) {
      expect(axis.domain).toEqual([0, "auto"]);
      expect(Number(axis.width)).toBeGreaterThanOrEqual(32);
      expect(axis.allowDecimals).toBe(false);
    }
  });
});

describe("all three header numbers are on the plot", () => {
  it("draws fatigue", () => {
    /* Form is fitness − fatigue. Without this line the card's headline
       chip is the gap between a curve and nothing. */
    renderCard();
    const fatigue = lines.find((l) => l.dataKey === "fatigue");
    expect(fatigue, "no fatigue series").toBeTruthy();
  });

  it("keeps fatigue out of the sport palette", () => {
    /* A derived reference line is not a discipline, and coral already
       means running on the bars beneath it. */
    renderCard();
    const fatigue = lines.find((l) => l.dataKey === "fatigue")!;
    expect(fatigue.stroke).toBe("hsl(var(--muted-foreground))");
    expect(fatigue.strokeDasharray).toBeTruthy();
  });

  it("still draws fitness as the filled curve", () => {
    renderCard();
    expect(areas.map((a) => a.dataKey)).toContain("fitness");
  });

  it("keeps both disciplines as their own stacked bars", () => {
    renderCard();
    expect(bars.map((b) => b.dataKey)).toEqual(["runLoad", "liftLoad"]);
  });
});

describe("the hover readout", () => {
  it("exists", () => {
    renderCard();
    expect(tooltip, "no <Tooltip> is rendered").not.toBeNull();
  });

  it("writes each row as 'Name: value', not Recharts' 'Name : value'", () => {
    renderCard();
    expect(tooltip!.separator).toBe(": ");
  });

  it("names every series in words rather than by data key", () => {
    renderCard();
    const f = tooltip!.formatter!;
    expect(f(6, "fitness")[1]).toBe("Fitness");
    expect(f(14, "fatigue")[1]).toBe("Fatigue");
    expect(f(45, "runLoad")[1]).toBe("Run");
    expect(f(160, "liftLoad")[1]).toBe("Lift");
  });

  it("finds the day under the pointer, so each day reads out its own numbers", () => {
    /* The hover resolves the pointer to a category on the x-axis. Keyed
       by the thinned label, every unlabelled day was the same category
       "", and the readout on any of them was the first blank day's. */
    // Two weeks, so the labels are thinned to every other day.
    const twoWeeks = Array.from({ length: 14 }, (_, i) =>
      point(i, i === 1 ? 160 : 0)
    );
    renderCard(twoWeeks);
    expect(xAxis, "no <XAxis>").not.toBeNull();
    expect(xAxis!.dataKey).toBe("dateKey");
    const keys = twoWeeks.map((p) => p.dateKey);
    expect(new Set(keys).size).toBe(keys.length);
    // The thinned labels are still what the axis draws.
    const drawn = keys.map((k, i) => xAxis!.tickFormatter!(k, i));
    expect(drawn[0]).toBe("1/8");
    expect(drawn.filter(Boolean).length).toBeLessThan(keys.length);
  });

  it("dates the row from the day's own key, not the sparse axis label", () => {
    /* The x-axis label is blank on most days — it is thinned to every
       nth tick — so a tooltip reading the label would head most rows
       with an empty string. It reads `dateKey`, which every point
       carries. 2026-08-03 is day-first: "3/8". */
    renderCard();
    const label = tooltip!.labelFormatter!("", [
      { payload: { dateKey: "2026-08-03" } },
    ]);
    expect(label).toBe("3/8");
  });
});

describe("the explainer describes what is actually drawn", () => {
  it("names the dashed fatigue line and which scale each part reads against", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "How to read training load" })
    );
    expect(screen.getByText(/dashed line is the/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /curves read against the left scale and the bars against the right/
      )
    ).toBeInTheDocument();
  });

  it("keeps the two phrases its sibling guard pins", () => {
    /* `chartHelpTooltips` matches /training base/ and /time to ease
       off/. Rewriting the legend around a new series is exactly when
       those get lost. */
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "How to read training load" })
    );
    expect(screen.getByText(/training base/)).toBeInTheDocument();
    expect(screen.getByText(/time to ease off/)).toBeInTheDocument();
  });
});
