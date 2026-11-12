/**
 * What the score is made of, opened under the Performance card by "Score
 * details" (Trim1 call 5). The score, its verb and its change are the
 * card's, and `PerformanceSection.test.tsx` holds them; these are the
 * cases the retired Performance page's tests carried for everything
 * below its gauge.
 *
 * The fixtures are WRITER-SHAPED on purpose: top-level `loadBand`, no
 * `labels` map, exactly as `functions/lib/perfScoring.js` emits. The
 * shipped bug this guards was a correct helper fed a field
 * (`labels.loadBand`) no writer emits, so every lib-level suite stayed
 * green while the page showed every user an em dash for their load band.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
// Chart telemetry is unrelated here. Keep its provider outside the
// component-test boundary alongside the data subscriptions.
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
const review = vi.hoisted(() => ({ eligibility: "ineligible" }));
// WeeklyReviewRow subscribes to Firestore for review eligibility.
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligibility: review.eligibility }),
}));

import PerformanceDetails from "../PerformanceDetails";

type Week = ReturnType<typeof week>;

function week(
  weekKey: string,
  pi: number,
  {
    loadBand = "high",
    lifetimeWeeks = 8,
    baselineWeeks = lifetimeWeeks,
    planAdjustments,
  }: {
    loadBand?: string;
    lifetimeWeeks?: number;
    baselineWeeks?: number;
    planAdjustments?: { lift: string[]; run: string[] };
  } = {}
) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand,
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 100,
      runLoadScore: 67,
      recoveryScore: 65,
      adherenceScore: 100,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    // The device case: 12.4k kg this week against a baseline of one
    // session's 2.9k, which is where "+324%" once came from.
    aggregates: { liftSessions: 3, liftTonnage: 12400 },
    baseline: { liftTonnage: 2925, weeksUsed: baselineWeeks },
    adherenceScore: 100,
    signals: { lifetimeWeeks, daysSinceLastTraining: 1 },
    ...(planAdjustments ? { planAdjustments } : {}),
  };
}

function renderWeeks(weeks: Week[], children?: React.ReactNode) {
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks.length ? weeks[weeks.length - 1] : null,
    loading: false,
  });
  return render(
    <MemoryRouter>
      <PerformanceDetails>{children}</PerformanceDetails>
    </MemoryRouter>
  );
}

/** One week of history and lifetimeWeeks 1: squarely establishing. */
const COLD = [week("2026-08-02", 81, { lifetimeWeeks: 1 })];
/** Four weeks and lifetimeWeeks 8: the gate is cleared. */
const warm = (last: Parameters<typeof week>[2] = {}) => [
  week("2026-07-12", 55),
  week("2026-07-19", 58),
  week("2026-07-26", 60),
  week("2026-08-02", 81, last),
];

const statValue = (label: string) =>
  within(screen.getByText(label).parentElement as HTMLElement);

beforeEach(() => {
  mockUsePerformanceWeeks.mockReset();
  review.eligibility = "ineligible";
});

describe("PerformanceDetails", () => {
  it("does not show the score again: that is the card's", () => {
    renderWeeks(warm());
    // The score is 81. The twelve-week average is another figure.
    expect(screen.queryByText("81")).toBeNull();
    expect(screen.queryByText(/^(Sharpening|Early read)$/)).toBeNull();
    expect(screen.queryByText(/on last week|pts$/)).toBeNull();
  });

  it("shows all of it at once, with no second fold", () => {
    /* The four factors, the load band and the average sat behind a
       "Score details" button inside the page: two taps from the overview.
       Hist6 removed that double fold once already. */
    renderWeeks(warm());
    expect(screen.queryByRole("button", { name: /details/i })).toBeNull();
    expect(screen.getByText("The last 7 days")).toBeInTheDocument();
    for (const factor of ["Lift load", "Run load", "Recovery", "Adherence"]) {
      expect(screen.getByText(factor)).toBeInTheDocument();
    }
    expect(screen.getByText("Load band")).toBeInTheDocument();
    expect(screen.getByText(/^Avg PI \(\d+w\)$/)).toBeInTheDocument();
  });

  it("draws what its page hands it, the training load, among the rest", () => {
    renderWeeks(warm(), <p>Training load</p>);
    expect(screen.getByText("Training load")).toBeInTheDocument();
  });

  it("still draws the training load when the scores cannot be read", () => {
    // The load is computed from the sessions, not the score's documents.
    mockUsePerformanceWeeks.mockReturnValue({
      weeks: [],
      currentWeek: null,
      loading: false,
      failed: true,
      refresh: vi.fn(),
    });
    render(
      <MemoryRouter>
        <PerformanceDetails>
          <p>Training load</p>
        </PerformanceDetails>
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Performance could not load"
    );
    expect(screen.getByText("Training load")).toBeInTheDocument();
  });
});

