import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach } from "vitest";

/**
 * The Performance Index gauge's three scale labels, which were drawn
 * inside the arc they label.
 *
 * The ring is 12 units wide with round caps, so near each end it
 * occupies x 14..26 / 154..166 across y 84..96, and it crosses y 14 at
 * the top. "0" and "100" sat at baseline 98 and "50" at baseline 16 —
 * so the upper half of each end label was under a cap and the last two
 * pixels of "50" were on the amber. SVG paints text last, so nothing
 * was hidden; a 10px numeral crowded onto a 12px ring simply reads as a
 * broken glyph, which is what the rich-history capture showed.
 *
 * WHY THIS IS A GEOMETRY TEST AND NOT A SNAPSHOT: jsdom has no layout,
 * so `getBBox` is unavailable and a DOM query cannot see a collision —
 * `getByText("0")` passes whether the glyph is legible or buried. The
 * numbers below come out of the rendered SVG's own attributes (the arc
 * endpoints and radius are parsed from the path's `d`, the ring width
 * from `stroke-width`), so the assertion tracks the component rather
 * than a transcription of it: move the arc and the expected clearance
 * moves with it.
 *
 * The one thing that cannot be read from the DOM is how much ink a
 * glyph puts down. Measured off the capture at fontSize 10 (Archivo,
 * the numeral face): 5.6 units of advance per digit and 7.6 of cap
 * height. The constants below are rounded UP from those, so every
 * clearance this file asserts is a lower bound on the real one.
 */

const mockUsePerformanceWeeks = vi.fn();
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: (...args: unknown[]) => mockUsePerformanceWeeks(...args),
}));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));

/** Conservative — measured 0.56 / 0.76 em; see the header. */
const DIGIT_ADVANCE_EM = 0.62;
const CAP_HEIGHT_EM = 0.82;

/** Clear air demanded between a label's ink and the ring's. */
const MIN_GAP = 2;

type Box = { x0: number; x1: number; y0: number; y1: number };

function textBox(t: SVGTextElement): Box {
  const x = Number(t.getAttribute("x"));
  const y = Number(t.getAttribute("y"));
  const size = Number(
    t.getAttribute("fontSize") ?? t.getAttribute("font-size")
  );
  expect(size, "label has no fontSize").toBeGreaterThan(0);
  expect(t.getAttribute("text-anchor") ?? t.getAttribute("textAnchor")).toBe(
    "middle"
  );
  const half = (t.textContent!.trim().length * DIGIT_ADVANCE_EM * size) / 2;
  return {
    x0: x - half,
    x1: x + half,
    y0: y - CAP_HEIGHT_EM * size, // baseline minus cap height
    y1: y, // digits have no descender
  };
}

/**
 * The ring's occupied region, read off the arc path. `d` is
 * `M sx sy A r r 0 0 1 ex ey` — a semicircle opening downward, so the
 * centre is the midpoint of the chord and the round caps hang straight
 * down from each end by half the stroke width.
 */
function ring(path: SVGPathElement) {
  const d = path.getAttribute("d")!;
  const m = d.match(
    /^M\s+([\d.-]+)\s+([\d.-]+)\s+A\s+([\d.-]+)\s+[\d.-]+\s+0\s+0\s+1\s+([\d.-]+)\s+([\d.-]+)$/
  );
  expect(m, `arc path not in the expected form: ${d}`).not.toBeNull();
  const [sx, sy, r, ex, ey] = m!.slice(1).map(Number);
  const w = Number(path.getAttribute("stroke-width"));
  expect(w, "arc has no stroke-width").toBeGreaterThan(0);
  const half = w / 2;
  return {
    cx: (sx + ex) / 2,
    cy: sy,
    r,
    half,
    /** Round cap at an endpoint: a disc of radius `half` centred there. */
    leftCap: { cx: sx, cy: sy, r: half },
    rightCap: { cx: ex, cy: ey, r: half },
    /** Outermost ink at the apex. */
    topY: sy - r - half,
    /** Both endpoints sit on the same y; caps reach `half` below it. */
    bottomY: ey + half,
  };
}

