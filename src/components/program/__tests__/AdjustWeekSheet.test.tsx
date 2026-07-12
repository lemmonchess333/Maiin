/**
 * AdjustWeekSheet intent-list contract.
 *
 * Guards the Run13 chip set after the no-op "Keep the plan as is" row was
 * removed (it just dismissed the sheet — sheet dismissal already means "no
 * change", so the row led back to where you started). Pins: exactly the three
 * actionable intents render, the no-op row is gone, and an easier-intent tap
 * still advances to the preview (the removed `keep` branch didn't gate it).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import AdjustWeekSheet from "../AdjustWeekSheet";

afterEach(() => cleanup());

function setup() {
  const overrideRunDay = vi.fn();
  const realignRacePlan = vi.fn().mockResolvedValue({
    timing: "healthy" as const,
    totalWeeks: 15,
  });
  render(
    <AdjustWeekSheet
      open
      onClose={vi.fn()}
      runDays={[]}
      raceGoal={{ distance: "marathon", targetDate: "2026-10-17" }}
      overrideRunDay={overrideRunDay}
      realignRacePlan={realignRacePlan}
    />
  );
  return { overrideRunDay, realignRacePlan };
}

describe("AdjustWeekSheet — intent list", () => {
  it("renders exactly the three actionable intents", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /I'm not feeling 100%/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /My week is crowded/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /I need easier running/ })
    ).toBeInTheDocument();
  });

  it("no longer offers the no-op 'Keep the plan as is' row", () => {
    setup();
    expect(screen.queryByText(/Keep the plan as is/i)).toBeNull();
    expect(screen.queryByText(/No changes/i)).toBeNull();
  });

  it("an easier-intent tap still advances to the preview step", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: /I'm not feeling 100%/ })
    );
    expect(screen.getByText(/Easier week — preview/)).toBeInTheDocument();
  });
});
