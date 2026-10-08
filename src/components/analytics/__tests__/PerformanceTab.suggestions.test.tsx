/**
 * PerformanceTab — no lifting suggestions (Lift4 (3): no stall or
 * suggestion cards). The engine's lifting half told a lifter to cut their
 * sets by 30–40% or add a set, against the plan's own rules: a lighter
 * week is half the sets, and nothing adds sets. The engines no longer
 * write it, and a week stored before that still carries it, so the tab
 * shows only the running half, which waits for the running grill.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
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

/** A writer-shaped weekly doc, as `functions/lib/perfScoring.js` stores it. */
function week(
  weekKey: string,
  planAdjustments?: { lift: string[]; run: string[] }
) {
  return {
    weekKey,
    performanceIndex: 60,
    loadBand: "moderate",
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 70,
      runLoadScore: 70,
      recoveryScore: 60,
      adherenceScore: 60,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {},
    adherenceScore: 60,
    signals: { lifetimeWeeks: 8, daysSinceLastTraining: 1 },
    ...(planAdjustments ? { planAdjustments } : {}),
  };
}

function openDetails(planAdjustments: { lift: string[]; run: string[] }) {
  const weeks = [
    week("2026-07-12"),
    week("2026-07-19"),
    week("2026-07-26"),
    week("2026-08-02", planAdjustments),
  ];
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks[weeks.length - 1],
    loading: false,
  });
  render(
    <MemoryRouter>
      <PerformanceTab />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /details/i }));
}

describe("PerformanceTab — suggestions", () => {
  beforeEach(() => mockUsePerformanceWeeks.mockReset());

  it("shows no lifting suggestions from a week stored with them", () => {
    openDetails({
      lift: ["Reduce working sets by 30–40% or drop accessory work."],
      run: ["Cap runs at easy pace. Replace one session with active recovery."],
    });
    expect(screen.queryByText("Lifting suggestions")).toBeNull();
    expect(screen.queryByText(/Reduce working sets/)).toBeNull();
    // The running half stays.
    expect(screen.getByText("Running suggestions")).toBeInTheDocument();
    expect(screen.getByText(/Cap runs at easy pace/)).toBeInTheDocument();
  });

  it("shows nothing when only lifting suggestions were stored", () => {
    openDetails({
      lift: [
        "Focus on progressive overload — small weight jumps or extra set.",
      ],
      run: [],
    });
    expect(screen.queryByText("Lifting suggestions")).toBeNull();
    expect(screen.queryByText(/progressive overload/)).toBeNull();
    expect(screen.queryByText("Running suggestions")).toBeNull();
  });
});
