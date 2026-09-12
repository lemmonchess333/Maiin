/**
 * Correcting a manually-entered distance.
 *
 * The control existed only inside InvalidRunReview, which renders when a
 * run breaches a threshold (under 50 m, under 30 s, or implausibly fast).
 * A treadmill run typed as 5 km when it was 6 breaches nothing — so the
 * numbers most likely to be mistyped were the ones with no way to fix
 * them. It is one component now, used by both surfaces, so the bound
 * cannot drift between them.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditDistance from "../EditDistance";
import type { DistanceUnit } from "@/lib/distanceUnits";

function open(
  distanceKm: number,
  onCommit = vi.fn(),
  unit: DistanceUnit = "km"
) {
  render(
    <EditDistance distanceKm={distanceKm} onCommit={onCommit} unit={unit} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit distance" }));
  return onCommit;
}

describe("EditDistance", () => {
  it("edits miles while committing metres", () => {
    const onCommit = open(8.04672, vi.fn(), "mi");
    expect(screen.getByLabelText("Distance (mi)")).toHaveValue(5);
    fireEvent.change(screen.getByLabelText("Distance (mi)"), {
      target: { value: "6.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onCommit).toHaveBeenCalledWith(10058.4);
  });

  it("enforces the same physical bounds in miles", () => {
    const onCommit = open(5, vi.fn(), "mi");
    const input = screen.getByLabelText("Distance (mi)");
    for (const value of ["0.03", "62.14", ""]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    }
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "62.13" } });
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("commits the corrected distance in METRES", () => {
    // The reported case: 5 km typed, 6 km run.
    const onCommit = open(5);
    fireEvent.change(screen.getByLabelText(/Distance \(km\)/i), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onCommit).toHaveBeenCalledWith(6000);
  });

  it("pre-fills with the current distance so it is adjusted, not re-entered", () => {
    open(5);
    expect(screen.getByLabelText(/Distance \(km\)/i)).toHaveValue(5);
  });

  it("refuses a distance outside the 0.05-100 km bound", () => {
    const onCommit = open(5);
    fireEvent.change(screen.getByLabelText(/Distance \(km\)/i), {
      target: { value: "150" },
    });
    expect(screen.getByText(/between 0.05 km and 100 km/i)).toBeInTheDocument();
    const update = screen.getByRole("button", { name: "Update" });
    expect(update).toBeDisabled();
    fireEvent.click(update);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits nothing when cancelled", () => {
    const onCommit = open(5);
    fireEvent.change(screen.getByLabelText(/Distance \(km\)/i), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommit).not.toHaveBeenCalled();
    // And it closes back to the entry point rather than stranding the user.
    expect(
      screen.getByRole("button", { name: "Edit distance" })
    ).toBeInTheDocument();
  });

  it("accepts a decimal correction", () => {
    const onCommit = open(5);
    fireEvent.change(screen.getByLabelText(/Distance \(km\)/i), {
      target: { value: "6.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onCommit).toHaveBeenCalledWith(6250);
  });
});
