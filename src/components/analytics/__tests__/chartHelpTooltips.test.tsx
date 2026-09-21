import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrainingLoadCard from "../TrainingLoadCard";

/**
 * Two charts each carried a permanent paragraph of help, re-read on every
 * visit, between two other charts on a page that runs twelve screens with
 * the rich seed. The Performance Index had already moved the same kind of
 * explanation behind an ⓘ; these are its neighbours brought into line.
 *
 * The assertions are deliberately two-sided. "The paragraph is gone" on
 * its own is satisfied by DELETING the explanation, which would be a
 * worse page, not a tidier one — so each surface is checked for the prose
 * being absent at rest AND present once the affordance is used.
 *
 * Calorie balance had the same treatment, and its half of the contract is
 * asserted beside its own mocks in `CalorieBalanceChart.test.tsx`.
 */

const loadPoints = Array.from({ length: 14 }, (_, i) => ({
  dateKey: `2026-09-${String(i + 1).padStart(2, "0")}`,
  fitness: 40 + i,
  fatigue: 30 + i,
  form: 10,
  load: 50,
  runLoad: 20,
  liftLoad: 30,
}));

describe("Training load — how to read it is one tap away", () => {
  it("does not print the legend on the card", () => {
    render(<TrainingLoadCard points={loadPoints} loading={false} />);
    expect(screen.queryByText(/training base/)).toBeNull();
  });

  it("opens the legend from the ⓘ", () => {
    render(<TrainingLoadCard points={loadPoints} loading={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "How to read training load" })
    );
    expect(screen.getByText(/training base/)).toBeInTheDocument();
    expect(screen.getByText(/time to ease off/)).toBeInTheDocument();
  });
});
