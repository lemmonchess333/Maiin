import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LoadPoint } from "@/lib/trainingLoad";

/**
 * One scale, because there has only ever been one unit.
 *
 * `trainingLoad.ts`'s header says it in its own words — "Load unit is
 * EFFORT-WEIGHTED TRAINING MINUTES — deliberately, so run and lift
 * compose on one axis" — and fitness and fatigue are EWMAs OF that load.
 * A day's 60 minutes and a fitness of 17 are the same quantity over
 * different windows.
 *
 * The card put them on two axes anyway, BOTH HIDDEN, the second
 * stretched to three times the peak day. That is the first entry in the
 * chart anti-pattern catalogue, and here it cost the card its point:
 * with no scale drawn and no hover layer, the three numbers in the
 * header — Fitness, Fatigue, Form — had no path to any pixel. "Fitness
 * 17" was unlocatable by construction.
 *
 * Two of the three were also simply absent from the plot. Fatigue was
 * never drawn at all, so Form — the card's headline chip, defined as
 * fitness − fatigue — was the distance between a curve and a number
 * that appeared nowhere on the chart.
 */

interface AxisProps {
  yAxisId?: unknown;
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
let tooltip: {
  formatter?: (v: unknown, n: unknown) => [string, string];
  labelFormatter?: (l: unknown, p: unknown) => string;
} | null = null;

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const Noop = () => null;
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
    XAxis: Noop,
    CartesianGrid: Noop,
  };
});

import TrainingLoadCard from "../TrainingLoadCard";

/** A window whose days out-scale the curve by roughly three, which is
 *  the ordinary relationship: fitness converges on average daily
 *  minutes, and a training day is a multiple of that average. */
function point(i: number, load: number): LoadPoint {
  return {
    dateKey: `2026-08-${String(i + 1).padStart(2, "0")}`,
    load,
    runLoad: i % 2 === 0 ? load : 0,
    liftLoad: i % 2 === 0 ? 0 : load,
    fitness: 20,
    fatigue: 26,
    form: -6,
  };
}
const POINTS = Array.from({ length: 6 }, (_, i) => point(i, i % 2 ? 60 : 45));

beforeEach(() => {
  axes.length = 0;
  bars.length = 0;
  areas.length = 0;
  lines.length = 0;
  tooltip = null;
});

function renderCard(points: LoadPoint[] = POINTS) {
  render(<TrainingLoadCard points={points} loading={false} />);
}

describe("everything the card draws shares one scale", () => {
  it("draws exactly one y-axis", () => {
    renderCard();
    expect(axes, "a second axis means two scales again").toHaveLength(1);
  });

  it("shows it, so a number in the header has something to sit against", () => {
    renderCard();
    expect(axes[0].hide, "a hidden scale is not a scale").toBeFalsy();
  });

  it("binds no series to an axis of its own", () => {
    /* The part a single `<YAxis>` does not guarantee on its own: a
       series naming a `yAxisId` Recharts has never seen renders on an
       implicit second scale rather than failing. */
    renderCard();
    for (const s of [...bars, ...areas, ...lines]) {
      expect(s.yAxisId).toBeUndefined();
    }
  });

  it("leaves room for three digits and refuses half-minute ticks", () => {
    /* Effort-minutes reach three figures on a heavy day, and an auto
       domain over a near-empty window otherwise labels its gridlines
       0.5 / 1 / 1.5. */
    renderCard();
    expect(Number(axes[0].width)).toBeGreaterThanOrEqual(32);
    expect(axes[0].allowDecimals).toBe(false);
  });
});

describe("all three header numbers are now on the plot", () => {
  it("draws fatigue, which was never drawn", () => {
    /* Form is fitness − fatigue. Without this line the card's headline
       chip was the gap between a curve and nothing. */
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

describe("the hover readout the card never had", () => {
  it("exists", () => {
    renderCard();
    expect(tooltip, "no <Tooltip> is rendered").not.toBeNull();
  });

  it("names every series in words rather than by data key", () => {
    renderCard();
    const f = tooltip!.formatter!;
    expect(f(20, "fitness")[1]).toBe("Fitness");
    expect(f(26, "fatigue")[1]).toBe("Fatigue");
    expect(f(45, "runLoad")[1]).toBe("Run");
    expect(f(60, "liftLoad")[1]).toBe("Lift");
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
  it("names the dashed fatigue line and the shared scale", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "How to read training load" })
    );
    expect(screen.getByText(/dashed line is the/)).toBeInTheDocument();
    expect(
      screen.getByText(/effort-weighted minutes on one scale/)
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
