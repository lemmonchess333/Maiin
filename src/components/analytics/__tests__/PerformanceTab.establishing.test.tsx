/**
 * PerformanceTab — the cold-start surface must not contradict itself.
 *
 * Reported from a device screenshot: the gauge read **81 / Peak** in
 * confident green, and directly beneath it the copy read "Establishing
 * your baseline — your weekly read sharpens after about 4 weeks." Both
 * true statements about different things, both on screen, saying opposite
 * things about whether the number means anything yet.
 *
 * The band came from the SCORE alone (`>= 80 ? "Peak"` — a taxonomy the
 * gauge invented, since replaced by the locked verb), with no gate on
 * whether there was enough history to support a verdict. The same screen
 * also read "Lifting progression: +324%", which is `safeRatio(thisWeek,
 * baseline)` against a baseline that had not formed — arithmetically
 * correct and meaningless. That ratio card is gone; the page now states
 * the week's lifting beside the usual week, and the same rule holds it:
 * no usual week until the baseline has formed.
 *
 * CLAUDE.md's cold-start rule is the reason this matters rather than
 * being cosmetic: every new user lives in this window, so across a real
 * user base it is one of the most-seen states in the app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
  /* The hook returns one document per week; a fixture of weekly
     documents is already that series, so its week before the newest is
     the previous week and its length is the document count. */
  usePerformanceWeeks: (...args: unknown[]) => {
    const served = mockUsePerformanceWeeks(...args);
    const weeks = served?.weeks ?? [];
    return {
      previousWeek: weeks.length >= 2 ? weeks[weeks.length - 2] : null,
      docsAvailable: weeks.length,
      ...served,
    };
  },
}));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));

import PerformanceTab from "../PerformanceTab";

function week(
  weekKey: string,
  pi: number,
  lifetimeWeeks: number,
  baselineWeeks = lifetimeWeeks
) {
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
    // The device case: 12.4k kg this week against a baseline of one
    // session's 2.9k, which is where "+324%" came from.
    aggregates: { liftSessions: 3, liftTonnage: 12400 },
    baseline: { liftTonnage: 2925, weeksUsed: baselineWeeks },
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
  it("does NOT give a first-week 81 a verdict", () => {
    // The reported contradiction, stated directly. The verdict word for
    // this fixture's `high` band is "Sharpening"; "Peak" is checked too,
    // so this keeps failing if the old score-derived mapping returns.
    renderWeeks(COLD);
    expect(screen.getByText(/Establishing your baseline/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Sharpening$/)).toBeNull();
    expect(screen.queryByText(/^Peak$/)).toBeNull();
  });

  it("still shows the score — it is the VERDICT that was unsupported", () => {
    // Suppressing the number too would be the opposite error: the score
    // is really computed, and hiding it tells the user nothing.
    renderWeeks(COLD);
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText(/Early read/i)).toBeInTheDocument();
  });

  it("offers no usual week while the baseline has not formed", () => {
    // A one-session baseline is not anyone's usual week. Suppressed rather
    // than shown small: a comparison with it is still a claim.
    renderWeeks(COLD);
    // The week's own figure is here; only the comparison is withheld.
    // Anchoring on it is what stops the null below being satisfied by a
    // card that did not render at all.
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.queryByText(/usual week/)).toBeNull();
    expect(screen.queryByText(/\+324%/)).toBeNull();
  });

  it("DOES give a settled 81 its verdict — the control", () => {
    // Without this, every assertion above is satisfied by a component
    // that never prints a verdict at all, which would be a different bug.
    //
    // The word was "Peak" until the gauge stopped deriving its own bands
    // from the score. The fixture's band is `high`, whose locked verb is
    // "Sharpening"; "Peak" was never in the PI1 taxonomy and its absence
    // is now asserted by `performanceVerbParity.test.tsx`. What this test
    // is FOR — a settled week says something, an establishing one does
    // not — is unchanged.
    renderWeeks(WARM);
    expect(screen.getByText(/^Sharpening$/)).toBeInTheDocument();
    expect(screen.queryByText(/Establishing your baseline/i)).toBeNull();
  });

  it("states the usual week once the baseline is settled", () => {
    // The control for the suppression test: same figures, only the
    // history differs. Without it, "withheld" would be satisfied by a
    // component that had simply stopped comparing.
    renderWeeks(WARM);
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.getByText(/usual week/)).toBeInTheDocument();
    expect(screen.getByText("2.9k kg")).toBeInTheDocument();
  });

  it("offers no usual week from a baseline of one active week, even when settled", () => {
    // Settled history, but only one active week inside the baseline
    // window: one week is not a usual week either.
    renderWeeks(
      WARM.map((w) => ({ ...w, baseline: { ...w.baseline, weeksUsed: 1 } }))
    );
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.queryByText(/usual week/)).toBeNull();
  });
});
