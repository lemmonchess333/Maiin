import { describe, it, expect } from "vitest";
import { platesPerSide, DEFAULT_BAR_KG } from "../plateMath";

describe("platesPerSide", () => {
  it("decomposes a standard weight exactly", () => {
    // 100kg = bar 20 + 2×40 → per side: 25 + 15
    expect(platesPerSide(100)).toEqual({
      barKg: 20,
      perSide: [
        { plateKg: 25, count: 1 },
        { plateKg: 15, count: 1 },
      ],
      remainderKg: 0,
      loadableKg: 100,
    });
  });

  it("handles small increments (62.5 → 20 + 1.25 per side ... )", () => {
    // 62.5kg = bar 20 + 42.5 total → 21.25/side = 20 + 1.25
    expect(platesPerSide(62.5)).toEqual({
      barKg: 20,
      perSide: [
        { plateKg: 20, count: 1 },
        { plateKg: 1.25, count: 1 },
      ],
      remainderKg: 0,
      loadableKg: 62.5,
    });
  });

  it("bar-only weight → empty perSide, zero remainder", () => {
    expect(platesPerSide(20)).toEqual({
      barKg: DEFAULT_BAR_KG,
      perSide: [],
      remainderKg: 0,
      loadableKg: 20,
    });
  });

  it("reports the unloadable remainder and nearest loadable weight", () => {
    // 61kg → 20.5/side; greedy: 20 → 0.5/side left → remainder 1kg total.
    const b = platesPerSide(61)!;
    expect(b.remainderKg).toBe(1);
    expect(b.loadableKg).toBe(60);
  });

  it("null below the bar", () => {
    expect(platesPerSide(15)).toBeNull();
    expect(platesPerSide(NaN)).toBeNull();
  });

  it("stacks multiple plates of one denomination", () => {
    // 140kg → 60/side = 2×25 + 10
    expect(platesPerSide(140)!.perSide).toEqual([
      { plateKg: 25, count: 2 },
      { plateKg: 10, count: 1 },
    ]);
  });
});
