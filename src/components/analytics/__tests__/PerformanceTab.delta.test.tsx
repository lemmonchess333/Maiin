/**
 * The week-over-week change under the PI headline: "Up 4 on last week" in
 * plain grey words (it was a green or coral "+4 pts" pill until
 * 2026-09-29).
 *
 * Device screenshot, 2026-08-13: a held-level week rendered "+0 pts" in
 * THEME.success — the app's green. Green with a leading "+" is the same
 * register every genuine gain uses, so an unchanged week read as progress.
 * A zero delta is not a gain; the headline already carries the verdict, so
 * the change says nothing rather than saying nothing positively.
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

function changeReading(text: string) {
  return screen.getByText(
    (_, el) => el?.tagName === "SPAN" && el.textContent === text
  );
}

describe("PI change on last week", () => {
  beforeEach(() => mockUsePerformanceWeeks.mockReset());

  it("says nothing when the week held level", () => {
    /* The device case. "+0 pts" in green claimed a gain that did not
       happen — and it is the ONLY value where the sign carries no
       information, so the chip has nothing to add. */
    renderWeeks(72, 72);
    // Anchored on the headline, so the absence is not vacuous.
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText(/on last week/)).toBeNull();
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it("still reports a real gain, in words", () => {
    renderWeeks(68, 72);
    expect(changeReading("Up 4 on last week")).toBeInTheDocument();
  });

  it("still reports a real drop", () => {
    /* The negative side matters most — suppressing zero must not
       suppress a decline, which is the signal a user needs to act on. */
    renderWeeks(76, 72);
    const change = changeReading("Down 4 on last week");
    // Grey, not the running coral it used to borrow.
    expect(change.className).toContain("text-muted-foreground");
    expect(change.getAttribute("style")).toBeNull();
  });
});
