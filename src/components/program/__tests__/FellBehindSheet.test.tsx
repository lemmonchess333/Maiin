/**
 * PR-L L4 client UI — FellBehindSheet contract tests.
 *
 * Pin the three-button behavior per Q24:
 *   1. Shift plan back 1 week → race date +7d, regen plan
 *   2. Compress remaining weeks → keep date, accept compressed prep
 *   3. Skip and continue → dismiss
 *
 * Plus the race-mode gating: shift / compress only render when the
 * user is in race_prep mode with a raceGoal. Structured-mode users
 * only see the skip button (their plan has no "shift the race"
 * concept).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FellBehindSheet from "../FellBehindSheet";

function basePrompt() {
  return {
    weekKey: "2026-05-24",
    completedRatio: 0.25,
    realRunCount: 1,
    weeklyTarget: 4,
  };
}

function setup({ raceModeActive = true }: { raceModeActive?: boolean } = {}) {
  const dismissFellBehindPrompt = vi.fn(async () => {});
  const shiftRacePlanBackOneWeek = vi.fn(async () => {});
  const compressRacePlan = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <FellBehindSheet
      open={true}
      onClose={onClose}
      prompt={basePrompt()}
      dismissFellBehindPrompt={dismissFellBehindPrompt}
      shiftRacePlanBackOneWeek={shiftRacePlanBackOneWeek}
      compressRacePlan={compressRacePlan}
      raceModeActive={raceModeActive}
    />
  );
  return {
    dismissFellBehindPrompt,
    shiftRacePlanBackOneWeek,
    compressRacePlan,
    onClose,
  };
}

describe("FellBehindSheet", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders the prior-week summary (real runs / target / percent)", () => {
    setup();
    // "Last week" appears in both the eyebrow + the sr-only
    // Drawer.Title — getAllBy + length check is safer than getBy.
    expect(screen.getAllByText(/Last week/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of 4 runs/i)).toBeInTheDocument();
    expect(screen.getByText(/\(25%\)/)).toBeInTheDocument();
  });

  it("renders all three buttons when race mode is active", () => {
    setup({ raceModeActive: true });
    expect(
      screen.getByRole("button", { name: /Shift plan back 1 week/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Compress remaining weeks/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Skip and continue/i })
    ).toBeInTheDocument();
  });

  it("hides shift + compress when race mode is NOT active (structured / freeform)", () => {
    setup({ raceModeActive: false });
    expect(
      screen.queryByRole("button", { name: /Shift plan back/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Compress remaining/i })
    ).not.toBeInTheDocument();
    // Skip stays — it's the universal dismissal path.
    expect(
      screen.getByRole("button", { name: /Skip and continue/i })
    ).toBeInTheDocument();
  });

  it("tapping Shift calls shiftRacePlanBackOneWeek then closes", async () => {
    const { shiftRacePlanBackOneWeek, onClose } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /Shift plan back 1 week/i })
    );
    await waitFor(() => {
      expect(shiftRacePlanBackOneWeek).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("tapping Compress calls compressRacePlan then closes", async () => {
    const { compressRacePlan, onClose } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /Compress remaining weeks/i })
    );
    await waitFor(() => {
      expect(compressRacePlan).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("tapping Skip calls dismissFellBehindPrompt then closes", async () => {
    const { dismissFellBehindPrompt, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Skip and continue/i }));
    await waitFor(() => {
      expect(dismissFellBehindPrompt).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables all buttons during an in-flight action (double-tap guard)", async () => {
    // Make the writer slow so we can observe the disabled state.
    const dismissFellBehindPrompt = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50))
    );
    const shiftRacePlanBackOneWeek = vi.fn(async () => {});
    const compressRacePlan = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <FellBehindSheet
        open={true}
        onClose={onClose}
        prompt={basePrompt()}
        dismissFellBehindPrompt={dismissFellBehindPrompt}
        shiftRacePlanBackOneWeek={shiftRacePlanBackOneWeek}
        compressRacePlan={compressRacePlan}
        raceModeActive={true}
      />
    );
    const skipBtn = screen.getByRole("button", { name: /Skip and continue/i });
    fireEvent.click(skipBtn);
    // The skip button now shows the "Dismissing…" state.
    await waitFor(() => {
      expect(screen.getByText(/Dismissing/i)).toBeInTheDocument();
    });
    // Other buttons are disabled — a second click on Shift shouldn't fire.
    fireEvent.click(screen.getByRole("button", { name: /Shift plan back/i }));
    expect(shiftRacePlanBackOneWeek).not.toHaveBeenCalled();
  });
});
