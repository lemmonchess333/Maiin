import { describe, it, expect } from "vitest";
import { barFillPct, barLabelPct } from "../calorieRingFill";

/**
 * The lockstep property `MacroColumn` claims, as a test.
 *
 * Its comment says the bar "is mode-locked to the big number's direction so
 * both signals move in lockstep" and that this "mirrors the calorie ring's
 * fill direction". The tile and the ring implemented it. The drill-down
 * sheet — the surface a user opens to DISAMBIGUATE the tile — never
 * received the mode and drew consumed% unconditionally.
 *
 * Measured off the Food frames before the fix: the same protein data
 * rendered as a 9.2%-full bar on the tile (8px of an 87px track) and an
 * 88.7%-full bar in the sheet (321px of 362px), one tap apart. Not a
 * rounding difference — opposite directions.
 *
 * The label is tested separately from the fill because a caption can be
 * wrong in a way a bar cannot: a draining bar beside "89%" is worse than
 * either alone, and that is what threading the mode in WITHOUT touching
 * the number would have produced.
 */
describe("barFillPct", () => {
  it("drains in LEFT mode — the bar empties as you log", () => {
    expect(barFillPct(0, "left", false)).toBe(100);
    expect(barFillPct(25, "left", false)).toBe(75);
    expect(barFillPct(100, "left", false)).toBe(0);
  });

  it("fills in EATEN mode — the bar grows as you log", () => {
    expect(barFillPct(0, "eaten", false)).toBe(0);
    expect(barFillPct(25, "eaten", false)).toBe(25);
    expect(barFillPct(100, "eaten", false)).toBe(100);
  });

  it("pins to full when over target in LEFT mode", () => {
    /* The documented reason: a full bar reads as "maxed out, and over by
       N" alongside the big number, whereas draining to empty would read as
       "nothing left to eat" — which is true but says the opposite of what
       the over-target state means. */
    expect(barFillPct(100, "left", true)).toBe(100);
  });

  it("the two modes are genuine opposites, not offsets", () => {
    // The property the sheet violated. At any partial value the two
    // directions must sum to a full bar.
    for (const pct of [0, 9, 37, 63, 89, 100]) {
      expect(
        barFillPct(pct, "left", false) + barFillPct(pct, "eaten", false)
      ).toBe(100);
    }
  });
});

describe("barLabelPct", () => {
  it("prints what the bar shows, in both modes", () => {
    for (const pct of [0, 9, 37, 63, 89, 100]) {
      expect(barLabelPct(pct, "left")).toBe(barFillPct(pct, "left", false));
      expect(barLabelPct(pct, "eaten")).toBe(barFillPct(pct, "eaten", false));
    }
  });

  it("never prints a negative remainder when over target", () => {
    // `clampPct` should prevent it, but a caption reading "-12%" is the
    // kind of thing that ships.
    expect(barLabelPct(112, "left")).toBe(0);
  });
});
