/**
 * Home and Analytics name the same week the same way.
 *
 * The gauge on Analytics derived its own band from the SCORE alone —
 * Peak ≥80 / Building ≥60 / Moderate ≥40 / Recovery — while Home renders
 * the taxonomy PI1 locks, derived from (loadBand, deloadRecommended).
 * Two different mappings from two different inputs, so the same week had
 * two names: a low-band 30 read "Building" on Home and "Recovery" here,
 * and a moderate 65 read "Steady" there and "Building" here, where
 * "Building" also meant something else again.
 *
 * Neither label alone is the invariant — AGREEMENT is. So this renders
 * both real surfaces from one fixture and compares them, rather than
 * asserting a string that a future rename would have to touch in two
 * places to keep honest.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: (...args: unknown[]) => mockUsePerformanceWeeks(...args),
}));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import PerformanceTab from "../PerformanceTab";
import PerformanceHeroCard from "@/components/home/PerformanceHeroCard";
import { VERB_LABEL } from "@/lib/performanceLine";

function week(weekKey: string, pi: number, loadBand: string, deload = false) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand,
    deloadRecommended: deload,
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
    // Eight lifetime weeks clears the `establishing` cold-start gate on
    // BOTH surfaces — an "Early read" on either would make them agree
    // for the wrong reason.
    signals: { lifetimeWeeks: 8, daysSinceLastTraining: 1 },
  };
}

const history = (pi: number, band: string, deload = false) => [
  week("2026-07-12", 55, "moderate"),
  week("2026-07-19", 58, "moderate"),
  week("2026-07-26", 60, "moderate"),
  week("2026-08-02", pi, band, deload),
];

const ALL_VERBS = Object.values(VERB_LABEL);

/** Which locked verb a surface is currently showing. */
function verbOnScreen(container: HTMLElement): string[] {
  return ALL_VERBS.filter(
    (v) => within(container).queryAllByText(new RegExp(`^${v}$`)).length > 0
  );
}

beforeEach(() => {
  mockUsePerformanceWeeks.mockReset();
  cleanup();
});

describe("the two performance surfaces agree on the verb", () => {
  /* The two cases the audit reported, plus the deload override, which is
     the one where the score and the band disagree MOST — a high PI with
     deloadRecommended must read "Backing off" on both, not "Peak" here. */
  it.each([
    ["the reported 30", 30, "low", false],
    ["the reported 65", 65, "moderate", false],
    ["a high week under a deload flag", 82, "high", true],
  ])("%s", (_name, pi, band, deload) => {
    const weeks = history(pi, band, deload);
    mockUsePerformanceWeeks.mockReturnValue({
      weeks,
      currentWeek: weeks[weeks.length - 1],
      loading: false,
    });

    const analytics = render(
      <MemoryRouter>
        <PerformanceTab />
      </MemoryRouter>
    );
    const analyticsVerbs = verbOnScreen(analytics.container);
    cleanup();

    const home = render(
      <MemoryRouter>
        <PerformanceHeroCard
          currentWeek={weeks[weeks.length - 1] as never}
          previousWeek={weeks[weeks.length - 2] as never}
          weeksAvailable={weeks.length}
          loading={false}
        />
      </MemoryRouter>
    );
    const homeVerbs = verbOnScreen(home.container);

    // Anchored on a positive: each surface must actually be SHOWING a
    // verb. Two surfaces rendering nothing would "agree" vacuously.
    expect(homeVerbs.length, "Home rendered no locked verb").toBeGreaterThan(0);
    expect(
      analyticsVerbs.length,
      "Analytics rendered no locked verb"
    ).toBeGreaterThan(0);
    expect(analyticsVerbs).toEqual(homeVerbs);
  });

  it("Analytics no longer invents score-derived bands", () => {
    /* The retired vocabulary. "Peak" and "Moderate" were never in the
       locked taxonomy; they are the tell that the old mapping is back.
       ("Recovery" is deliberately absent from this list — it is a real
       sub-score label elsewhere on the page.) */
    const weeks = history(82, "high");
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
    expect(screen.queryByText(/^Peak$/)).toBeNull();
    expect(screen.getByText(/^Sharpening$/)).toBeInTheDocument();
  });
});
