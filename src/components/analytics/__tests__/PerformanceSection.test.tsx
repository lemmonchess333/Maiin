/**
 * The Performance section: the one place the score is shown (Trim1 call 5).
 *
 * It was shown three ways. Home's row and the overview's card read the
 * taxonomy PI1 locks, derived from (loadBand, deloadRecommended); the
 * gauge on the Performance page once derived its own band from the SCORE
 * alone (Peak / Building / Moderate / Recovery), so one week had two
 * names, and a parity test rendered both surfaces to hold them together.
 * There is one surface now, so what that test protected is asserted here
 * directly: the locked verb, once, and none of the retired vocabulary.
 *
 * The cases the retired surfaces' tests carried are kept with their
 * reasons: the held-level week that read "+0 pts" in green, the
 * first-week 81 that read "Peak" over "Establishing your baseline", the
 * overreaching week told it had a "Low training load", and the first
 * session greeted with "No sessions logged yet".
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
   Here they are a marker, so this file is about the card and its fold. */
vi.mock("@/components/analytics/PerformanceDetails", () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="performance-details">{children}</div>
  ),
}));

import PerformanceSection from "../PerformanceSection";
import { VERB_LABEL } from "@/lib/performanceLine";
import { THEME } from "@/lib/theme";

/** A writer-shaped weekly doc: top-level band, NO labels map, exactly as
 *  `functions/lib/perfScoring.js` emits. */
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

