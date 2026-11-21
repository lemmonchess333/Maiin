/**
 * The top of Progress (App1 Q10): "the single score moves into the
 * details; the page leads with load against your usual and whether you can
 * take more".
 *
 * The lead is the engine's verdict, the verb PI1 locks and its line, over
 * the last seven days' lifting and running against the usual week, with
 * the 0–100 number small beside the window (free, the owner, 18
 * November). The score's own card, history and breakdown are its details,
 * under "Score details", and `PerformanceDetails.test.tsx` holds them.
 *
 * The cases the retired surfaces' tests carried are kept with their
 * reasons: the first-week 81 that read "Peak" over "Establishing your
 * baseline", the overreaching week told it had a "Low training load", and
 * the first session greeted with "No sessions logged yet".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
/* The details are their own module with their own tests, loaded lazily.
   Here they are a marker, so this file is about the lead and its fold. */
vi.mock("@/components/analytics/PerformanceDetails", () => ({
  default: () => <div data-testid="performance-details" />,
}));

import PerformanceSection from "../PerformanceSection";
import { VERB_LABEL } from "@/lib/performanceLine";
import { localDateString, addLocalDays } from "@/lib/dateHelpers";

/** A day `n` days before today, as the engine keys its documents. */
const daysAgo = (n: number) => localDateString(addLocalDays(new Date(), -n));

/** A writer-shaped document: top-level band, NO labels map, exactly as
 *  `functions/lib/perfScoring.js` emits, with the seven days' figures
 *  and the usual week it was scored against. */
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
    aggregates: {
      liftSessions: 4,
      liftTonnage: 16240,
      runSessions: 3,
      runKm: 32.4,
      runLongKm: 14.2,
    },
    baseline: { liftTonnage: 13700, runKm: 28, weeksUsed: 4 },
    adherenceScore: 60,
    signals: { lifetimeWeeks, daysSinceLastTraining: 1 },
  };
}

// Four weeks clears the `establishing` cold-start gate; the newest is today's.
const history = (pi: number, band: string, deload = false) => [
  week(daysAgo(21), 55, "moderate"),
  week(daysAgo(14), 58, "moderate"),
  week(daysAgo(7), 60, "moderate"),
  week(daysAgo(0), pi, band, deload),
];

function serve(weeks: object[], loading = false) {
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks.length ? weeks[weeks.length - 1] : null,
    loading,
  });
}

function renderSection(
  props: Partial<React.ComponentProps<typeof PerformanceSection>> = {}
) {
  return render(
    <MemoryRouter>
      <PerformanceSection hasLoggedSession {...props} />
    </MemoryRouter>
  );
}

const ALL_VERBS = Object.values(VERB_LABEL);
const verbsIn = (el: HTMLElement) =>
  ALL_VERBS.filter(
    (v) => within(el).queryAllByText(new RegExp(`^${v}$`)).length > 0
  );

const lead = () =>
  document.querySelector("[data-performance-lead]") as HTMLElement;

beforeEach(() => {
  mockUsePerformanceWeeks.mockReset();
  cleanup();
});

