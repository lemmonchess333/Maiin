/**
 * The overview's Performance card. Its words come from the same helpers
 * as Home's row, so the two name one week the same way; its Details open
 * the Performance page, where the gauge, chart and insights now live.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
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
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import PerformanceOverviewCard from "../PerformanceOverviewCard";
import PerformanceHeroCard from "@/components/home/PerformanceHeroCard";
import { VERB_LABEL } from "@/lib/performanceLine";

function week(
  weekKey: string,
  pi: number,
  loadBand: string,
  deload = false,
  lifetimeWeeks = 8
) {
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
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {},
    adherenceScore: 60,
    signals: { lifetimeWeeks, daysSinceLastTraining: 1 },
  };
}

const history = (pi: number, band: string, deload = false) => [
  week("2026-07-12", 55, "moderate"),
  week("2026-07-19", 58, "moderate"),
  week("2026-07-26", 60, "moderate"),
  week("2026-08-02", pi, band, deload),
];

function serve(weeks: ReturnType<typeof week>[], loading = false) {
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks.length ? weeks[weeks.length - 1] : null,
    loading,
  });
}

function renderCard(onOpenDetails = vi.fn(), hasLoggedSession = true) {
  return render(
    <MemoryRouter>
      <PerformanceOverviewCard
        hasLoggedSession={hasLoggedSession}
        onOpenDetails={onOpenDetails}
      />
    </MemoryRouter>
  );
}

const ALL_VERBS = Object.values(VERB_LABEL);
const verbsIn = (el: HTMLElement) =>
  ALL_VERBS.filter(
    (v) => within(el).queryAllByText(new RegExp(`^${v}$`)).length > 0
  );

beforeEach(() => {
  mockUsePerformanceWeeks.mockReset();
  cleanup();
});

describe("PerformanceOverviewCard", () => {
  it("shows the week's index and the change on last week", () => {
    serve(history(72, "high"));
    renderCard();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Up 12 on last week")).toBeInTheDocument();
  });

  it.each([
    ["a low week", 30, "low", false],
    ["a steady week", 65, "moderate", false],
    ["a high week under a deload flag", 82, "high", true],
  ])("names %s as Home does", (_name, pi, band, deload) => {
    const weeks = history(pi, band, deload);
    serve(weeks);
    const overview = renderCard();
    const overviewVerbs = verbsIn(overview.container);
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
    const homeVerbs = verbsIn(home.container);
    // Anchored: both must be showing a verb, or they agree vacuously.
    expect(homeVerbs.length).toBeGreaterThan(0);
    expect(overviewVerbs).toEqual(homeVerbs);
  });

  it("says the deload advice once, in its line", () => {
    serve(history(82, "high", true));
    renderCard();
    expect(screen.getAllByText(/ease off this week/i)).toHaveLength(1);
    expect(screen.queryByText(/consider a deload/i)).toBeNull();
  });

  it("hides the change while the baseline is still forming", () => {
    const weeks = [
      week("2026-07-26", 40, "low", false, 1),
      week("2026-08-02", 55, "moderate", false, 2),
    ];
    serve(weeks);
    renderCard();
    expect(screen.queryByText(/on last week/)).toBeNull();
  });

  it("says nothing about a week that held level", () => {
    serve(history(60, "moderate"));
    renderCard();
    expect(screen.queryByText(/on last week/)).toBeNull();
  });

  it("opens the Performance page from Details", () => {
    const open = vi.fn();
    serve(history(72, "high"));
    renderCard(open);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("dates its line by the weeks it draws", () => {
    serve(history(72, "high"));
    renderCard();
    // The newest score here is weeks old: its date, not "This week".
    expect(screen.getByText("12 Jul")).toBeInTheDocument();
    expect(screen.getByText("2 Aug")).toBeInTheDocument();
    expect(screen.queryByText("This week")).toBeNull();
  });

  it("before any score, says so without claiming nothing is logged", () => {
    serve([]);
    renderCard(vi.fn(), true);
    expect(
      screen.getByText("Performance is still catching up")
    ).toBeInTheDocument();
    expect(screen.queryByText("No sessions logged yet")).toBeNull();
  });

  it("with nothing logged, points at the first workout", () => {
    serve([]);
    renderCard(vi.fn(), false);
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start a workout/i })
    ).toBeInTheDocument();
  });
});