function distanceToDisc(
  b: Box,
  disc: { cx: number; cy: number; r: number }
): number {
  // Nearest point of the box to the disc centre.
  const nx = Math.min(Math.max(disc.cx, b.x0), b.x1);
  const ny = Math.min(Math.max(disc.cy, b.y0), b.y1);
  return Math.hypot(disc.cx - nx, disc.cy - ny) - disc.r;
}

import PerformanceTab from "../PerformanceTab";

afterEach(cleanup);

/** A writer-shaped weekly doc, matching PerformanceTab.loadBand's fixtures. */
function week(weekKey: string, pi: number, loadBand: string) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand,
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 70,
      runLoadScore: 70,
      recoveryScore: 60,
      adherenceScore: 60,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {},
    adherenceScore: 60,
    signals: { lifetimeWeeks: 8, daysSinceLastTraining: 1 },
  };
}

function gauge(score: number) {
  const weeks = [
    week("2026-07-12", 55, "moderate"),
    week("2026-07-19", 58, "moderate"),
    week("2026-07-26", 60, "moderate"),
    week("2026-08-02", score, "high"),
  ];
  mockUsePerformanceWeeks.mockReturnValue({
    weeks,
    currentWeek: weeks[weeks.length - 1],
    loading: false,
  });
  const { container } = render(
    <MemoryRouter>
      <PerformanceTab />
    </MemoryRouter>
  );
  const svg = container.querySelector("svg")!;
  return {
    labels: Array.from(
      svg.querySelectorAll("text")
    ) as unknown as SVGTextElement[],
    arc: svg.querySelector("path") as SVGPathElement,
    svg,
  };
}

describe("PI gauge — the scale labels sit off the ring", () => {
  it("keeps 0 and 100 clear of the round caps", () => {
    const { labels, arc } = gauge(92);
    const r = ring(arc);
    const zero = labels.find((t) => t.textContent!.trim() === "0")!;
    const hundred = labels.find((t) => t.textContent!.trim() === "100")!;
    expect(zero, "no 0 label").toBeTruthy();
    expect(hundred, "no 100 label").toBeTruthy();

    for (const [name, label, cap] of [
      ["0", zero, r.leftCap],
      ["100", hundred, r.rightCap],
    ] as const) {
      const gap = distanceToDisc(textBox(label), cap);
      expect(
        gap,
        `the "${name}" label's ink comes within ${gap.toFixed(2)} of the ` +
          `arc's round cap — it needs ${MIN_GAP}`
      ).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });

  it("keeps 50 clear of the apex", () => {
    const { labels, arc } = gauge(92);
    const r = ring(arc);
    const fifty = labels.find((t) => t.textContent!.trim() === "50")!;
    const b = textBox(fifty);
    // The apex is the ring's highest ink; the label sits above it.
    const gap = r.topY - b.y1;
    expect(
      gap,
      `the "50" label's baseline is ${gap.toFixed(2)} from the top of the ` +
        `arc — it needs ${MIN_GAP}`
    ).toBeGreaterThanOrEqual(MIN_GAP);
  });

  it("draws every label inside the viewBox", () => {
    const { labels, svg } = gauge(92);
    const [vx, vy, vw, vh] = svg
      .getAttribute("viewBox")!
      .split(/\s+/)
      .map(Number);
    for (const t of labels) {
      const b = textBox(t);
      const label = t.textContent!.trim();
      expect(
        b.x0,
        `"${label}" overflows the viewBox left`
      ).toBeGreaterThanOrEqual(vx);
      expect(
        b.x1,
        `"${label}" overflows the viewBox right`
      ).toBeLessThanOrEqual(vx + vw);
      expect(
        b.y0,
        `"${label}" overflows the viewBox top`
      ).toBeGreaterThanOrEqual(vy);
      expect(
        b.y1,
        `"${label}" overflows the viewBox bottom`
      ).toBeLessThanOrEqual(vy + vh);
    }
  });
});
