import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type { LoadPoint } from "@/lib/trainingLoad";

/**
 * The training-load axis, which shared a screen with two other charts and
 * did not share their date order.
 *
 * `dateKey.slice(5).replace("-", "/")` turns `2026-09-04` into `09/04` —
 * month-first. Beside it, the weekly-distance chart renders `7/9` for the
 * 7th of September and the volume chart goes through `formatBinLabel`,
 * which is day-first by design. So one card on the page read the other
 * way round, and it read that way SILENTLY: `09/04` is a perfectly
 * legible date under either interpretation, five months apart. This is
 * the "22/8 chart numerals" register CLAUDE.md carves out from the
 * en-GB date rule, and the carve-out is for the day-first form.
 *
 * The fixture days are deliberately past the 12th, where the two orders
 * disagree. A date like the 4th proves nothing.
 */
const captured: { data?: unknown[] } = {};

vi.mock("recharts", () => {
  const Pass = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    ComposedChart: ({
      data,
      children,
    }: {
      data: unknown[];
      children: ReactNode;
    }) => {
      captured.data = data;
      return <div>{children}</div>;
    },
    Area: Noop,
    Bar: Noop,
    XAxis: Noop,
    YAxis: Noop,
    CartesianGrid: Noop,
    /* Wholesale, so every recharts symbol the component imports must be
       listed or it renders as `undefined` and React throws at the JSX
       call site. Line and Tooltip arrived with the fatigue curve and the
       hover readout; both are stubs because this file is about something
       else. `rechartsMockCompleteness` is the gate that now says so
       before a full-suite run has to. */
    Line: Noop,
    Tooltip: Noop,
  };
});

import TrainingLoadCard from "../TrainingLoadCard";

/** 2026-08-17 .. 2026-08-21 — every day past the 12th. */
function points(): LoadPoint[] {
  return [17, 18, 19, 20, 21].map((day, i) => ({
    dateKey: `2026-08-${day}`,
    load: 40 + i,
    runLoad: 40 + i,
    liftLoad: 0,
    fitness: 10 + i,
    fatigue: 8,
    form: 2 + i,
  }));
}

describe("training-load axis labels", () => {
  it("writes the day before the month", () => {
    render(<TrainingLoadCard points={points()} loading={false} />);
    const labels = (captured.data as { label: string }[])
      .map((d) => d.label)
      .filter(Boolean);
    // Every non-blank tick, not just the first: the sparse-label logic
    // only formats one in `tickEvery`, and a single sample would let a
    // second formatter hide in the others.
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const [first] = label.split("/");
      expect(Number(first), `"${label}" is month-first`).toBeGreaterThan(12);
    }
    expect(labels).toContain("17/8");
    expect(labels).not.toContain("08/17");
  });

  it("renders the card rather than an empty state", () => {
    // Anchors the test above: if the card fell through to its no-load
    // branch, `captured.data` would be stale and the loop vacuous.
    render(<TrainingLoadCard points={points()} loading={false} />);
    expect(screen.getByText("Training load")).toBeInTheDocument();
  });
});
