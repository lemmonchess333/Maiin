import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrainingLoadCard from "../TrainingLoadCard";
import type { LoadPoint } from "@/lib/trainingLoad";

/** A 30-day window for an account with no base before it, `sessions`
 *  days of load at its end. */
function loadWindow(sessions: number, startFitness = 0): LoadPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const load = i >= 30 - sessions ? 40 : 0;
    return {
      dateKey: `2026-09-${String(i + 1).padStart(2, "0")}`,
      load,
      runLoad: 0,
      liftLoad: load,
      fitness: i === 0 ? startFitness : startFitness + (load ? 1 : 0),
      fatigue: load ? 4 : 0,
      form: load ? -3 : startFitness,
    };
  });
}

describe("TrainingLoadCard for a new account", () => {
  it("holds the curve after one session and says how many it waits for", () => {
    render(<TrainingLoadCard points={loadWindow(1)} loading={false} />);
    expect(
      screen.getByText("Your training load curve builds here")
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 of 3 days with a session. The trend appears at 3.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Form/)).not.toBeInTheDocument();
  });

  it("draws the curve at three days with a session", () => {
    render(<TrainingLoadCard points={loadWindow(3)} loading={false} />);
    expect(
      screen.queryByText("Your training load curve builds here")
    ).not.toBeInTheDocument();
  });

  it("draws the curve for one session when a base carries in from before the range", () => {
    render(<TrainingLoadCard points={loadWindow(1, 20)} loading={false} />);
    expect(
      screen.queryByText("Your training load curve builds here")
    ).not.toBeInTheDocument();
  });
});