describe("the lead: load against your usual (App1 Q10)", () => {
  it("carries the number free and small beside the window, never as the hero", () => {
    /* The owner, 18 November: the score's number is free; its history,
       chart and details are Pro. It leads no more (Q10): no ring, and it
       sits at caption rank beside "Last 7 days", under the verdict. */
    serve(history(72, "high"));
    const { container } = renderSection();
    const score = lead().querySelector("[data-lead-score]") as HTMLElement;
    expect(score).toHaveTextContent("Your score 72");
    expect(screen.getAllByText("72")).toHaveLength(1);
    expect(screen.getByText("72").className).not.toMatch(/text-hero|text-4xl/);
    expect(container.querySelector("svg circle[stroke-dasharray]")).toBeNull();
  });

  it("shows the number to a free account too: only the details are Pro", () => {
    serve(history(72, "high"));
    renderSection({ detailsLocked: true });
    expect(lead().querySelector("[data-lead-score]")).toHaveTextContent(
      "Your score 72"
    );
    expect(
      screen.getByRole("button", { name: "Score details, Pro" })
    ).toBeInTheDocument();
  });

  it("leads with the verdict, the screen's largest words", () => {
    serve(history(72, "high"));
    renderSection();
    const verdict = within(lead()).getByText(/^Sharpening$/);
    expect(verdict.className).toMatch(/\btext-hero\b/);
    // Stepping down to the card's width where a long word would not fit
    // (320 pt at the largest text), rather than splitting it.
    expect(verdict.className).toMatch(/min\(var\(--text-hero\),17cqi\)/);
    expect(verdict.parentElement!.className).toMatch(/@container/);
  });

  it("puts the last 7 days' lifting and running beside the usual week", () => {
    serve(history(72, "high"));
    renderSection();
    const list = within(lead()).getByRole("list", {
      name: "Against your usual week",
    });
    expect(within(list).getByText("16.2k kg")).toBeInTheDocument();
    expect(within(list).getByText("13.7k kg")).toBeInTheDocument();
    expect(within(list).getByText("32.4 km")).toBeInTheDocument();
    expect(within(list).getByText("28.0 km")).toBeInTheDocument();
    expect(screen.getByTestId("against-usual-lifting")).toBeInTheDocument();
    expect(screen.getByTestId("against-usual-running")).toBeInTheDocument();
  });

  it.each([
    ["a low week", 30, "low", false, "Building"],
    ["a steady week", 65, "moderate", false, "Steady"],
    ["a high week", 77, "high", false, "Sharpening"],
    ["a high week under a deload flag", 82, "high", true, "Backing off"],
    ["an overreaching week", 90, "overreach", false, "Backing off"],
  ])("names %s with its one locked verb", (_name, pi, band, deload, verb) => {
    serve(history(pi, band, deload));
    const { container } = renderSection();
    expect(verbsIn(container)).toEqual([verb]);
  });

  it("invents no band from the score", () => {
    /* The retired vocabulary. "Peak" and "Moderate" were never in the
       locked taxonomy; they are the tell that a score-derived mapping is
       back. A low-band 30 read "Recovery" under it and a moderate 65
       "Building". */
    serve(history(82, "high"));
    renderSection();
    expect(screen.queryByText(/^(Peak|Moderate|Recovery)$/)).toBeNull();
    cleanup();
    serve(history(30, "low"));
    renderSection();
    expect(screen.queryByText(/^(Peak|Moderate|Recovery)$/)).toBeNull();
  });

  it("resolves the band even when the document stores none", () => {
    // A legacy document: the band is derived from the score.
    const stripped = history(77, "high").map(
      ({ loadBand: _drop, ...rest }) => rest
    );
    serve(stripped);
    const { container } = renderSection();
    expect(verbsIn(container)).toEqual(["Sharpening"]);
  });

  it.each([
    [92, "overreach", false],
    [81, "high", true],
    [62, "moderate", true],
  ])(
    "says to ease off at %s when recovery takes priority, and nothing else",
    (pi, band, deload) => {
      /* The safety case, and "whether you can take more": the engine's
         answer is the verb. This once read "Low training load. Good time
         to recover or increase intensity." to an athlete the engine had
         classed as overreaching. */
      serve(history(pi as number, band as string, deload as boolean));
      renderSection();
      expect(screen.getByText(/^Backing off$/)).toHaveStyle({
        color: "hsl(var(--warning-strong))",
      });
      expect(screen.getAllByText(/ease off this week/i)).toHaveLength(1);
      expect(screen.queryByText(/consider a deload/i)).toBeNull();
      expect(screen.queryByText(/increase intensity/i)).toBeNull();
    }
  );

  it.each([
    ["a low week", 30, "low", false],
    ["a steady week", 65, "moderate", false],
    ["a high week", 77, "high", false],
  ])(
    "answers whether you can take more on screen for %s: no sign to ease off",
    (_name, pi, band, deload) => {
      /* Q10: "whether you can take more", on the card and not only
         behind the ⓘ, in the engine's own terms: it says ease off or it
         says nothing, and nothing is no licence to add to the plan. */
      serve(history(pi as number, band as string, deload as boolean));
      renderSection();
      const line = lead().querySelector("[data-take-more]");
      expect(line).toHaveTextContent(
        "No sign to ease off. Carry on with your plan"
      );
    }
  );

  it("answers it for a week that says back off: ease off rather than add", () => {
    serve(history(90, "overreach"));
    renderSection();
    expect(lead().querySelector("[data-take-more]")).toHaveTextContent(
      "Ease off this week rather than add more"
    );
  });

  it("explains the usual week and the verdict from its heading, on a tap", () => {
    serve(history(72, "high"));
    renderSection();
    // Not printed at rest: help text re-read on every visit.
    expect(screen.queryByText(/means ease off/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "About your usual week" })
    );
    expect(screen.getByText(/Backing off means ease off/)).toBeInTheDocument();
    expect(screen.getByText(/carry on with your plan/)).toBeInTheDocument();
  });
});

