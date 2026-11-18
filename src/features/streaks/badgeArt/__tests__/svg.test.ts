import { describe, expect, it } from "vitest";
import { HEX, grey, hexPath, insetPolygon, mix, numeralPath } from "../svg";
import { BADGE_NUMERALS } from "../numerals.data";

/** Every coordinate pair in a path made of M, L, Q, C and Z. */
function points(d: string): [number, number][] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe("badge art geometry", () => {
  it("keeps the medal frame every badge has shipped in", () => {
    const xs = HEX.map((p) => p[0]);
    const ys = HEX.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(5.5);
    expect(Math.max(...xs)).toBe(94.5);
    expect(Math.min(...ys)).toBe(0.5);
    expect(Math.max(...ys)).toBe(99.5);
  });

  it("moves every edge in by the inset", () => {
    const inner = insetPolygon(HEX, 4);
    // The vertical sides move in by exactly the inset.
    expect(inner[1][0]).toBeCloseTo(90.5, 5);
    expect(inner[4][0]).toBeCloseTo(9.5, 5);
    for (const [x, y] of inner) {
      expect(x).toBeGreaterThan(5.5);
      expect(x).toBeLessThan(94.5);
      expect(y).toBeGreaterThan(0.5);
      expect(y).toBeLessThan(99.5);
    }
  });

  it("draws the hexagon as one closed path inside the box", () => {
    const d = hexPath(0, 5);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(5.5);
      expect(x).toBeLessThanOrEqual(94.5);
      expect(y).toBeGreaterThanOrEqual(0.5);
      expect(y).toBeLessThanOrEqual(99.5);
    }
  });
});

describe("badge numerals", () => {
  it("has every figure the badges are for", () => {
    for (const ch of "0123456789Kkmt.:") {
      expect(BADGE_NUMERALS.glyphs).toHaveProperty(ch);
    }
  });

  it("is path data a badge can move without a parser", () => {
    for (const g of Object.values(BADGE_NUMERALS.glyphs)) {
      expect(g.d).toMatch(/^[MLQCZ0-9 -]+$/);
    }
  });

  it("sets a figure on its baseline at the cap height asked for", () => {
    const { d, capHeight } = numeralPath("7", {
      cx: 50,
      baseline: 77,
      capHeight: 24,
      maxWidth: 60,
    });
    expect(capHeight).toBeCloseTo(24, 5);
    const ys = points(d).map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(77.5);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(77 - 24 - 1);
  });

  it("shrinks a long figure to its width and centres it", () => {
    const { d, width } = numeralPath("42.2", {
      cx: 50,
      baseline: 77,
      capHeight: 24,
      maxWidth: 60,
    });
    expect(width).toBeLessThanOrEqual(60.01);
    const xs = points(d).map((p) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(19.9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(80.1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(50, 0);
  });
});

describe("badge colour steps", () => {
  it("mixes between two colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#7b72e9", "#7b72e9", 0.3)).toBe("#7b72e9");
  });

  it("greys a colour at its own lightness", () => {
    const g = grey("#7B72E9");
    expect(g.slice(1, 3)).toBe(g.slice(3, 5));
    expect(g.slice(3, 5)).toBe(g.slice(5, 7));
  });
});
