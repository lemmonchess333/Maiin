import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

/**
 * The y-axis must have room for the widest label it will ever draw.
 *
 * This chart's domain is fixed `[0, 100]` and the caption beside its title
 * says "0–100", so the top gridline is always three digits. It had
 * `width={28}` AND `margin.left: -10` — eighteen usable pixels — so "100"
 * rendered as "00" and 75 and 50 lost part of their first digit. A chart
 * that advertises its scale in words could not draw it.
 *
 * The negative margin is the part worth naming: it is a reasonable trick
 * for reclaiming Recharts' generous default gutter, and its siblings are
 * fine without the room — `RunningHistorySection` labels single digits,
 * `VolumeChart` abbreviates ("2.4k") and pays for it with width 35. This
 * chart borrowed the trick from charts whose labels are shorter than its
 * own.
 *
 * It survived every earlier look at this tab because the chart renders
 * nothing without performance docs, and the capture spec signs up a FRESH
 * account each run — so the surface had only ever been filmed in a
 * near-cold-start state. Found by capturing it as the rich seed user.
 */
const captured: {
  margin?: Record<string, number>;
  yAxis?: Record<string, unknown>;
} = {};

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    AreaChart: ({
      margin,
      children,
    }: {
      margin: Record<string, number>;
      children: ReactNode;
    }) => {
      captured.margin = margin;
      return <div>{children}</div>;
    },
    YAxis: (props: Record<string, unknown>) => {
      captured.yAxis = props;
      return null;
    },
    Area: Noop,
    Line: Noop,
    XAxis: Noop,
    CartesianGrid: Noop,
    /* Wholesale, so every recharts symbol the component imports has to
       be listed or it renders as `undefined` and the file dies at the
       JSX call site rather than at the import. `ReferenceArea` arrived
       with the in-plot bands and `Line` with the rolling average; both
       are stubs because this file is about the y-axis and nothing else.
       `piBandsAndAverage.test.tsx` is the one that reads their props. */
    ReferenceArea: Noop,
    ReferenceLine: Noop,
    Tooltip: Noop,
  };
});

import PerformanceIndexChart from "../PerformanceIndexChart";

function week(n: number): PerformanceWeekDoc {
  return {
    weekKey: `2026-08-${String(3 + n * 7).padStart(2, "0")}`,
    performanceIndex: 60 + n * 5,
    breakdown: { liftLoadScore: 50, runLoadScore: 50, recoveryScore: 50 },
  } as unknown as PerformanceWeekDoc;
}

function renderChart() {
  render(<PerformanceIndexChart weeks={[week(0), week(1), week(2)]} />);
}

describe("Performance Index y-axis", () => {
  it("still promises a 0-100 scale in its caption", () => {
    // The assertions below only matter while the top tick is three
    // digits. Tie them to the promise rather than leaving them floating.
    renderChart();
    expect(screen.getByText(/^0–100 · last \d+w$/)).toBeInTheDocument();
    expect(captured.yAxis?.domain).toEqual([0, 100]);
    expect(captured.yAxis?.ticks).toContain(100);
  });

  it("does not claw back gutter with a negative left margin", () => {
    renderChart();
    expect(captured.margin?.left).toBeGreaterThanOrEqual(0);
  });

  it("leaves room for three digits", () => {
    // 12px tabular Archivo renders "100" at roughly 21px, and Recharts
    // adds a small tick gap. 28 — what the single-digit siblings use —
    // is not enough once anything is taken off it.
    renderChart();
    expect(captured.yAxis?.width).toBeGreaterThanOrEqual(32);
  });
});
