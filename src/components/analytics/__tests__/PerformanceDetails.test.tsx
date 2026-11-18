/**
 * The score and what it is made of, opened under Progress's lead by
 * "Score details" (Trim1 call 5). App1 Q10 moved the 0–100 score itself
 * here; the verdict and the last seven days against the usual week are
 * the lead's, and `PerformanceSection.test.tsx` holds them.
 *
 * The fixtures are WRITER-SHAPED on purpose: top-level `loadBand`, no
 * `labels` map, exactly as `functions/lib/perfScoring.js` emits. The
 * shipped bug this guards was a correct helper fed a field
 * (`labels.loadBand`) no writer emits, so every lib-level suite stayed
 * green while the page showed every user an em dash for their load band.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { groupText } from "@/test/localeGrouping";
import { THEME } from "@/lib/theme";

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
    deloadRecommended = false,
    lifetimeWeeks = 8,
    baselineWeeks = lifetimeWeeks,
    planAdjustments,
  }: {
    loadBand?: string;
    deloadRecommended?: boolean;
    lifetimeWeeks?: number;
    baselineWeeks?: number;
    planAdjustments?: { lift: string[]; run: string[] };
  } = {}
) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand,
    deloadRecommended,
    breakdown: {
      liftLoadScore: 100,
      runLoadScore: 67,
      recoveryScore: 65,
      adherenceScore: 100,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    // The device case: 12.4k kg this week against a baseline of one
    // session's 2.9k, which is where "+324%" once came from.
    aggregates: {
      liftSessions: 3,
      liftTonnage: 12400,
      mealDaysLogged: 6,
      avgDailyCalories: 2184,
      avgDailyProtein: 148,
    },
    baseline: { liftTonnage: 2925, weeksUsed: baselineWeeks },
    adherenceScore: 100,
    signals: { lifetimeWeeks, daysSinceLastTraining: 1 },
    ...(planAdjustments ? { planAdjustments } : {}),
  };
}

function renderWeeks(weeks: Week[]) {
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks.length ? weeks[weeks.length - 1] : null,
    loading: false,
  });
  return render(
    <MemoryRouter>
      <PerformanceDetails />
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

const scoreCard = () => screen.getByRole("region", { name: "Your score" });

describe("PerformanceDetails: the score (App1 Q10)", () => {
  it("holds the 0–100 score, once, inside its ring", () => {
    const { container } = renderWeeks(warm());
    const score = within(scoreCard()).getByText("81");
    // The ring is the element the score sits in: §3f's "the ring in the
    // band's colour with the score in it", not digits beside a ring.
    expect(
      score.closest("div.relative")?.querySelector("svg circle")
    ).not.toBeNull();
    expect(screen.getAllByText("81")).toHaveLength(1);
    expect(
      container.querySelectorAll("svg circle[stroke-dasharray]")
    ).toHaveLength(1);
  });

  it("draws the ring in rem, so the score still fits at larger text", () => {
    renderWeeks(warm());
    const ring = screen.getByText("81").closest("div.relative") as HTMLElement;
    expect(ring.style.width).toMatch(/rem$/);
    expect(ring.style.height).toBe(ring.style.width);
  });

  it("does not repeat the lead's verb", () => {
    renderWeeks(warm());
    expect(screen.queryByText(/^(Sharpening|Early read)$/)).toBeNull();
  });

  it("labels its window the 7 days, never this week (Q13)", () => {
    renderWeeks(warm());
    // The newest score here is weeks old: named by its last day.
    expect(
      within(scoreCard()).getByText("7 days to 2 Aug · out of 100")
    ).toBeInTheDocument();
    expect(screen.queryByText(/this week/i)).toBeNull();
  });

  it("gives the change on the 7 days before", () => {
    renderWeeks(warm());
    expect(screen.getByText("Up 21 on the 7 days before")).toBeInTheDocument();
  });

  it("says nothing about a score that held level", () => {
    /* A device screenshot, 13 August 2026: a held-level week read
       "+0 pts" in the app's green. Zero is the one value whose sign
       carries nothing, so the chip has nothing to add. */
    renderWeeks([week("2026-07-26", 60), week("2026-08-02", 60)]);
    expect(screen.queryByText(/on the 7 days before/)).toBeNull();
    expect(screen.queryByText(/[+−-]0\b/)).toBeNull();
  });

  it("still reports a real drop", () => {
    // Suppressing zero must not suppress a decline.
    renderWeeks([week("2026-07-26", 60), week("2026-08-02", 52)]);
    expect(screen.getByText("Down 8 on the 7 days before")).toBeInTheDocument();
  });

  it("colours the ring amber when the lead says to back off", () => {
    const { container } = renderWeeks(
      warm({ loadBand: "overreach", deloadRecommended: true })
    );
    expect(
      container
        .querySelector("svg circle[stroke-dasharray]")
        ?.getAttribute("stroke")
    ).toBe(THEME.amber);
  });

  it("explains the number from its heading, on a tap", () => {
    renderWeeks(warm());
    expect(screen.queryByText(/not a recommendation/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About your score" }));
    expect(
      screen.getByText(/not a recommendation to train harder/)
    ).toBeInTheDocument();
  });
});

