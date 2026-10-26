/**
 * On the Performance page the range scopes only the training load, so it
 * is the card's own control, under its title, rather than a second
 * selector across the page (the survey's "range selector twice"). It
 * stays in place while a new range loads and when there is nothing yet.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrainingLoadCard from "../TrainingLoadCard";

const points = Array.from({ length: 14 }, (_, i) => ({
  dateKey: `2026-09-${String(i + 1).padStart(2, "0")}`,
  fitness: 40 + i,
  fatigue: 30 + i,
  form: 10,
  load: 50,
  runLoad: 20,
  liftLoad: 30,
}));
const range = { selected: "1M", onChange: () => {} };

describe("Training load's range", () => {
  it.each([
    ["with a curve", points, false],
    ["while a range loads", points, true],
    ["before any load", [], false],
  ] as const)("sits in the card %s", (_, data, loading) => {
    render(
      <TrainingLoadCard points={[...data]} loading={loading} range={range} />
    );
    expect(screen.getByRole("radiogroup", { name: "Time range" })).toBeTruthy();
    expect(screen.getByText("Training load")).toBeTruthy();
  });

  it("is not drawn where the page has its own", () => {
    render(<TrainingLoadCard points={points} loading={false} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
