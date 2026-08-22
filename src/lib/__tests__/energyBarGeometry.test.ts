import { describe, it, expect } from "vitest";
import { energyBarGeometry, ENERGY_BAR_MAX_PCT } from "../energyBarGeometry";

describe("energyBarGeometry", () => {
  it("draws no target tick while the track still ends at target", () => {
    // The defect. Under target the track's right end IS target, so the
    // tick was a 2px sliver at left:100% — hanging off the rounded end,
    // marking a boundary that was already marked. Visible in the Home
    // capture as a stray glyph beside the bar.
    for (const pct of [0, 1, 42, 85.9, 100]) {
      expect(
        energyBarGeometry(pct).tickPct,
        `${pct}% should not draw a target tick`
      ).toBeNull();
    }
  });

  it("draws the tick once the track stretches past target", () => {
    const { tickPct } = energyBarGeometry(120);
    expect(tickPct).not.toBeNull();
    // Track runs to 120% of target, so target sits at 100/120.
    expect(tickPct).toBeCloseTo(83.33, 1);
  });

  it("puts the tick where target actually is, at every stretch", () => {
    // The property, rather than one arithmetic case: whatever the track's
    // extent, the tick's fraction times that extent is target.
    for (const pct of [101, 110, 125, 130, 200]) {
      const extent = Math.min(Math.max(pct, 100), ENERGY_BAR_MAX_PCT);
      const { tickPct } = energyBarGeometry(pct);
      expect((tickPct! / 100) * extent).toBeCloseTo(100, 6);
    }
  });

  it("stops stretching at the cap, and the fill pins to the end past it", () => {
    // Beyond 130% the track cannot grow, so the fill saturates — but the
    // tick must stay put rather than sliding with the overshoot.
    const at130 = energyBarGeometry(130);
    const at200 = energyBarGeometry(200);
    expect(at130.barWidth).toBe(100);
    expect(at200.barWidth).toBe(100);
    expect(at200.tickPct).toBeCloseTo(at130.tickPct!, 6);
  });

  it("fills proportionally below target", () => {
    expect(energyBarGeometry(0).barWidth).toBe(0);
    expect(energyBarGeometry(50).barWidth).toBeCloseTo(50, 6);
    expect(energyBarGeometry(100).barWidth).toBe(100);
  });

  it("treats a negative or non-finite percentage as zero", () => {
    // `calories / target` with a zero or missing target reaches here as
    // Infinity or NaN; neither may produce a NaN width in the style prop.
    for (const bad of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const g = energyBarGeometry(bad);
      expect(Number.isFinite(g.barWidth), `${bad} produced ${g.barWidth}`).toBe(
        true
      );
      expect(g.barWidth).toBeGreaterThanOrEqual(0);
      expect(g.barWidth).toBeLessThanOrEqual(100);
    }
  });
});
