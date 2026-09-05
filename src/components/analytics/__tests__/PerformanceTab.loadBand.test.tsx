/**
 * PerformanceTab — the load-band read, pinned at the COMPONENT.
 *
 * `performanceDocFields.test.ts` proves the resolver; this proves the
 * running copy uses it. Both are needed: the shipped bug was not a broken
 * helper, it was a correct helper fed a field (`labels.loadBand`) that no
 * writer emits, so every lib-level suite stayed green while the Analytics
 * card told every user "Low training load" — including at overreach,
 * where the guidance is the opposite.
 *
 * The fixtures are WRITER-SHAPED on purpose: top-level `loadBand`, no
 * `labels` map, exactly as `functions/lib/perfScoring.js` emits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUsePerformanceWeeks = vi.fn();
// Chart telemetry is unrelated to this copy contract. Keep its provider
// outside the component-test boundary alongside the data subscriptions.
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: (...args: unknown[]) => mockUsePerformanceWeeks(...args),
}));
// WeeklyReviewRow subscribes to Firestore for review eligibility — not
// under test here, and its row is unrelated to the band copy.
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));

import PerformanceTab from "../PerformanceTab";
import { THEME } from "@/lib/theme";

/** A writer-shaped weekly doc: top-level band, NO labels map. */
function week(
  weekKey: string,
  pi: number,
  loadBand: string,
  deloadRecommended = false
) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand,
    deloadRecommended,
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

function renderWith(weeks: ReturnType<typeof week>[]) {
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

// Four weeks clears the `establishing` cold-start gate.
const history = (finalPi: number, finalBand: string, deload = false) => [
  week("2026-07-12", 55, "moderate"),
  week("2026-07-19", 58, "moderate"),
  week("2026-07-26", 60, "moderate"),
  week("2026-08-02", finalPi, finalBand, deload),
];

describe("PerformanceTab — load-band copy (regression: mirror drift)", () => {
  beforeEach(() => mockUsePerformanceWeeks.mockReset());

  it("a HIGH-band week says High training load, not Low", () => {
    // The exact device case: PI 77, which computeLoadBand bands "high".
    renderWith(history(77, "high"));
    expect(screen.getByText(/High training load/)).toBeInTheDocument();
    expect(screen.queryByText(/Low training load/)).toBeNull();
  });

  it("an OVERREACH week tells the user to back off — the safety case", () => {
    /* Pre-fix this rendered "Low training load. Good time to recover or
       increase intensity." to an athlete the engine had classified as
       overreaching — the exact inversion of load-management guidance. */
    renderWith(history(90, "overreach"));
    expect(screen.getByText(/pushing hard/)).toBeInTheDocument();
    expect(screen.queryByText(/increase intensity/)).toBeNull();
  });

  it("a genuinely LOW week still says Low training load", () => {
    renderWith(history(30, "low"));
    expect(screen.getByText(/Low training load/)).toBeInTheDocument();
  });

  it("resolves the band even when the doc stores none (derives from PI)", () => {
    const weeks = history(77, "high");
    // Strip the stored band — a legacy doc. The card must still be right.
    const stripped = weeks.map(({ loadBand: _drop, ...rest }) => rest);
    mockUsePerformanceWeeks.mockReturnValue({
      weeks: stripped,
      currentWeek: stripped[stripped.length - 1],
      loading: false,
    });
    render(
      <MemoryRouter>
        <PerformanceTab />
      </MemoryRouter>
    );
    expect(screen.getByText(/High training load/)).toBeInTheDocument();
  });

  it("renders the deload banner when the engine recommends one", () => {
    /* Second half of the same drift: the gate read `flags?.deloadRecommended`,
       a map no writer emits, so this banner had NEVER rendered — the app's
       primary "back off" signal was dark for every user. */
    renderWith(history(88, "overreach", true));
    expect(screen.getByText(/Consider a deload week/)).toBeInTheDocument();
  });

  it.each([
    [92, "overreach", false],
    [81, "high", true],
    [62, "moderate", true],
  ])(
    "does not celebrate PI %s when recovery takes priority",
    (pi, band, deload) => {
      renderWith(history(pi as number, band as string, deload as boolean));
      const label = screen.getByText(/^Backing off$/);
      expect(label).toHaveStyle({ color: "hsl(var(--warning-strong))" });
      expect(screen.getByText(String(pi))).toHaveStyle({ color: THEME.amber });
      expect(
        screen.getByRole("heading", { name: /Backing off/ })
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Peak$/)).toBeNull();
      expect(
        screen.queryByText(/your training is on track|keep the cadence/)
      ).toBeNull();
    }
  );

  it("keeps the early-read verdict when a first-week document recommends recovery", () => {
    const first = week("2026-08-02", 92, "overreach", true);
    first.signals.lifetimeWeeks = 1;
    renderWith([first]);
    expect(screen.getByText("Early read")).toBeInTheDocument();
    expect(screen.getByText("Establishing your baseline")).toBeInTheDocument();
    expect(screen.queryByText(/^Peak$|^Backing off$/)).toBeNull();
  });

  it("keeps the deload banner hidden when the engine does not recommend one", () => {
    renderWith(history(77, "high", false));
    expect(screen.queryByText(/Consider a deload week/)).toBeNull();
  });
});
