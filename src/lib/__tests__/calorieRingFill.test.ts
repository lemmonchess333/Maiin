import { describe, it, expect } from "vitest";
import { barFillPct, barLabelPct } from "../calorieRingFill";

/**
 * Every calorie and macro bar fills with what was eaten, whichever way the
 * person reads the day (DS4, 7 November 2026). An empty morning is a grey
 * track, not a full orange ring (DESIGN_GUIDE §14m rules 16 and 33); only
 * the number and its words follow the mode. The ring, the tiles and the
 * breakdown sheet read this one function, so the three cannot disagree.
 */
describe("barFillPct", () => {
  it("fills with what was eaten", () => {
    expect(barFillPct(0)).toBe(0);
    expect(barFillPct(25)).toBe(25);
    expect(barFillPct(100)).toBe(100);
  });

  it("is full over target, where the ring draws its overshoot lap", () => {
    expect(barFillPct(100, true)).toBe(100);
    expect(barFillPct(112)).toBe(100);
  });

  it("never draws less than an empty track", () => {
    expect(barFillPct(-4)).toBe(0);
  });
});

describe("barLabelPct", () => {
  it("prints what the bar shows", () => {
    for (const pct of [0, 9, 37, 63, 89, 100])
      expect(barLabelPct(pct)).toBe(barFillPct(pct));
  });

  it("never prints past 100 or below 0", () => {
    expect(barLabelPct(112)).toBe(100);
    expect(barLabelPct(-3)).toBe(0);
  });
});
