/**
 * Tests for `calculatePlates` — the greedy barbell-loading
 * algorithm used by the PlateCalculator widget on the workout
 * session screen.
 *
 * Pins:
 *   1. Bar-only weights (≤ 20kg) return [].
 *   2. Greedy descent picks the heaviest plate that fits, repeats.
 *   3. Result is per-side (half of `targetWeight - BAR_WEIGHT_KG`).
 *   4. Float-tolerance check at `plate - 0.001` so 1.25 + 1.25 +
 *      1.25 + 1.25 + 1.25 cumulative error doesn't strand a final
 *      plate.
 *   5. Plates returned are valid PLATE_SIZES_KG entries.
 */
import { describe, it, expect } from "vitest";
import {
  calculatePlates,
  PLATE_SIZES_KG,
  BAR_WEIGHT_KG,
} from "../plateMath";

describe("calculatePlates — bar-only", () => {
  it("returns [] for the bare bar (20kg)", () => {
    expect(calculatePlates(BAR_WEIGHT_KG)).toEqual([]);
  });

  it("returns [] for below-bar weights (defensive)", () => {
    /* User can't load less than the bar; setter clamps to
       BAR_WEIGHT_KG upstream, but the calc still defends. */
    expect(calculatePlates(10)).toEqual([]);
  });
});

describe("calculatePlates — greedy descent", () => {
  it("60kg → 20+ side = two 20kg plates per side", () => {
    /* 60 - 20 bar = 40kg, halved = 20kg per side. */
    expect(calculatePlates(60)).toEqual([20]);
  });

  it("100kg → 40kg per side = 25 + 15", () => {
    /* 100 - 20 = 80, halved = 40. Greedy: 25 (rem=15) + 15 (rem=0). */
    expect(calculatePlates(100)).toEqual([25, 15]);
  });

  it("80kg → 30kg per side = 25 + 5", () => {
    expect(calculatePlates(80)).toEqual([25, 5]);
  });

  it("142.5kg → 61.25kg per side = 25+25+10+1.25", () => {
    /* 142.5 - 20 = 122.5, halved = 61.25. */
    expect(calculatePlates(142.5)).toEqual([25, 25, 10, 1.25]);
  });

  it("largest plates come first (descending order)", () => {
    const plates = calculatePlates(150);
    for (let i = 1; i < plates.length; i++) {
      expect(plates[i]).toBeLessThanOrEqual(plates[i - 1]);
    }
  });
});

describe("calculatePlates — float tolerance", () => {
  it("doesn't strand a 1.25kg plate at the bottom of a 22.5kg-per-side descent", () => {
    /* 22.5kg = 20 + 2.5. Float-error scenario: subtracting 2.5
       from 22.5 should land exactly on 20, but cumulative float
       drift could land on 19.999... which fails a strict >= 20
       check. The 0.001 tolerance in the inner loop covers this. */
    /* 65kg target → 22.5kg per side. */
    expect(calculatePlates(65)).toEqual([20, 2.5]);
  });

  it("stacks 1.25kg micro-plates correctly", () => {
    /* 22.5kg target = 1.25kg per side. */
    expect(calculatePlates(22.5)).toEqual([1.25]);
  });
});

describe("calculatePlates — result invariants", () => {
  it("never returns a plate that isn't in PLATE_SIZES_KG", () => {
    /* Pin the closed plate set. A future engineer adding a 35kg
       plate would need to add it both here and update the test. */
    const validSizes = new Set<number>(PLATE_SIZES_KG);
    for (const target of [60, 100, 142.5, 200, 87.5]) {
      const plates = calculatePlates(target);
      for (const p of plates) {
        expect(validSizes.has(p)).toBe(true);
      }
    }
  });

  it("plates sum (×2 sides + bar) equals (or is within tolerance of) target", () => {
    /* The greedy can stop short when the remaining can't be
       represented by the plate set. But for clean targets (every
       1.25kg increment) it lands exactly. */
    for (const target of [60, 100, 142.5, 22.5, 65]) {
      const plates = calculatePlates(target);
      const sum = plates.reduce((s, p) => s + p, 0) * 2 + BAR_WEIGHT_KG;
      expect(Math.abs(sum - target)).toBeLessThan(0.01);
    }
  });
});

describe("PLATE_SIZES_KG + BAR_WEIGHT_KG — constants", () => {
  it("BAR_WEIGHT_KG is 20 (Olympic bar)", () => {
    expect(BAR_WEIGHT_KG).toBe(20);
  });

  it("PLATE_SIZES_KG is the canonical seven-plate set", () => {
    expect([...PLATE_SIZES_KG]).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  it("PLATE_SIZES_KG is sorted descending (required for greedy)", () => {
    for (let i = 1; i < PLATE_SIZES_KG.length; i++) {
      expect(PLATE_SIZES_KG[i]).toBeLessThan(PLATE_SIZES_KG[i - 1]);
    }
  });
});
