/**
 * PerformanceCard — P2 contract tests.
 *
 * Pins the empty state, the rendered PI + delta, the colour-band
 * mapping (positive delta green / negative delta muted, never red),
 * and the deep-link target (/history#performance).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import PerformanceCard from "../PerformanceCard";

function makeWeek(overrides: Partial<PerformanceWeekDoc> = {}): PerformanceWeekDoc {
  return {
    weekKey: "2026-05-10",
    performanceIndex: 72,
    breakdown: {
      liftLoadScore: 30,
      runLoadScore: 30,
      recoveryScore: 70,
      adherenceScore: 80,
    },
    multipliers: {
      liftProgression: 1,
      runVolume: 1,
      runPaceAdjustmentPct: 0,
    },
    aggregates: {} as PerformanceWeekDoc["aggregates"],
    adherenceScore: 80,
    loadBand: "normal",
    // PI1a: signals is required on PerformanceWeekDoc — defaulted to
    // "no notable signal" values matching normalisePerformanceDoc's
    // DEFAULT_SIGNALS so legacy PerformanceCard renders consistently.
    signals: {
      bothLoadsStrong: false,
      liftAheadOfBaseline: 0,
      runAheadOfBaseline: 0,
      recoveryWeak: false,
      adherenceWeak: false,
      deloadFlag: false,
      lifetimeWeeks: 0,
      daysSinceLastTraining: 0,
    },
    ...overrides,
  };
}

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  navigateMock.mockClear();
});

describe("PerformanceCard — empty state", () => {
  it("renders the em-dash gauge and onboarding copy when no week is present", () => {
    renderWith(
      <PerformanceCard currentWeek={null} previousWeek={null} weeksAvailable={0} uid="u-1" />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/Log a few sessions/i)).toBeInTheDocument();
  });

  it("empty state is still tappable and deep-links to performance tab", () => {
    renderWith(
      <PerformanceCard currentWeek={null} previousWeek={null} weeksAvailable={0} uid="u-1" />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/history#performance");
  });
});

describe("PerformanceCard — current week rendering", () => {
  it("renders the rounded PI number", () => {
    renderWith(
      <PerformanceCard
        currentWeek={makeWeek({ performanceIndex: 72.4 })}
        previousWeek={null}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("renders a positive delta with success-green colour (not red)", () => {
    const current = makeWeek({ performanceIndex: 75 });
    const previous = makeWeek({ performanceIndex: 68 });
    renderWith(
      <PerformanceCard
        currentWeek={current}
        previousWeek={previous}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    const deltaEl = screen.getByText("+7");
    expect(deltaEl).toBeInTheDocument();
    // P2d pin 2: success green (#4DB872 → rgb(77, 184, 114) after jsdom
    // normalises the hex). Asserts the colour family, not the literal.
    expect((deltaEl as HTMLElement).style.color).toBe("rgb(77, 184, 114)");
  });

  it("renders a negative delta in muted-foreground (NOT destructive red)", () => {
    const current = makeWeek({ performanceIndex: 60 });
    const previous = makeWeek({ performanceIndex: 75 });
    renderWith(
      <PerformanceCard
        currentWeek={current}
        previousWeek={previous}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    const deltaEl = screen.getByText("-15");
    expect(deltaEl).toBeInTheDocument();
    expect((deltaEl as HTMLElement).style.color).toContain("muted-foreground");
  });

  it("renders insight headline + body from the templates module", () => {
    renderWith(
      <PerformanceCard
        currentWeek={makeWeek({
          performanceIndex: 60,
          breakdown: {
            liftLoadScore: 10,
            runLoadScore: 10,
            recoveryScore: 70,
            adherenceScore: 80,
          },
        })}
        previousWeek={null}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    // Load score sum 20 is low → "Load is light" / "Light week" /
    // "Quiet week". One of the templates renders deterministically
    // from the (uid, weekKey) hash.
    const heading = screen.getByText(/Load is light\.|Light week\.|Quiet week\./i);
    expect(heading).toBeInTheDocument();
  });

  it("renders baseline copy when <4 weeks of data are available", () => {
    renderWith(
      <PerformanceCard
        currentWeek={makeWeek()}
        previousWeek={null}
        weeksAvailable={2}
        uid="u-1"
      />,
    );
    expect(screen.getByText(/Baseline forming\.|Early days\./)).toBeInTheDocument();
  });
});

describe("PerformanceCard — tap target", () => {
  it("deep-links to /history#performance on tap", () => {
    renderWith(
      <PerformanceCard
        currentWeek={makeWeek()}
        previousWeek={null}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/history#performance");
  });

  it("aria-label exposes the PI number to screen readers", () => {
    renderWith(
      <PerformanceCard
        currentWeek={makeWeek({ performanceIndex: 78 })}
        previousWeek={makeWeek({ performanceIndex: 70 })}
        weeksAvailable={6}
        uid="u-1"
      />,
    );
    expect(screen.getByRole("button", { name: /Performance Index 78.*change 8/i })).toBeInTheDocument();
  });
});
