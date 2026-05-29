/**
 * FellBehindSheet contract tests.
 *
 * Run9 phase-3 (Slice DE) reframe — the three plan actions collapsed to one
 * primary + one route:
 *   1. Realign my plan → re-anchor to today (keep race date)
 *   2. My race moved → → route to the date editor
 *   3. Not now → dismiss
 *
 * Plus the race-mode gating: realign / race-moved only render when the user is
 * in race_prep mode with a raceGoal. Structured-mode users only see "Not now"
 * (their plan has no "race" concept).
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
  const realignRacePlan = vi.fn(async () => {});
  const onRaceMoved = vi.fn();
  const onClose = vi.fn();
  render(
    <FellBehindSheet
      open={true}
      onClose={onClose}
      prompt={basePrompt()}
      dismissFellBehindPrompt={dismissFellBehindPrompt}
      realignRacePlan={realignRacePlan}
      onRaceMoved={onRaceMoved}
      raceModeActive={raceModeActive}
    />
  );
  return {
    dismissFellBehindPrompt,
    realignRacePlan,
    onRaceMoved,
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

  it("renders all three actions when race mode is active", () => {
    setup({ raceModeActive: true });
    expect(
      screen.getByRole("button", { name: /Realign my plan/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /My race moved/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Not now/i })
    ).toBeInTheDocument();
  });

  it("hides realign + race-moved when race mode is NOT active (structured / freeform)", () => {
    setup({ raceModeActive: false });
    expect(
      screen.queryByRole("button", { name: /Realign my plan/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /My race moved/i })
    ).not.toBeInTheDocument();
    // "Not now" stays — it's the universal dismissal path.
    expect(
      screen.getByRole("button", { name: /Not now/i })
    ).toBeInTheDocument();
  });

  it("tapping Realign calls realignRacePlan then closes", async () => {
    const { realignRacePlan, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Realign my plan/i }));
    await waitFor(() => {
      expect(realignRacePlan).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("tapping My race moved calls onRaceMoved then closes", async () => {
    const { onRaceMoved, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /My race moved/i }));
    await waitFor(() => {
      expect(onRaceMoved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("tapping Not now calls dismissFellBehindPrompt then closes", async () => {
    const { dismissFellBehindPrompt, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Not now/i }));
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
    const realignRacePlan = vi.fn(async () => {});
    const onRaceMoved = vi.fn();
    const onClose = vi.fn();
    render(
      <FellBehindSheet
        open={true}
        onClose={onClose}
        prompt={basePrompt()}
        dismissFellBehindPrompt={dismissFellBehindPrompt}
        realignRacePlan={realignRacePlan}
        onRaceMoved={onRaceMoved}
        raceModeActive={true}
      />
    );
    const skipBtn = screen.getByRole("button", { name: /Not now/i });
    fireEvent.click(skipBtn);
    // The skip button now shows the "Dismissing…" state.
    await waitFor(() => {
      expect(screen.getByText(/Dismissing/i)).toBeInTheDocument();
    });
    // Other buttons are disabled — a second click on Realign shouldn't fire.
    fireEvent.click(screen.getByRole("button", { name: /Realign my plan/i }));
    expect(realignRacePlan).not.toHaveBeenCalled();
  });
});
