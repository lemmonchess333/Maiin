import { describe, it, expect } from "vitest";
import { platesPerSide, DEFAULT_BAR_KG } from "../plateMath";

describe("platesPerSide", () => {
  it("decomposes a standard weight exactly", () => {
    // 100kg = bar 20 + 2×40 → per side: 25 + 15
    expect(platesPerSide(100)).toEqual({
      bar: 20,
      perSide: [
        { plate: 25, count: 1 },
        { plate: 15, count: 1 },
      ],
      remainder: 0,
      loadable: 100,
    });
  });

  it("handles small increments (62.5 → 20 + 1.25 per side ... )", () => {
    // 62.5kg = bar 20 + 42.5 total → 21.25/side = 20 + 1.25
    expect(platesPerSide(62.5)).toEqual({
      bar: 20,
      perSide: [
        { plate: 20, count: 1 },
        { plate: 1.25, count: 1 },
      ],
      remainder: 0,
      loadable: 62.5,
    });
  });

  it("bar-only weight → empty perSide, zero remainder", () => {
    expect(platesPerSide(20)).toEqual({
      bar: DEFAULT_BAR_KG,
      perSide: [],
      remainder: 0,
      loadable: 20,
    });
  });

  it("reports the unloadable remainder and nearest loadable weight", () => {
    // 61kg → 20.5/side; greedy: 20 → 0.5/side left → remainder 1kg total.
    const b = platesPerSide(61)!;
    expect(b.remainder).toBe(1);
    expect(b.loadable).toBe(60);
  });

  it("null below the bar", () => {
    expect(platesPerSide(15)).toBeNull();
    expect(platesPerSide(NaN)).toBeNull();
  });

  it("stacks multiple plates of one denomination", () => {
    // 140kg → 60/side = 2×25 + 10
    expect(platesPerSide(140)!.perSide).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
    ]);
  });
});
