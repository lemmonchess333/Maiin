import { describe, it, expect, vi } from "vitest";
import { getDistanceComparison, getVolumeComparison } from "../funComparisons";

describe("getDistanceComparison", () => {
  it("returns null for 0 km", () => {
    expect(getDistanceComparison(0)).toBeNull();
  });

  it("returns null for very small distance below all thresholds", () => {
    expect(getDistanceComparison(0.01)).toBeNull();
  });

  it("returns a string for 0.05 km (meets Olympic pool threshold)", () => {
    // 0.05 km meets the Olympic pool threshold (0.05)
    const result = getDistanceComparison(0.05);
    expect(result).toBeTypeOf("string");
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns a string for 1 km", () => {
    // 1 km meets thresholds: 0.25, 0.1, 1, 0.05
    const result = getDistanceComparison(1);
    expect(result).toBeTypeOf("string");
  });

  it("returns a string for 5 km (meets all thresholds)", () => {
    const result = getDistanceComparison(5);
    expect(result).toBeTypeOf("string");
  });

  it("returns a string for 10 km", () => {
    const result = getDistanceComparison(10);
    expect(result).toBeTypeOf("string");
  });

  it("returns correct Tower Bridge comparison for known value", () => {
    // Seed Math.random to always pick first eligible
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 0.25 km, eligible: threshold 0.25, 0.1, 0.05
    // sorted by filter order: Tower Bridges (0.25), football pitches (0.1), Olympic pools (0.05)
    // random=0 picks index 0 => Tower Bridges
    const result = getDistanceComparison(0.25);
    expect(result).toBe(`That's ${Math.round(0.25 * 1000 / 268)} Tower Bridges long`);
    vi.restoreAllMocks();
  });

  it("returns correct football pitches comparison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 0.1 km, eligible: threshold 0.1 (football pitches) and 0.05 (Olympic pools)
    // random=0 picks index 0 => football pitches
    const result = getDistanceComparison(0.1);
    expect(result).toBe(`That's ${Math.round(0.1 * 1000 / 100)} football pitches`);
    vi.restoreAllMocks();
  });

  it("returns correct Olympic pool comparison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At exactly 0.05, only Olympic pools eligible
    const result = getDistanceComparison(0.05);
    expect(result).toBe(`That's ${Math.round(0.05 * 1000 / 50)} Olympic pool lengths`);
    vi.restoreAllMocks();
  });

  it("can return Great Wall comparison for large distances", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    // At 10 km, all 5 comparisons eligible. random=0.99 => floor(0.99*5)=4 => Great Wall (index 4)
    const result = getDistanceComparison(10);
    expect(result).toBe(`That's a ${(10 / 8.851).toFixed(1)}× Great Wall section`);
    vi.restoreAllMocks();
  });

  it("returns Eiffel Tower comparison for 1 km with seeded random", () => {
    // At 1 km, eligible: thresholds 0.25, 0.1, 1, 0.05 (4 items)
    // index 2 => Eiffel Towers
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    // floor(0.5 * 4) = 2 => Eiffel Towers
    const result = getDistanceComparison(1);
    expect(result).toBe(`That's ${Math.round(1 * 1000 / 324)} Eiffel Towers stacked`);
    vi.restoreAllMocks();
  });
});

describe("getVolumeComparison", () => {
  it("returns null for 0 kg", () => {
    expect(getVolumeComparison(0)).toBeNull();
  });

  it("returns null for weight below all thresholds", () => {
    expect(getVolumeComparison(10)).toBeNull();
  });

  it("returns a string for 50 kg (meets washing machine threshold)", () => {
    const result = getVolumeComparison(50);
    expect(result).toBeTypeOf("string");
  });

  it("returns a string for 100 kg", () => {
    const result = getVolumeComparison(100);
    expect(result).toBeTypeOf("string");
  });

  it("returns a string for 1000 kg", () => {
    const result = getVolumeComparison(1000);
    expect(result).toBeTypeOf("string");
  });

  it("returns a string for 1500 kg (meets all thresholds)", () => {
    const result = getVolumeComparison(1500);
    expect(result).toBeTypeOf("string");
  });

  it("returns correct washing machine comparison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 50 kg, only washing machines eligible (threshold 50)
    const result = getVolumeComparison(50);
    expect(result).toBe(`That's ${(50 / 80).toFixed(1)} washing machines`);
    vi.restoreAllMocks();
  });

  it("returns correct baby elephants comparison for 100 kg", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 100 kg, eligible: baby elephants (100), washing machines (50)
    // random=0 picks index 0 => baby elephants
    const result = getVolumeComparison(100);
    expect(result).toBe(`That's ${(100 / 120).toFixed(1)} baby elephants`);
    vi.restoreAllMocks();
  });

  it("returns correct cars lifted comparison for 1500 kg", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 1500 kg, all eligible. random=0 picks index 0 => cars
    const result = getVolumeComparison(1500);
    expect(result).toBe(`That's ${(1500 / 1500).toFixed(1)} cars lifted`);
    vi.restoreAllMocks();
  });

  it("can return polar bears comparison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    // At 1500 kg, all 5 eligible. floor(0.99*5)=4 => polar bears (index 4)
    const result = getVolumeComparison(1500);
    expect(result).toBe(`That's ${(1500 / 450).toFixed(1)} adult polar bears`);
    vi.restoreAllMocks();
  });

  it("returns correct grand pianos comparison for 300 kg", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // At 300 kg, eligible: baby elephants (100), grand pianos (300), washing machines (50)
    // random=0 picks index 0 => baby elephants (first in filter order)
    const result = getVolumeComparison(300);
    expect(result).toBe(`That's ${(300 / 120).toFixed(1)} baby elephants`);
    vi.restoreAllMocks();
  });
});
