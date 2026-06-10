/**
 * PerformanceHeroCard — PI1 + PI3 + PI4 contract tests.
 *
 * Asserts the consolidated card renders the correct state (loading /
 * empty / low-confidence / steady), wires the 5-verb taxonomy from
 * (loadBand, deloadRecommended), suppresses the delta chip when
 * confidence is low, and links to /history#performance (the
 * canonical deep-link target from PI4).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PerformanceHeroCard from "../PerformanceHeroCard";
import type {
  PerformanceSignals,
  PerformanceWeekDoc,
} from "@/lib/performanceTypes";

const DEFAULT_SIGNALS: PerformanceSignals = {
  bothLoadsStrong: false,
  liftAheadOfBaseline: 0,
  runAheadOfBaseline: 0,
  recoveryWeak: false,
  adherenceWeak: false,
  deloadFlag: false,
  lifetimeWeeks: 12, // steady — not low-confidence
  daysSinceLastTraining: 1,
};

function makeWeek(over: Partial<PerformanceWeekDoc> = {}): PerformanceWeekDoc {
  return {
    weekKey: "2026-05-17",
    performanceIndex: 60,
    breakdown: {
      liftLoadScore: 60,
      runLoadScore: 60,
      recoveryScore: 60,
      adherenceScore: 60,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {
      weekKey: "2026-05-17",
      liftTonnage: 0,
      liftHardSets: 0,
      liftSessions: 0,
      runKm: 0,
      runLongKm: 0,
      runQualityCount: 0,
      runSessions: 0,
      mealDaysLogged: 0,
      avgDailyCalories: 0,
      avgDailyProtein: 0,
      bwCurrent7dAvg: null,
      bwPrevious7dAvg: null,
    },
    adherenceScore: 60,
    loadBand: "moderate",
    labels: { loadBand: "moderate" },
    flags: { deloadRecommended: false },
    signals: { ...DEFAULT_SIGNALS },
    ...over,
  };
}

function renderCard(props: React.ComponentProps<typeof PerformanceHeroCard>) {
  return render(
    <MemoryRouter>
      <PerformanceHeroCard {...props} />
    </MemoryRouter>
  );
}

describe("PerformanceHeroCard — empty state", () => {
  it("renders empty-state copy when loading has cleared with no doc", () => {
    renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
    });
    expect(
      screen.getByText(
        /Your Performance will appear after your first logged session/i
      )
    ).toBeInTheDocument();
  });

  it("renders the hexagon empty state (headline + action), not a numeric PI", () => {
    // Wave3 F: the empty (non-loading) branch is now the hexagon EmptyState
    // primitive — a directive headline + a real next step — instead of the
    // muted ring + dash (which the LOADING branch still uses).
    renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
    });
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });
});

describe("PerformanceHeroCard — loading state", () => {
  it("renders the loading aria-label when no doc has arrived yet", () => {
    renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: true,
    });
    expect(screen.getByLabelText(/Performance — loading/i)).toBeInTheDocument();
  });
});

describe("PerformanceHeroCard — verb taxonomy (PI1)", () => {
  it("'Recovering' for deload band", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 20,
        loadBand: "deload",
        labels: { loadBand: "deload" },
      }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Recovering")).toBeInTheDocument();
  });

  it("'Building' for low band", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 35,
        loadBand: "low",
        labels: { loadBand: "low" },
      }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Building")).toBeInTheDocument();
  });

  it("'Cruising' for moderate band", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Cruising")).toBeInTheDocument();
  });

  it("'Sharpening' for high band", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 78,
        loadBand: "high",
        labels: { loadBand: "high" },
      }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Sharpening")).toBeInTheDocument();
  });

  it("'Backing off' for overreach band", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 90,
        loadBand: "overreach",
        labels: { loadBand: "overreach" },
      }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Backing off")).toBeInTheDocument();
  });

  it("deloadRecommended overrides band to 'Backing off' (deload override wins)", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 75,
        loadBand: "high",
        labels: { loadBand: "high" },
        flags: { deloadRecommended: true },
      }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Backing off")).toBeInTheDocument();
    expect(screen.queryByText("Sharpening")).not.toBeInTheDocument();
  });
});

describe("PerformanceHeroCard — delta chip", () => {
  it("shows positive delta when steady-state with prior week", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 65 }),
      previousWeek: makeWeek({ performanceIndex: 55 }),
      weeksAvailable: 6,
      loading: false,
    });
    expect(screen.getByText(/\+10 from last week/i)).toBeInTheDocument();
  });

  it("shows negative delta when current < previous", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 55 }),
      previousWeek: makeWeek({ performanceIndex: 65 }),
      weeksAvailable: 6,
      loading: false,
    });
    expect(screen.getByText(/-10 from last week/i)).toBeInTheDocument();
  });

  it("hides delta chip in low-confidence state (lifetimeWeeks < 4)", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 60,
        signals: { ...DEFAULT_SIGNALS, lifetimeWeeks: 2 },
      }),
      previousWeek: makeWeek({ performanceIndex: 50 }),
      weeksAvailable: 2,
      loading: false,
    });
    expect(screen.queryByText(/from last week/i)).not.toBeInTheDocument();
  });

  it("hides delta chip when delta === 0", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: makeWeek({ performanceIndex: 60 }),
      weeksAvailable: 6,
      loading: false,
    });
    expect(screen.queryByText(/from last week/i)).not.toBeInTheDocument();
  });
});

describe("PerformanceHeroCard — deep link (PI4)", () => {
  it("links to /history#performance", () => {
    const { container } = renderCard({
      currentWeek: makeWeek(),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/history#performance");
  });

  it("empty-state card's action routes to the workout flow (Wave3 F)", () => {
    // The empty card no longer wraps the whole surface in a link to
    // /history#performance (an empty history would just be empty too). Its
    // single action is the real unlock: start a workout.
    const { container } = renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
    });
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/program");
    expect(link?.textContent).toMatch(/start a workout/i);
  });
});

describe("PerformanceHeroCard — accessibility (PI1 Q5)", () => {
  it("aria-label includes PI value and verb", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(
      screen.getByLabelText(/Performance Index 60, Cruising/i)
    ).toBeInTheDocument();
  });

  it("sr-only sibling carries the supporting line", () => {
    const { container } = renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toMatch(/Holding a steady rhythm/i);
  });

  it("sr-only sibling notes low-confidence baseline state", () => {
    const { container } = renderCard({
      currentWeek: makeWeek({
        performanceIndex: 35,
        loadBand: "low",
        labels: { loadBand: "low" },
        signals: { ...DEFAULT_SIGNALS, lifetimeWeeks: 1 },
      }),
      previousWeek: null,
      weeksAvailable: 1,
      loading: false,
    });
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toMatch(/establishing baseline/i);
  });
});