describe("PerformanceDetails: the score while the baseline forms", () => {
  it("still shows the score: it is the verdict that was unsupported", () => {
    renderWeeks(COLD);
    expect(within(scoreCard()).getByText("81")).toBeInTheDocument();
  });

  it("hides the change, which is noise against no baseline", () => {
    renderWeeks([
      week("2026-07-26", 40, { loadBand: "low", lifetimeWeeks: 1 }),
      week("2026-08-02", 55, { loadBand: "moderate", lifetimeWeeks: 2 }),
    ]);
    expect(screen.queryByText(/on the 7 days before/)).toBeNull();
  });

  it("draws a first week's ring in the brand's colour, not amber", () => {
    const { container } = renderWeeks([
      week("2026-08-02", 92, {
        loadBand: "overreach",
        deloadRecommended: true,
        lifetimeWeeks: 1,
      }),
    ]);
    expect(
      container
        .querySelector("svg circle[stroke-dasharray]")
        ?.getAttribute("stroke")
    ).toBe(THEME.brand);
  });
});

describe("PerformanceDetails", () => {
  it("shows all of it at once, with no second fold", () => {
    /* The four factors, the load band and the average sat behind a
       "Score details" button inside the page: two taps from the overview.
       Hist6 removed that double fold once already. */
    renderWeeks(warm());
    expect(screen.queryByRole("button", { name: /details/i })).toBeNull();
    expect(scoreCard()).toBeInTheDocument();
    for (const factor of ["Lift load", "Run load", "Recovery", "Adherence"]) {
      expect(screen.getByText(factor)).toBeInTheDocument();
    }
    expect(screen.getByText("Load band")).toBeInTheDocument();
    // One name for the number, "your score": the average is its own.
    expect(screen.getByText(/^\d+-week average$/)).toBeInTheDocument();
    expect(screen.queryByText(/\bPI\b|Performance Index/)).toBeNull();
  });

  it("does not repeat the lead's lifting and running against the usual week", () => {
    renderWeeks(warm());
    expect(screen.queryByText("12.4k kg")).toBeNull();
    expect(screen.queryByText(/usual week/)).toBeNull();
  });

  it("gives the food logged, with the numbers in the numeral face and the words not", () => {
    renderWeeks(warm());
    expect(screen.getByText("6 of 7 days")).toBeInTheDocument();
    const kcal = screen.getByText(groupText(2184));
    expect(kcal.className).toContain("font-mono");
    expect(kcal.parentElement!.textContent).toMatch(
      /kcal and 148 g protein a day, on the days logged/
    );
  });

  it("says the scores could not load, and nothing else", () => {
    mockUsePerformanceWeeks.mockReturnValue({
      weeks: [],
      currentWeek: null,
      loading: false,
      failed: true,
      refresh: vi.fn(),
    });
    render(
      <MemoryRouter>
        <PerformanceDetails />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Performance could not load"
    );
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
      screen.getByRole("button", { name: "Weekly review" })
    ).toBeInTheDocument();
  });

  it("shows no dead row before there is a week to review", () => {
    renderWeeks(warm());
    expect(screen.queryByRole("button", { name: "Weekly review" })).toBeNull();
  });
});
