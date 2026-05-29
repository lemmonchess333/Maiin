/**
 * Run9 phase 2 — RaceHeader contract.
 *
 * The persistent header consolidates the race-goal line, week progress, taper
 * line, and the compressed note (lock Run9b/(k)). These pin the always-visible
 * attributes + the compressed-as-calm-note treatment.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RaceHeader from "../RaceHeader";

const TODAY = "2026-05-29";

function renderHeader(props: Partial<React.ComponentProps<typeof RaceHeader>> = {}) {
  return render(
    <RaceHeader
      raceGoal={{ distance: "10k", targetDate: "2027-04-18" }}
      currentWeek={2}
      totalWeeks={12}
      compressed={false}
      todayKey={TODAY}
      onEdit={() => {}}
      {...props}
    />
  );
}

describe("RaceHeader", () => {
  it("renders the race-goal one-liner and week N/M progress", () => {
    renderHeader();
    expect(screen.getByText(/Race goal:/i)).toBeInTheDocument();
    expect(screen.getByText(/10K/)).toBeInTheDocument();
    // currentWeek 2 → "3 / 12"
    expect(screen.getByText(/3 \/ 12/)).toBeInTheDocument();
  });

  it("fires onEdit when the Edit affordance is tapped", () => {
    const onEdit = vi.fn();
    renderHeader({ onEdit });
    fireEvent.click(screen.getByRole("button", { name: /Edit race goal/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows the compressed note only when compressed", () => {
    const { unmount } = renderHeader({ compressed: false });
    expect(screen.queryByText(/Compressed plan/i)).not.toBeInTheDocument();
    unmount();
    renderHeader({ compressed: true });
    expect(screen.getByText(/Compressed plan/i)).toBeInTheDocument();
  });

  it("omits the week progress row when totalWeeks/currentWeek are absent", () => {
    renderHeader({ currentWeek: undefined, totalWeeks: undefined });
    expect(screen.getByText(/Race goal:/i)).toBeInTheDocument();
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });
});