describe("the lead names its window (App1 Q13)", () => {
  it("calls a window ending today the last 7 days, never this week", () => {
    serve(history(72, "high"));
    const { container } = renderSection();
    expect(within(lead()).getByText("Last 7 days")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/this week/i);
  });

  it("names an older window by its last day", () => {
    // Someone back after a break keeps the score they last earned.
    serve([
      week("2026-07-12", 55, "moderate"),
      week("2026-07-19", 58, "moderate"),
      week("2026-07-26", 60, "moderate"),
      week("2026-08-02", 72, "high"),
    ]);
    renderSection();
    // The day carries its year once the clock has left 2026 (unit-future
    // runs 90 days ahead).
    const lastDay = new Date().getFullYear() === 2026 ? "2 Aug" : "2 Aug 2026";
    expect(
      within(lead()).getByText(`7 days to ${lastDay}`)
    ).toBeInTheDocument();
    expect(screen.queryByText("Last 7 days")).toBeNull();
  });

  it("does not call the window this week in the verdict's line", () => {
    // The line reads under the window's name; a high week said "Load is
    // high this week" there. It is about the person now, not "load".
    serve(history(77, "high"));
    renderSection();
    expect(
      within(lead()).getByText("You trained more than your usual week")
    ).toBeInTheDocument();
  });
});

describe("the lead while the baseline forms", () => {
  const COLD = [week(daysAgo(0), 81, "high", false, 1)];

  it("does not give a first-week 81 a verdict", () => {
    /* Reported from a device: the gauge read 81 / Peak in a confident
       green over "Establishing your baseline". Every new account lives
       in this window, so it is one of the most-seen states in the app. */
    serve(COLD);
    const { container } = renderSection();
    expect(verbsIn(container)).toEqual([]);
    expect(screen.getByText("Early read")).toBeInTheDocument();
    expect(screen.getByText(/Establishing your week/)).toBeInTheDocument();
  });

  it("states the week's own figures and no usual week to set them against", () => {
    serve(COLD);
    renderSection();
    expect(within(lead()).getByText("16.2k kg")).toBeInTheDocument();
    expect(within(lead()).queryByText(/usual week \d/)).toBeNull();
    expect(screen.queryByTestId("against-usual-lifting")).toBeNull();
  });

  it("says when the usual week forms, in place of whether to take more", () => {
    serve(COLD);
    renderSection();
    expect(lead().querySelector("[data-take-more]")).toHaveTextContent(
      "Your usual week forms once you’ve trained in 3 of 4 weeks. Until then, follow your plan"
    );
  });

  it("does not tell a first week to back off in amber", () => {
    serve([week(daysAgo(0), 92, "overreach", true, 1)]);
    renderSection();
    expect(screen.getByText("Early read")).toHaveStyle({
      color: "hsl(var(--primary-strong))",
    });
    expect(screen.queryByText(/^Backing off$/)).toBeNull();
  });
});

