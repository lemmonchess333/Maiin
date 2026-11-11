/**
 * Where the run card's route scene draws a route (`routeSceneGeometry.ts`).
 *
 * The drawing used to keep its bottom for the distance numeral a card laid
 * over it. That ground was in the drawing's units and the numeral in the
 * page's, so a route starting bottom-left put its start ring on the
 * number. The numeral now has its own row under the drawing, and the
 * route fills the drawing: these pin that it does, and that every mark
 * stays inside it.
 */
import { describe, expect, it } from "vitest";
import {
  ROUTE_SCENE_PAD,
  ROUTE_SCENE_VIEWBOX,
  routeSceneGeometry,
} from "@/lib/routeSceneGeometry";

const { width: W, height: H } = ROUTE_SCENE_VIEWBOX;

/** Out along the bottom and up the right, then back: an out-and-back
 *  whose start and finish are its south-west corner. */
const outAndBack = [
  { lat: 51.5, lon: -0.13 },
  { lat: 51.5, lon: -0.12 },
  { lat: 51.505, lon: -0.11 },
  { lat: 51.5, lon: -0.12 },
  { lat: 51.5, lon: -0.13 },
];

const points = (pts: string) =>
  pts.split(" ").map((p) => p.split(",").map(Number) as [number, number]);

describe("routeSceneGeometry", () => {
  it("fills the whole drawing, keeping no ground at the bottom for a number", () => {
    const { paths, start, finish } = routeSceneGeometry(outAndBack);
    const all = paths.flatMap(points);
    const ys = all.map(([, y]) => y);
    const xs = all.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(ROUTE_SCENE_PAD.x);
    expect(Math.max(...xs)).toBeCloseTo(W - ROUTE_SCENE_PAD.x);
    expect(Math.min(...ys)).toBeCloseTo(ROUTE_SCENE_PAD.y);
    expect(Math.max(...ys)).toBeCloseTo(H - ROUTE_SCENE_PAD.y);
    // The start and finish at the drawing's bottom-left, where the
    // numeral used to be laid.
    expect(start[0]).toBeCloseTo(ROUTE_SCENE_PAD.x);
    expect(start[1]).toBeCloseTo(H - ROUTE_SCENE_PAD.y);
    expect(finish).toEqual(start);
  });

  it("keeps the start ring and the widest glow inside the drawing", () => {
    // Start ring r 3.2 with a 1.6 stroke; the underglow is 7 wide.
    const reach = Math.max(3.2 + 1.6 / 2, 7 / 2);
    const { paths, start, finish } = routeSceneGeometry(outAndBack);
    for (const [x, y] of [...paths.flatMap(points), start, finish]) {
      expect(x - reach).toBeGreaterThanOrEqual(0);
      expect(x + reach).toBeLessThanOrEqual(W);
      expect(y - reach).toBeGreaterThanOrEqual(0);
      expect(y + reach).toBeLessThanOrEqual(H);
    }
  });

  it("draws each unbroken piece of a route as its own line", () => {
    const { paths } = routeSceneGeometry([
      { lat: 51.5, lon: -0.13 },
      { lat: 51.501, lon: -0.12 },
      { lat: 51.502, lon: -0.11, breakBefore: true },
      { lat: 51.503, lon: -0.1 },
    ]);
    expect(paths).toHaveLength(2);
  });

  it("draws a route that never moves without dividing by nothing", () => {
    const { start, finish } = routeSceneGeometry([
      { lat: 51.5, lon: -0.13 },
      { lat: 51.5, lon: -0.13 },
    ]);
    expect(start).toEqual(finish);
    expect(Number.isFinite(start[0]) && Number.isFinite(start[1])).toBe(true);
  });
});
