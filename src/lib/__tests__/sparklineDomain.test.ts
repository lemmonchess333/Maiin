import { describe, it, expect } from "vitest";
import { sparklineDomain } from "../sparklineDomain";

/**
 * The property that matters is POSITION WITHIN THE BAND, not the numbers
 * themselves — a sparkline is read as a shape. So each case asserts where
 * the series lands between the domain's floor and ceiling, which is what a
 * viewer actually sees, rather than pinning the padding constant.
 */
function positionOf(value: number, [lo, hi]: [number, number]): number {
  return (value - lo) / (hi - lo);
}

describe("sparklineDomain", () => {
  it("centres a flat series instead of pinning it to the band edge", () => {
    // The defect: Recharts' [0, dataMax] default put a constant series at
    // the very top and filled the whole band beneath it — the solid slab
    // that made Avg Pace look like a different component from the card
    // beside it.
    const domain = sparklineDomain([345, 345, 345, 345]);
    expect(positionOf(345, domain)).toBeCloseTo(0.5, 5);
  });

  it("centres an all-zero series too", () => {
    // A proportional pad is zero here, so the domain would collapse to a
    // point and the chart would render nothing.
    const domain = sparklineDomain([0, 0, 0]);
    expect(domain[0]).toBeLessThan(0);
    expect(domain[1]).toBeGreaterThan(0);
    expect(positionOf(0, domain)).toBeCloseTo(0.5, 5);
  });

  it("gives a varying series the full height of the band", () => {
    // The other half of the same bug: a month of runs between 48 and 52 km
    // drew as a near-flat line because the band ran from 0. Bounded by the
    // data, the 4 km of variation uses most of the band.
    const domain = sparklineDomain([48, 50, 49, 52, 51]);
    const lowest = positionOf(48, domain);
    const highest = positionOf(52, domain);
    expect(highest - lowest).toBeGreaterThan(0.7);
  });

  it("keeps the extremes off the band edges so the stroke is not clipped", () => {
    const domain = sparklineDomain([48, 52]);
    expect(positionOf(48, domain)).toBeGreaterThan(0);
    expect(positionOf(52, domain)).toBeLessThan(1);
  });

  it("does not anchor the floor at zero", () => {
    // Stated directly, because "floor at zero" IS the Recharts default the
    // helper exists to override — a regression that silently removed the
    // YAxis would restore it.
    const [lo] = sparklineDomain([48, 50, 52]);
    expect(lo).toBeGreaterThan(0);
  });

  it("ignores non-finite samples rather than collapsing the domain", () => {
    const domain = sparklineDomain([
      48,
      Number.NaN,
      52,
      Number.POSITIVE_INFINITY,
    ]);
    expect(Number.isFinite(domain[0])).toBe(true);
    expect(Number.isFinite(domain[1])).toBe(true);
    expect(positionOf(50, domain)).toBeCloseTo(0.5, 5);
  });

  it("returns a usable band for an empty series", () => {
    expect(sparklineDomain([])).toEqual([0, 1]);
  });
});
