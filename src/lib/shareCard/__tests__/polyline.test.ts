import { describe, it, expect } from "vitest";
import {
  simplifyRoute,
  clipRouteEnds,
  buildRoutePath,
  DEFAULT_CLIP_METERS,
} from "../polyline";
import type { GPSPoint } from "@/lib/gps";

/** Build a GPSPoint with sane defaults; only lat/lon matter to the engine. */
function pt(lat: number, lon: number): GPSPoint {
  return {
    lat,
    lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: 0,
    rawLat: lat,
    rawLon: lon,
  };
}

/**
 * A roughly straight ~1.1km east–west line near London at a fixed
 * latitude. ~0.00001° lon ≈ 0.7m here, so 200 steps ≈ a few hundred m.
 */
function straightLine(n: number, stepDeg = 0.0002): GPSPoint[] {
  const out: GPSPoint[] = [];
  for (let i = 0; i < n; i++) out.push(pt(51.5, -0.1 + i * stepDeg));
  return out;
}

describe("simplifyRoute (Douglas–Peucker)", () => {
  it("passes through routes of 2 or fewer points untouched", () => {
    expect(simplifyRoute([])).toEqual([]);
    const one = [pt(51.5, -0.1)];
    expect(simplifyRoute(one)).toHaveLength(1);
    const two = [pt(51.5, -0.1), pt(51.5, -0.09)];
    expect(simplifyRoute(two)).toHaveLength(2);
  });

  it("collapses collinear points to just the two endpoints", () => {
    const line = straightLine(50); // all on one straight line
    const simplified = simplifyRoute(line, 8);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toEqual(line[0]);
    expect(simplified[1]).toEqual(line[line.length - 1]);
  });

  it("always retains the first and last point", () => {
    const line = straightLine(40);
    const s = simplifyRoute(line, 8);
    expect(s[0]).toEqual(line[0]);
    expect(s[s.length - 1]).toEqual(line[line.length - 1]);
  });

  it("keeps a sharp corner (an L-shape) — endpoints + the vertex", () => {
    // East leg then north leg → the corner point must survive.
    const corner: GPSPoint[] = [];
    for (let i = 0; i < 20; i++) corner.push(pt(51.5, -0.1 + i * 0.0002));
    for (let i = 1; i < 20; i++) corner.push(pt(51.5 + i * 0.0002, -0.1 + 19 * 0.0002));
    const s = simplifyRoute(corner, 5);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThan(corner.length);
  });

  it("a looser tolerance never yields more points than a tighter one", () => {
    const wiggly: GPSPoint[] = [];
    for (let i = 0; i < 60; i++) {
      wiggly.push(pt(51.5 + Math.sin(i / 3) * 0.0003, -0.1 + i * 0.0002));
    }
    const tight = simplifyRoute(wiggly, 2);
    const loose = simplifyRoute(wiggly, 30);
    expect(loose.length).toBeLessThanOrEqual(tight.length);
  });
});

describe("clipRouteEnds (privacy trim)", () => {
  it("trims roughly trimMeters from each end (start/finish hidden)", () => {
    const line = straightLine(200); // long enough to clip both ends
    const clipped = clipRouteEnds(line, DEFAULT_CLIP_METERS);
    expect(clipped.length).toBeGreaterThan(1);
    expect(clipped.length).toBeLessThan(line.length);
    // The retained ends are inset from the true endpoints.
    expect(clipped[0]).not.toEqual(line[0]);
    expect(clipped[clipped.length - 1]).not.toEqual(line[line.length - 1]);
  });

  it("never collapses a short route to nothing — returns it whole", () => {
    const shortRoute = straightLine(4); // a few metres total
    const clipped = clipRouteEnds(shortRoute, DEFAULT_CLIP_METERS);
    expect(clipped).toEqual(shortRoute);
  });

  it("passes through tracks under 3 points", () => {
    const two = [pt(51.5, -0.1), pt(51.5, -0.09)];
    expect(clipRouteEnds(two)).toEqual(two);
  });

  it("trimMeters <= 0 is a no-op (clip toggle off)", () => {
    const line = straightLine(50);
    expect(clipRouteEnds(line, 0)).toEqual(line);
  });
});

describe("buildRoutePath", () => {
  it("returns an empty path for a route that can't be drawn", () => {
    expect(buildRoutePath([]).d).toBe("");
    expect(buildRoutePath([pt(51.5, -0.1)]).d).toBe("");
  });

  it("produces a valid SVG path starting with M then L commands", () => {
    const corner: GPSPoint[] = [];
    for (let i = 0; i < 30; i++) corner.push(pt(51.5, -0.1 + i * 0.0003));
    for (let i = 1; i < 30; i++) corner.push(pt(51.5 + i * 0.0003, -0.1 + 29 * 0.0003));
    const { d, pointCount } = buildRoutePath(corner, { clip: false });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(pointCount).toBeGreaterThanOrEqual(2);
  });

  it("fits the path inside the box with padding (no coordinate escapes bounds)", () => {
    const wiggly: GPSPoint[] = [];
    for (let i = 0; i < 80; i++) {
      wiggly.push(pt(51.5 + Math.sin(i / 4) * 0.0005, -0.1 + i * 0.0002));
    }
    const width = 1000;
    const height = 1000;
    const padding = 80;
    const { d } = buildRoutePath(wiggly, { width, height, padding, clip: false });
    const coords = d
      .replace(/[ML]/g, " ")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number));
    for (const [x, y] of coords) {
      // Allow a hair of float slack at the padded bounds.
      expect(x).toBeGreaterThanOrEqual(padding - 0.5);
      expect(x).toBeLessThanOrEqual(width - padding + 0.5);
      expect(y).toBeGreaterThanOrEqual(padding - 0.5);
      expect(y).toBeLessThanOrEqual(height - padding + 0.5);
    }
  });

  it("clip=true reduces the plotted point span vs clip=false on a long route", () => {
    const line = straightLine(200);
    const withClip = buildRoutePath(line, { clip: true });
    const noClip = buildRoutePath(line, { clip: false });
    // Both simplify a straight line to 2 points, but the clipped path's
    // endpoints are inset — its `d` differs from the unclipped one.
    expect(withClip.d).not.toBe(noClip.d);
  });
});
