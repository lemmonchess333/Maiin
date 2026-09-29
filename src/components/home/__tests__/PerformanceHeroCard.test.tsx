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

  it("leads the empty row with its headline, and shows no number", () => {
    // Wave3 F kept: a directive headline rather than a bare dash. DS3
    // folds it into the "This week" card as a row, with the muted ring
    // the loading branch also uses.
    renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
    });
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  /* The perf doc is written by the server (onWorkoutCreated / onRunCreated),
     so `!currentWeek` also covers the window between a first session being
     saved and that trigger landing. Both surfaces used to render the
     cold-start sentence there, telling a user who had just finished their
     first workout that they had logged nothing. */
  it("does not claim nothing is logged when a session exists", () => {
    renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
      hasLoggedSession: true,
    });
    expect(screen.queryByText("No sessions logged yet")).toBeNull();
    expect(
      screen.queryByText(
        /Your Performance will appear after your first logged session/i
      )
    ).toBeNull();
    expect(
      screen.getByText("Performance is still catching up")
    ).toBeInTheDocument();
  });

  it("offers no next step when the session is already logged", () => {
    // "Start a workout" is advice for someone who has not trained. Here
    // there is nothing for the user to do but wait.
    const { container } = renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
      hasLoggedSession: true,
    });
    expect(screen.queryByText(/start a workout/i)).toBeNull();
    expect(container.querySelector('a[href="/program"]')).toBeNull();
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

  it("'Steady' for moderate band", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: null,
      weeksAvailable: 5,
      loading: false,
    });
    expect(screen.getByText("Steady")).toBeInTheDocument();
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

/* The change reads "Up 10": a grey word and a numeral span, so match the
   element's whole text rather than one text node. */
function changeReading(text: string) {
  return screen.getByText(
    (_, el) => el?.tagName === "SPAN" && el.textContent === text
  );
}

describe("PerformanceHeroCard — the change on last week", () => {
  it("says a rise in words, with the rest for screen readers", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 65 }),
      previousWeek: makeWeek({ performanceIndex: 55 }),
      weeksAvailable: 6,
      loading: false,
    });
    const change = changeReading("Up 10");
    // Plain grey text: no pill, no green.
    expect(change.className).toContain("text-muted-foreground");
    expect(change.className).not.toMatch(/\bbg-|rounded-full|success/);
    expect(screen.getByText(/up 10 on last week/i)).toBeInTheDocument();
  });

  it("says a drop in words, not in the running colour", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 55 }),
      previousWeek: makeWeek({ performanceIndex: 65 }),
      weeksAvailable: 6,
      loading: false,
    });
    const change = changeReading("Down 10");
    expect(change.className).not.toMatch(/running|\bbg-/);
    expect(screen.getByText(/down 10 on last week/i)).toBeInTheDocument();
  });

  it("hides the change in low-confidence state (lifetimeWeeks < 4)", () => {
    renderCard({
      currentWeek: makeWeek({
        performanceIndex: 60,
        signals: { ...DEFAULT_SIGNALS, lifetimeWeeks: 2 },
      }),
      previousWeek: makeWeek({ performanceIndex: 50 }),
      weeksAvailable: 2,
      loading: false,
    });
    // Anchored on the row itself, so the absences below are not vacuous.
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText(/on last week/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Up|Down)/)).not.toBeInTheDocument();
  });

  it("hides the change when the week held level", () => {
    renderCard({
      currentWeek: makeWeek({ performanceIndex: 60 }),
      previousWeek: makeWeek({ performanceIndex: 60 }),
      weeksAvailable: 6,
      loading: false,
    });
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText(/on last week/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Up|Down)/)).not.toBeInTheDocument();
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

  it("the empty row routes to the workout flow (Wave3 F)", () => {
    // An empty history would just be empty too, so a user with nothing
    // logged is sent where the first session starts.
    const { container } = renderCard({
      currentWeek: null,
      previousWeek: null,
      weeksAvailable: 0,
      loading: false,
    });
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/program");
    expect(link).toHaveAccessibleName(/no sessions logged yet/i);
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
      screen.getByLabelText(/Performance Index 60, Steady/i)
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
