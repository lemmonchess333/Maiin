/**
 * PerformanceCard tests — consolidated hero (PI1b).
 *
 * Covers the four locked card states (loading / empty / low-confidence /
 * steady), the verb derivation through getVerb, the data-aware line via
 * getLine, the delta chip presentation/hiding rules, and the a11y wiring
 * (aria-label + aria-describedby sibling without aria-hidden).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PerformanceWeekDoc, PerformanceSignals } from "@/lib/performanceTypes";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import PerformanceCard from "../PerformanceCard";

const ZERO_SIGNALS: PerformanceSignals = {
  bothLoadsStrong: false,
  liftAheadOfBaseline: 0,
  runAheadOfBaseline: 0,
  recoveryWeak: false,
  adherenceWeak: false,
  deloadFlag: false,
  lifetimeWeeks: 0,
  daysSinceLastTraining: 0,
};

function makeWeek(overrides: Partial<PerformanceWeekDoc> = {}): PerformanceWeekDoc {
  return {
    weekKey: "2026-05-19",
    performanceIndex: 72,
    breakdown: {
      liftLoadScore: 75,
      runLoadScore: 75,
      recoveryScore: 70,
      adherenceScore: 80,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {} as PerformanceWeekDoc["aggregates"],
    adherenceScore: 80,
    loadBand: "high",
    confidence: "high",
    deloadRecommended: false,
    signals: { ...ZERO_SIGNALS, lifetimeWeeks: 4 },
    ...overrides,
  };
}

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  navigateMock.mockClear();
});

// ── State 1: loading ──

describe("PerformanceCard — loading state", () => {
  it("renders muted ring + em-dash + no verb while loading", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={true} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    // No verb-label text rendered
    expect(screen.queryByText(/Recovering|Building|Cruising|Sharpening|Backing/)).toBeNull();
  });

  it("loading state still has the Performance label + chrome", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={true} />);
    expect(screen.getByText("Performance")).toBeInTheDocument();
  });

  it("a11y: aria-label communicates loading", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={true} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Performance, loading");
  });
});

// ── State 2: empty ──

describe("PerformanceCard — empty state", () => {
  it("renders em-dash + EMPTY_STATE_LINE when no doc + not loading", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    // Line appears in both the visible <p> and the sr-only sibling.
    const matches = screen.getAllByText(/Your Performance will appear after your first logged session/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("a11y: aria-label says 'no data yet'", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={false} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Performance, no data yet");
  });

  it("empty state is tappable and deep-links to /history#performance", () => {
    renderWith(<PerformanceCard currentWeek={null} previousWeek={null} loading={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/history#performance");
  });
});

// ── State 3: low-confidence ──

describe("PerformanceCard — low-confidence state", () => {
  it("shows verb but hides delta chip when confidence !== 'high'", () => {
    const current = makeWeek({ performanceIndex: 50, loadBand: "moderate", confidence: "low" });
    const previous = makeWeek({ performanceIndex: 30 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={previous} loading={false} />);
    expect(screen.getByText("Cruising")).toBeInTheDocument();
    // delta chip would say "+20 from last week" — should NOT render
    expect(screen.queryByText(/from last week/i)).toBeNull();
  });

  it("medium-confidence also hides delta chip", () => {
    const current = makeWeek({ performanceIndex: 50, loadBand: "moderate", confidence: "medium" });
    const previous = makeWeek({ performanceIndex: 30 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={previous} loading={false} />);
    expect(screen.queryByText(/from last week/i)).toBeNull();
  });
});

// ── State 4: steady ──

describe("PerformanceCard — steady state", () => {
  it("renders PI number, verb 'Sharpening' for high band, and supporting line", () => {
    const current = makeWeek({
      performanceIndex: 75,
      loadBand: "high",
      signals: { ...ZERO_SIGNALS, lifetimeWeeks: 4, bothLoadsStrong: true },
    });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    // useCountUp animates from 0 — the final number isn't synchronously in the DOM.
    // Asserting on verb + line is the reliable steady-state check. The line
    // is duplicated in the sr-only sibling, so getAllByText.
    expect(screen.getByText("Sharpening")).toBeInTheDocument();
    expect(screen.getAllByText(/Both loads strong/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Backing off' verb when deloadRecommended is true (regardless of band)", () => {
    const current = makeWeek({
      performanceIndex: 75,
      loadBand: "high",
      deloadRecommended: true,
      signals: { ...ZERO_SIGNALS, recoveryWeak: true, lifetimeWeeks: 4 },
    });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByText("Backing off")).toBeInTheDocument();
    expect(screen.getAllByText(/Recovery signals down/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Backing off' for overreach band even without deloadRecommended", () => {
    const current = makeWeek({ performanceIndex: 90, loadBand: "overreach" });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByText("Backing off")).toBeInTheDocument();
  });

  it("renders 'Cruising' for moderate band", () => {
    const current = makeWeek({ performanceIndex: 55, loadBand: "moderate" });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByText("Cruising")).toBeInTheDocument();
  });

  it("renders 'Building' for low band (returning user)", () => {
    const current = makeWeek({
      performanceIndex: 30,
      loadBand: "low",
      signals: { ...ZERO_SIGNALS, lifetimeWeeks: 4 },
    });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getAllByText(/Building back up/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Recovering' for deload band", () => {
    const current = makeWeek({ performanceIndex: 15, loadBand: "deload" });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByText("Recovering")).toBeInTheDocument();
  });
});

// ── Delta chip ──

describe("PerformanceCard — delta chip", () => {
  it("renders +N delta chip when previousWeek is set and confidence high", () => {
    const current = makeWeek({ performanceIndex: 75 });
    const previous = makeWeek({ performanceIndex: 60 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={previous} loading={false} />);
    expect(screen.getAllByText(/\+15 from last week/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders negative delta with leading minus", () => {
    const current = makeWeek({ performanceIndex: 50 });
    const previous = makeWeek({ performanceIndex: 70 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={previous} loading={false} />);
    expect(screen.getAllByText(/-20 from last week/i).length).toBeGreaterThanOrEqual(1);
  });

  it("no delta chip when delta is 0", () => {
    const current = makeWeek({ performanceIndex: 60 });
    const previous = makeWeek({ performanceIndex: 60 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={previous} loading={false} />);
    expect(screen.queryByText(/from last week/i)).toBeNull();
  });

  it("no delta chip when previousWeek is null", () => {
    const current = makeWeek({ performanceIndex: 60 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.queryByText(/from last week/i)).toBeNull();
  });
});

// ── A11y ──

describe("PerformanceCard — accessibility", () => {
  it("aria-label format: 'Performance {pi}, {verb}'", () => {
    const current = makeWeek({ performanceIndex: 72, loadBand: "high" });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Performance 72, Sharpening",
    );
  });

  it("aria-describedby points to a SIBLING sr-only span (not aria-hidden)", () => {
    const current = makeWeek({ weekKey: "2026-05-19", performanceIndex: 72 });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    const button = screen.getByRole("button");
    const describedById = button.getAttribute("aria-describedby");
    expect(describedById).toBe("perf-detail-2026-05-19");
    const sibling = document.getElementById(describedById!);
    expect(sibling).toBeInTheDocument();
    expect(sibling).not.toHaveAttribute("aria-hidden");
    expect(sibling).toHaveClass("sr-only");
  });

  it("sr-only sibling carries the supporting line", () => {
    const current = makeWeek({
      performanceIndex: 75,
      loadBand: "high",
      signals: { ...ZERO_SIGNALS, lifetimeWeeks: 4, bothLoadsStrong: true },
    });
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    const sibling = document.getElementById("perf-detail-2026-05-19");
    expect(sibling?.textContent).toMatch(/Both loads strong/i);
  });
});

// ── Tap → navigate ──

describe("PerformanceCard — navigation", () => {
  it("steady state taps to /history#performance", () => {
    const current = makeWeek();
    renderWith(<PerformanceCard currentWeek={current} previousWeek={null} loading={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/history#performance");
  });
});
