/**
 * The water fill's gradient lies over the water alone (waterFill.ts): the
 * fill is drawn the tile's full height and slid down, so only its top
 * `fillPercent` shows, and the deep tint must end there, not below the
 * tile.
 */
import { describe, expect, it } from "vitest";
import { waterFillBackground } from "../waterFill";

/** The gradient's stops, as [alpha, position %]. */
function stops(background: string): [number, number][] {
  return [...background.matchAll(/rgba\([^)]*,\s*([\d.]+)\)\s+([\d.]+)%/g)].map(
    (m) => [Number(m[1]), Number(m[2])]
  );
}

describe("the water fill's colour", () => {
  it("runs from the light surface to the deep tint at the water's own depth", () => {
    expect(stops(waterFillBackground(25))).toEqual([
      [0.08, 0],
      [0.15, 15],
      [0.25, 25],
    ]);
    expect(stops(waterFillBackground(80))).toEqual([
      [0.08, 0],
      [0.15, 48],
      [0.25, 80],
    ]);
  });

  it("is top to bottom, so the element's top is the surface", () => {
    expect(waterFillBackground(50)).toMatch(/^linear-gradient\(180deg,/);
  });

  it("is nothing with no water, and stops at a full tile", () => {
    expect(waterFillBackground(0)).toBe("transparent");
    expect(stops(waterFillBackground(130)).at(-1)).toEqual([0.25, 100]);
  });
});
