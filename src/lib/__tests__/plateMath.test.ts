import { describe, it, expect } from "vitest";
import {
  platesPerSide,
  platesInKit,
  buildWarmupRamp,
  DEFAULT_BAR_KG,
  LIGHT_BAR_KG,
  LIGHT_BAR_LB,
} from "../plateMath";
import { lbToKg } from "../weightUnits";

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

describe("platesInKit with smallPlates and light bars", () => {
  it("loads 1.25 kg micro-steps cleanly in metric when smallPlates is enabled", () => {
    // 61.25 kg = 20 bar + 2 × (20 + 0.625)
    expect(platesInKit(61.25, "kg", { smallPlates: true })).toEqual({
      bar: 20,
      perSide: [
        { plate: 20, count: 1 },
        { plate: 0.625, count: 1 },
      ],
      remainder: 0,
      loadable: 61.25,
    });
  });

  it("loads 2.5 lb micro-steps cleanly in lb when smallPlates is enabled", () => {
    // 137.5 lb = 45 bar + 2 × (45 + 1.25)
    expect(platesInKit(lbToKg(137.5), "lbs", { smallPlates: true })).toEqual({
      bar: 45,
      perSide: [
        { plate: 45, count: 1 },
        { plate: 1.25, count: 1 },
      ],
      remainder: 0,
      loadable: 137.5,
    });
  });

  it("supports 15 kg and 35 lb light bars", () => {
    expect(platesInKit(55, "kg", { barWeight: LIGHT_BAR_KG })).toEqual({
      bar: 15,
      perSide: [{ plate: 20, count: 1 }],
      remainder: 0,
      loadable: 55,
    });
    expect(
      platesInKit(lbToKg(125), "lbs", { barWeight: LIGHT_BAR_LB })
    ).toEqual({
      bar: 35,
      perSide: [{ plate: 45, count: 1 }],
      remainder: 0,
      loadable: 125,
    });
  });
});

describe("buildWarmupRamp", () => {
  it("builds bar, 50%, 70%, and 85% loadable steps for a 100 kg working set", () => {
    const ramp = buildWarmupRamp(100, "kg");
    expect(ramp.map((s) => [s.label, s.weight, s.reps])).toEqual([
      ["Bar", 20, 8],
      ["50%", 50, 5],
      ["70%", 70, 3],
      ["85%", 85, 1],
    ]);
    expect(ramp[0].breakdown.perSide).toEqual([]);
    expect(ramp[1].breakdown.perSide).toEqual([{ plate: 15, count: 1 }]);
  });

  it("deduplicates steps that round to the empty bar on lighter working weights", () => {
    // 40 kg: 50% = 20 kg duplicates the bar, so only Bar, 70% (27.5), 85% (35) remain.
    const ramp = buildWarmupRamp(40, "kg");
    expect(ramp.map((s) => [s.label, s.weight])).toEqual([
      ["Bar", 20],
      ["70%", 27.5],
      ["85%", 35],
    ]);
  });

  it("returns an empty ramp when working weight is at or below the bar", () => {
    expect(buildWarmupRamp(20, "kg")).toEqual([]);
    expect(buildWarmupRamp(15, "kg")).toEqual([]);
  });

  it("respects lb kits, light bars, and smallPlates rounding steps", () => {
    const ramp = buildWarmupRamp(lbToKg(225), "lbs", {
      barWeight: LIGHT_BAR_LB,
      smallPlates: true,
    });
    expect(ramp[0]).toMatchObject({ label: "Bar", weight: 35, reps: 8 });
    expect(ramp.every((s) => s.breakdown.remainder === 0)).toBe(true);
    expect(ramp.every((s) => s.weight < 225)).toBe(true);
  });
});