// Four weeks clears the `establishing` cold-start gate.
const history = (pi: number, band: string, deload = false) => [
  week("2026-07-12", 55, "moderate"),
  week("2026-07-19", 58, "moderate"),
  week("2026-07-26", 60, "moderate"),
  week("2026-08-02", pi, band, deload),
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

beforeEach(() => {
  mockUsePerformanceWeeks.mockReset();
  cleanup();
});

describe("the Performance card", () => {
  it("shows the week's index once, inside its ring, and the change on last week", () => {
    serve(history(72, "high"));
    const { container } = renderSection();
    const score = screen.getByText("72");
    // The ring is the element the score sits in: §3f's "the ring in the
    // band's colour with the score in it", not digits beside a ring.
    const ring = score.closest("div.relative");
    expect(ring?.querySelector("svg circle")).not.toBeNull();
    expect(screen.getAllByText("72")).toHaveLength(1);
    expect(screen.getByText("Up 12 on last week")).toBeInTheDocument();
    expect(
      container.querySelectorAll("svg circle[stroke-dasharray]")
    ).toHaveLength(1);
  });

  it("draws the ring in rem, so the score still fits at larger text", () => {
    serve(history(72, "high"));
    renderSection();
    const ring = screen.getByText("72").closest("div.relative") as HTMLElement;
    expect(ring.style.width).toMatch(/rem$/);
    expect(ring.style.height).toBe(ring.style.width);
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
    "does not celebrate a %s when recovery takes priority",
    (pi, band, deload) => {
      /* The safety case. This once read "Low training load. Good time to
         recover or increase intensity." to an athlete the engine had
         classed as overreaching. */
      serve(history(pi as number, band as string, deload as boolean));
      const { container } = renderSection();
      expect(screen.getByText(/^Backing off$/)).toHaveStyle({
        color: "hsl(var(--warning-strong))",
      });
      expect(
        container
          .querySelector("svg circle[stroke-dasharray]")
          ?.getAttribute("stroke")
      ).toBe(THEME.amber);
      expect(screen.getAllByText(/ease off this week/i)).toHaveLength(1);
      expect(screen.queryByText(/consider a deload/i)).toBeNull();
      expect(screen.queryByText(/increase intensity/i)).toBeNull();
    }
  );

  it("says nothing about a week that held level", () => {
    /* A device screenshot, 13 August 2026: a held-level week read
       "+0 pts" in the app's green. Zero is the one value whose sign
       carries nothing, so the chip has nothing to add. */
    serve(history(60, "moderate"));
    renderSection();
    expect(screen.queryByText(/on last week/)).toBeNull();
    expect(screen.queryByText(/[+−-]0\b/)).toBeNull();
  });

  it("still reports a real drop", () => {
    // Suppressing zero must not suppress a decline, which is the signal
    // a person needs to act on.
    serve(history(52, "moderate"));
    renderSection();
    expect(screen.getByText("Down 8 on last week")).toBeInTheDocument();
  });

  it("dates its line by the weeks it draws", () => {
    serve(history(72, "high"));
    renderSection();
    // The newest score here is weeks old: its date, not "This week".
    expect(screen.getByText("12 Jul")).toBeInTheDocument();
    expect(screen.getByText("2 Aug")).toBeInTheDocument();
    expect(screen.queryByText("This week")).toBeNull();
  });

  it("explains the number from its heading", () => {
    serve(history(72, "high"));
    renderSection();
    expect(
      screen.getByRole("button", { name: "About Performance Index" })
    ).toBeInTheDocument();
  });
});

describe("the Performance card while the baseline forms", () => {
  const COLD = [week("2026-08-02", 81, "high", false, 1)];

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

  it("still shows the score: it is the verdict that was unsupported", () => {
    serve(COLD);
    renderSection();
    expect(screen.getByText("81")).toBeInTheDocument();
  });

  it("hides the change, which is noise against no baseline", () => {
    serve([
      week("2026-07-26", 40, "low", false, 1),
      week("2026-08-02", 55, "moderate", false, 2),
    ]);
    renderSection();
    expect(screen.queryByText(/on last week/)).toBeNull();
  });

  it("does not tell a first week to back off in amber", () => {
    serve([week("2026-08-02", 92, "overreach", true, 1)]);
    const { container } = renderSection();
    expect(screen.getByText("Early read")).toHaveStyle({
      color: "hsl(var(--primary-strong))",
    });
    expect(
      container
        .querySelector("svg circle[stroke-dasharray]")
        ?.getAttribute("stroke")
    ).toBe(THEME.brand);
    expect(screen.queryByText(/^Backing off$/)).toBeNull();
  });
});

describe("Score details", () => {
  it("is Pro for a free account: a lock, no fold, and the tap asks to open it (Q84)", () => {
    const onToggleDetails = vi.fn();
    serve(history(72, "high"));
    renderSection({ onToggleDetails, detailsLocked: true });
    const row = screen.getByRole("button", { name: "Score details Pro" });
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

  it("opens in place, with what its page hands it inside", async () => {
    const onToggleDetails = vi.fn();
    serve(history(72, "high"));
    renderSection({
      detailsOpen: true,
      onToggleDetails,
      children: <p>Training load</p>,
    });
    const row = screen.getByRole("button", { name: "Score details" });
    expect(row).toHaveAttribute("aria-expanded", "true");
    const details = await screen.findByTestId("performance-details");
    expect(within(details).getByText("Training load")).toBeInTheDocument();
    expect(
      details.closest(`#${CSS.escape(row.getAttribute("aria-controls")!)}`)
    ).not.toBeNull();
    fireEvent.click(row);
    expect(onToggleDetails).toHaveBeenCalledWith(false);
  });

  it("draws the weeks once: the card's line gives way to the chart in the details", () => {
    serve(history(72, "high"));
    const closed = renderSection();
    expect(
      closed.container.querySelector("[data-performance-trend]")
    ).not.toBeNull();
    cleanup();
    serve(history(72, "high"));
    const open = renderSection({ detailsOpen: true });
    expect(open.container.querySelector("[data-performance-trend]")).toBeNull();
    // The score and its verb stay.
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(verbsIn(open.container)).toEqual(["Sharpening"]);
  });
});

describe("the Performance card before it has a score", () => {
  it("keeps the heading and the card's shape while the week loads (Pol1)", () => {
    // A shorter placeholder dropped everything under it when the score
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
      let el: HTMLElement | null = screen.getByText("72");
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
    expect(screen.getByText("72")).toBeInTheDocument();
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
        /Your Performance will appear after your first logged session/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start a workout/i })
    ).toBeInTheDocument();
  });
});

describe("Analytics hands the section what it needs", () => {
  /* The section defaults `hasLoggedSession` to false, so an unwired call
     site silently restores the old behaviour and every test above still
     passes. This reads the page instead. What it proves is narrow: that
     the props are passed, not that the expressions behind them are
     right. */
  const src = readFileSync(
    resolve(__dirname, "../../..", "pages/History.tsx"),
    "utf8"
  );
  const mount = src.slice(src.indexOf("<PerformanceSection"));
  const props = mount.slice(0, mount.indexOf("</PerformanceSection>"));

  it("whether anything is logged, the reader's unit, and the fold's state", () => {
    expect(props).toMatch(/hasLoggedSession=/);
    // The running figures follow the reader's unit, not a default.
    expect(props).toMatch(/distanceUnit=\{unit\}/);
    expect(props).toMatch(/detailsOpen=\{scoreOpen\}/);
    expect(props).toMatch(/onToggleDetails=\{setScoreOpen\}/);
  });

  it("the training load, inside the details", () => {
    expect(props).toMatch(/<TrainingLoadCard/);
  });
});
