/**
 * PerformanceTab — the cold-start surface must not contradict itself.
 *
 * Reported from a device screenshot: the gauge read **81 / Peak** in
 * confident green, and directly beneath it the copy read "Establishing
 * your baseline — your weekly read sharpens after about 4 weeks." Both
 * true statements about different things, both on screen, saying opposite
 * things about whether the number means anything yet.
 *
 * The band came from the SCORE alone (`>= 80 ? "Peak"`), with no gate on
 * whether there was enough history to support a verdict. The same screen
 * also read "Lifting progression: +324%", which is `safeRatio(thisWeek,
 * baseline)` against a baseline that had not formed — arithmetically
 * correct and meaningless.
 *
 * CLAUDE.md's cold-start rule is the reason this matters rather than
 * being cosmetic: every new user lives in this window, so across a real
 * user base it is one of the most-seen states in the app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: (...args: unknown[]) => mockUsePerformanceWeeks(...args),
}));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));

import PerformanceTab from "../PerformanceTab";

function week(weekKey: string, pi: number, lifetimeWeeks: number) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand: "high",
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 100,
      runLoadScore: 67,
      recoveryScore: 65,
      adherenceScore: 100,
    },
    // The device case: a 4.24x ratio against a baseline of one session.
    multipliers: {
      liftProgression: 4.24,
      runVolume: 1,
      runPaceAdjustmentPct: 0,
    },
    aggregates: {},
    adherenceScore: 100,
    signals: { lifetimeWeeks, daysSinceLastTraining: 1 },
  };
}

function renderWeeks(weeks: ReturnType<typeof week>[]) {
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks[weeks.length - 1],
    loading: false,
  });
  return render(
    <MemoryRouter>
      <PerformanceTab />
    </MemoryRouter>
  );
}

/**
 * The "This Week Adjustments" card lives inside the collapsed technical
 * section, so it has to be opened before anything in it can be asserted.
 *
 * Worth stating why this is a helper rather than an inline click: the
 * FIRST version of the suppression test passed without it. `queryByText`
 * for "+324%" was null because the whole card was unmounted, not because
 * the ratio was suppressed — it would have passed just as happily against
 * the unfixed component. A negative assertion about a collapsed subtree
 * proves nothing about the subtree.
 */
function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
}

/** One week of history + lifetimeWeeks 1 — squarely establishing. */
const COLD = [week("2026-08-02", 81, 1)];
/** Four weeks and lifetimeWeeks 8 — the gate is cleared. */
const WARM = [
  week("2026-07-12", 55, 8),
  week("2026-07-19", 58, 8),
  week("2026-07-26", 60, 8),
  week("2026-08-02", 81, 8),
];

beforeEach(() => mockUsePerformanceWeeks.mockReset());

describe("PerformanceTab — establishing baseline", () => {
  it("does NOT call a first-week 81 'Peak'", () => {
    // The reported contradiction, stated directly.
    renderWeeks(COLD);
    expect(screen.getByText(/Establishing your baseline/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Peak$/)).toBeNull();
  });

  it("still shows the score — it is the VERDICT that was unsupported", () => {
    // Suppressing the number too would be the opposite error: the score
    // is really computed, and hiding it tells the user nothing.
    renderWeeks(COLD);
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText(/Early read/i)).toBeInTheDocument();
  });

  it("suppresses ratios against a baseline that has not formed", () => {
    // "+324%" is safeRatio(thisWeek, baseline) with a one-session
    // baseline. Suppressed rather than clamped — a capped number is
    // still a claim.
    renderWeeks(COLD);
    openDetails();
    // The card itself is still here — this is a suppressed FIGURE, not a
    // hidden section. Anchoring on the heading is what stops the null
    // below from being satisfied by an unrendered card.
    expect(screen.getByText("This Week Adjustments")).toBeInTheDocument();
    expect(screen.queryByText(/\+324%/)).toBeNull();
    expect(
      screen.getByText(/adjustments start once your baseline settles/i)
    ).toBeInTheDocument();
  });

  it("DOES call a settled 81 'Peak' — the control", () => {
    // Without this, every assertion above is satisfied by a component
    // that never says Peak at all, which would be a different bug.
    renderWeeks(WARM);
    expect(screen.getByText(/^Peak$/)).toBeInTheDocument();
    expect(screen.queryByText(/Establishing your baseline/i)).toBeNull();
  });

  it("shows the adjustment figures once the baseline is settled", () => {
    // The control for the suppression test: same 4.24x multiplier, only
    // the history differs. Without it, "suppressed" would be satisfied by
    // a component that had simply stopped rendering the figures.
    renderWeeks(WARM);
    openDetails();
    expect(screen.getByText("+324%")).toBeInTheDocument();
    expect(
      screen.queryByText(/adjustments start once your baseline settles/i)
    ).toBeNull();
  });
});
