/**
 * The week-over-week delta chip beside the PI headline.
 *
 * Device screenshot, 2026-08-13: a held-level week rendered "+0 pts" in
 * THEME.success — the app's green. Green with a leading "+" is the same
 * register every genuine gain uses, so an unchanged week read as progress.
 * A zero delta is not a gain; the headline already carries the verdict, so
 * the chip says nothing rather than saying nothing positively.
 *
 * Harness mirrors PerformanceTab.loadBand.test.tsx — writer-shaped weekly
 * docs, four of them to clear the `establishing` cold-start gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

function week(weekKey: string, pi: number) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand: "high",
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 70,
      runLoadScore: 70,
      recoveryScore: 60,
      adherenceScore: 60,
    },
    multipliers: {
      liftProgression: 1,
      runVolume: 1,
      runPaceAdjustmentPct: 0,
    },
    aggregates: {},
    adherenceScore: 60,
    signals: { lifetimeWeeks: 8, daysSinceLastTraining: 1 },
  };
}

function renderWeeks(previousPi: number, currentPi: number) {
  const weeks = [
    week("2026-07-19", 58),
    week("2026-07-26", 60),
    week("2026-08-02", previousPi),
    week("2026-08-09", currentPi),
  ];
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

describe("PI delta chip", () => {
  beforeEach(() => mockUsePerformanceWeeks.mockReset());

  it("says nothing when the week held level", () => {
    /* The device case. "+0 pts" in green claimed a gain that did not
       happen — and it is the ONLY value where the sign carries no
       information, so the chip has nothing to add. */
    renderWeeks(72, 72);
    expect(screen.queryByText(/\+?0 pts/)).toBeNull();
  });

  it("still reports a real gain, with the plus", () => {
    renderWeeks(68, 72);
    expect(screen.getByText(/\+4 pts/)).toBeInTheDocument();
  });

  it("still reports a real drop", () => {
    /* The negative side matters most — suppressing zero must not
       suppress a decline, which is the signal a user needs to act on. */
    renderWeeks(76, 72);
    expect(screen.getByText(/-4 pts/)).toBeInTheDocument();
  });
});