describe("PerformanceDetails: the load band", () => {
  it.each([
    ["high", "High"],
    ["overreach", "Overreaching"],
    ["low", "Low"],
    ["moderate", "Moderate"],
    ["deload", "Deload"],
  ])("names a %s band in words, not as the stored token", (band, label) => {
    renderWeeks(warm({ loadBand: band }));
    expect(statValue("Load band").getByText(label)).toBeInTheDocument();
    if (band !== label) expect(screen.queryByText(band)).toBeNull();
  });

  it("derives the band from the score when the document stores none", () => {
    // A legacy document. 81 is in the high band.
    const stripped = warm().map(({ loadBand: _drop, ...rest }) => rest);
    renderWeeks(stripped as Week[]);
    expect(statValue("Load band").getByText("High")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("says Establishing, not a band, while the baseline forms", () => {
    renderWeeks(COLD);
    expect(
      statValue("Load band").getByText("Establishing")
    ).toBeInTheDocument();
  });
});

describe("PerformanceDetails: the week against the usual week", () => {
  /* The same screen once read "Lifting progression: +324%", a ratio
     against a baseline of one session: arithmetically correct and
     meaningless. The page states the week's lifting beside the usual
     week instead, and no usual week until the baseline has formed. */
  it("offers no usual week while the baseline has not formed", () => {
    renderWeeks(COLD);
    // The week's own figure is here; only the comparison is withheld.
    // Anchoring on it stops the null below being satisfied by a card
    // that did not render at all.
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.queryByText(/usual week/)).toBeNull();
    expect(screen.queryByText(/\+324%/)).toBeNull();
  });

  it("states the usual week once the baseline is settled", () => {
    // The control: same figures, only the history differs.
    renderWeeks(warm());
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.getByText(/usual week/)).toBeInTheDocument();
    expect(screen.getByText("2.9k kg")).toBeInTheDocument();
  });

  it("offers no usual week from a baseline of one active week, even when settled", () => {
    renderWeeks(
      warm().map((w) => ({ ...w, baseline: { ...w.baseline, weeksUsed: 1 } }))
    );
    expect(screen.getByText("12.4k kg")).toBeInTheDocument();
    expect(screen.queryByText(/usual week/)).toBeNull();
  });
});

describe("PerformanceDetails: suggestions", () => {
  /* No lifting suggestions (Lift4 (3)). The engine's lifting half told a
     lifter to cut their sets by 30 to 40% or add a set, against the
     plan's own rules. The engines no longer write it, and a week stored
     before that still carries it, so only the running half is read. */
  it("shows no lifting suggestions from a week stored with them", () => {
    renderWeeks(
      warm({
        planAdjustments: {
          lift: ["Reduce working sets by 30–40% or drop accessory work."],
          run: [
            "Cap runs at easy pace. Replace one session with active recovery.",
          ],
        },
      })
    );
    expect(screen.queryByText("Lifting suggestions")).toBeNull();
    expect(screen.queryByText(/Reduce working sets/)).toBeNull();
    expect(screen.getByText("Running suggestions")).toBeInTheDocument();
    expect(screen.getByText(/Cap runs at easy pace/)).toBeInTheDocument();
  });

  it("shows nothing when only lifting suggestions were stored", () => {
    renderWeeks(
      warm({
        planAdjustments: {
          lift: [
            "Focus on progressive overload — small weight jumps or extra set.",
          ],
          run: [],
        },
      })
    );
    expect(screen.queryByText(/progressive overload/)).toBeNull();
    expect(screen.queryByText("Running suggestions")).toBeNull();
  });
});

describe("PerformanceDetails: the weekly review", () => {
  it("keeps the review's permanent way in, one tap from the overview", () => {
    review.eligibility = "eligible";
    renderWeeks(warm());
    expect(
      screen.getByRole("button", { name: "Weekly Review" })
    ).toBeInTheDocument();
  });

  it("shows no dead row before there is a week to review", () => {
    renderWeeks(warm());
    expect(screen.queryByRole("button", { name: "Weekly Review" })).toBeNull();
  });
});
