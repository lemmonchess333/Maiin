import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import type { LoadPoint } from "@/lib/trainingLoad";

/**
 * The Form chip's tone, which read every ordinary training week as a
 * fault.
 *
 * Form is `fitness − fatigue` — a 42-day EWMA minus a 7-day one. It goes
 * negative on any stretch where the acute load runs above the 4-week
 * base, which is what a build block IS. The chip painted that
 * `bg-destructive/10 text-destructive-strong` the instant the number
 * crossed zero, so a consistently-training user saw red most weeks.
 *
 * Two things in the codebase already said that was wrong. This card's
 * own legend, rendered ~150px below the chip, reads "Positive form =
 * fresh; deep negative = time to ease off" — so the card distinguishes
 * ordinary negative from deep negative and the chip did not. And
 * `trainingLoad.ts`'s guardrail header rules out exactly this: "Never a
 * red 'injury-risk' score (the non-features list bars readiness
 * theater)", with the low side deliberately not firing because "a low
 * ratio is what a taper or a recovery week deliberately produces".
 *
 * The escalation is not missing — it is the amber advisory line beneath
 * the chart, computed from the rolling-mean ACWR that module trusts
 * rather than from the sign of a difference. The chip states the state;
 * that line carries the verdict.
 */
vi.mock("recharts", () => {
  const Pass = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    ComposedChart: Pass,
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

afterEach(cleanup);

/**
 * A fortnight of real training ending on the given form value. Fitness
 * and fatigue are carried explicitly so the last point's form is the
 * only thing under test.
 */
function points(finalForm: number): LoadPoint[] {
  return Array.from({ length: 14 }, (_, i) => ({
    dateKey: `2026-08-${String(i + 14).padStart(2, "0")}`,
    load: 45,
    runLoad: 45,
    liftLoad: 0,
    fitness: 20,
    fatigue: 20 - finalForm,
    form: finalForm,
  }));
}

/** The chip itself — a single span carrying "Form" and the signed value. */
function chip(): HTMLElement {
  return screen.getByText(/^Form [+-]?\d+$/, { selector: "span" });
}

describe("training load — the Form chip's register", () => {
  it("does not paint an ordinary build week destructive", () => {
    render(<TrainingLoadCard points={points(-6)} loading={false} />);
    const cls = chip().className;
    expect(cls).not.toMatch(/destructive/);
    expect(cls).toMatch(/text-muted-foreground/);
  });

  it("does not paint a deep negative destructive either", () => {
    // The card's legend sends a deep negative to "ease off" — which is
    // the amber advisory's job, in the warning register, not the chip's.
    render(<TrainingLoadCard points={points(-40)} loading={false} />);
    expect(chip().className).not.toMatch(/destructive/);
  });

  it("still reads fresh in the success register when form is positive", () => {
    render(<TrainingLoadCard points={points(7)} loading={false} />);
    const cls = chip().className;
    expect(cls).toMatch(/text-success-strong/);
    expect(cls).not.toMatch(/text-muted-foreground/);
  });

  it("keeps the sign legible in both directions", () => {
    render(<TrainingLoadCard points={points(7)} loading={false} />);
    expect(chip().textContent).toBe("Form +7");
    cleanup();
    render(<TrainingLoadCard points={points(-6)} loading={false} />);
    expect(chip().textContent).toBe("Form -6");
  });
});