describe("Score details", () => {
  it("is Pro for a free account: a lock, no fold, and the tap asks to open it (Q84)", () => {
    const onToggleDetails = vi.fn();
    serve(history(72, "high"));
    renderSection({ onToggleDetails, detailsLocked: true });
    const row = screen.getByRole("button", { name: "Score details, Pro" });
    expect(row).not.toHaveAttribute("aria-expanded");
    fireEvent.click(row);
    expect(onToggleDetails).toHaveBeenCalledWith(true);
  });

  it("is closed until asked for, and says so", () => {
    serve(history(72, "high"));
    renderSection();
    const row = screen.getByRole("button", { name: "Score details" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("performance-details")).toBeNull();
  });

  it("asks its page to open it", () => {
    const onToggleDetails = vi.fn();
    serve(history(72, "high"));
    renderSection({ onToggleDetails });
    fireEvent.click(screen.getByRole("button", { name: "Score details" }));
    expect(onToggleDetails).toHaveBeenCalledWith(true);
  });

  it("opens in place, under the lead, which stays", async () => {
    const onToggleDetails = vi.fn();
    serve(history(72, "high"));
    const { container } = renderSection({
      detailsOpen: true,
      onToggleDetails,
    });
    const row = screen.getByRole("button", { name: "Score details" });
    expect(row).toHaveAttribute("aria-expanded", "true");
    const details = await screen.findByTestId("performance-details");
    expect(
      details.closest(`#${CSS.escape(row.getAttribute("aria-controls")!)}`)
    ).not.toBeNull();
    expect(verbsIn(container)).toEqual(["Sharpening"]);
    fireEvent.click(row);
    expect(onToggleDetails).toHaveBeenCalledWith(false);
  });
});

describe("the lead before there is a score", () => {
  it("keeps the heading and the card's shape while the week loads (Pol1)", () => {
    // A shorter placeholder dropped everything under it when the week
    // landed.
    serve([], true);
    const { container } = renderSection();
    const section = screen.getByRole("region", { name: "Performance" });
    expect(
      within(section).getByRole("heading", { name: "Performance" })
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-skeleton="performance-card"]')
    ).not.toBeNull();
    // Nothing to open yet, and the row's place is held.
    expect(screen.queryByRole("button", { name: "Score details" })).toBeNull();
  });

  it("fades the card in where its placeholder was, and not when the week was already there (Pol1)", () => {
    /* framer writes a fade's starting opacity inline as it mounts. */
    const fadesIn = () => {
      let el: HTMLElement | null = screen.getByText(/^Sharpening$/);
      while (el) {
        if ((el.getAttribute("style") ?? "").includes("opacity: 0"))
          return true;
        el = el.parentElement;
      }
      return false;
    };
    serve([], true);
    const view = renderSection();
    serve(history(72, "high"));
    view.rerender(
      <MemoryRouter>
        <PerformanceSection hasLoggedSession />
      </MemoryRouter>
    );
    expect(fadesIn()).toBe(true);
    cleanup();

    serve(history(72, "high"));
    renderSection();
    expect(screen.getByText(/^Sharpening$/)).toBeInTheDocument();
    expect(fadesIn()).toBe(false);
  });

  /* The empty branch fires on "the server has not written a score", not
     on "nothing is logged". The score comes from `onWorkoutCreated` /
     `onRunCreated`, so someone who has just saved their first session
     sits here for as long as the trigger takes. It used to greet them
     with "No sessions logged yet" on a page whose next row listed the
     session they had just finished. */
  it("with a session logged, says the score is catching up and offers no next step", () => {
    serve([]);
    const { container } = renderSection({ hasLoggedSession: true });
    expect(
      screen.getByText("Performance is still catching up")
    ).toBeInTheDocument();
    expect(screen.queryByText("No sessions logged yet")).toBeNull();
    expect(screen.queryByText(/start a workout/i)).toBeNull();
    expect(container.querySelector('a[href="/program"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Score details" })).toBeNull();
  });

  it("with nothing logged, points at the first workout", () => {
    serve([]);
    renderSection({ hasLoggedSession: false });
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your last 7 days against your usual week appear after your first session/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start a workout/i })
    ).toBeInTheDocument();
  });
});

describe("Progress hands the section what it needs", () => {
  /* The section defaults `hasLoggedSession` to false, so an unwired call
     site silently restores the old behaviour and every test above still
     passes. This reads the page instead. What it proves is narrow: that
     the props are passed, not that the expressions behind them are
     right. */
  const src = readFileSync(
    resolve(__dirname, "../../..", "pages/History.tsx"),
    "utf8"
  );
  const at = src.indexOf("<PerformanceSection");
  const props = src.slice(at, src.indexOf("/>", at));

  it("whether anything is logged, the reader's unit, and the fold's state", () => {
    expect(props).toMatch(/hasLoggedSession=/);
    // The running figures follow the reader's unit, not a default.
    expect(props).toMatch(/distanceUnit=\{unit\}/);
    expect(props).toMatch(/detailsOpen=\{scoreOpen\}/);
    expect(props).toMatch(/onToggleDetails=\{setScoreOpen\}/);
  });
});
