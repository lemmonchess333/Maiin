import { describe, it, expect } from "vitest";
import { downsampleCoords, coordsToPoints, MAX_COORDS } from "../savedRoutes";
import type { GPSPoint } from "../gps";

function pt(lat: number, lon: number): GPSPoint {
  return {
    lat,
    lon,
    altitude: null,
    accuracy: 0,
    speed: null,
    timestamp: 0,
    rawLat: lat,
    rawLon: lon,
  };
}

describe("downsampleCoords", () => {
  it("flattens short polylines unchanged ([lon,lat,…])", () => {
    const pts = [pt(51.5, -0.1), pt(51.51, -0.11)];
    expect(downsampleCoords(pts)).toEqual([-0.1, 51.5, -0.11, 51.51]);
  });

  it("empty input → empty", () => {
    expect(downsampleCoords([])).toEqual([]);
  });

  it("caps long polylines at max points and keeps the endpoints", () => {
    const pts = Array.from({ length: 5000 }, (_, i) => pt(51.5 + i * 1e-5, -0.1));
    const flat = downsampleCoords(pts, 600);
    expect(flat).toHaveLength(MAX_COORDS * 2);
    // first point preserved
    expect(flat[0]).toBeCloseTo(-0.1, 6);
    expect(flat[1]).toBeCloseTo(51.5, 6);
    // last point preserved
    expect(flat[flat.length - 1]).toBeCloseTo(pts[pts.length - 1].lat, 6);
  });
});

describe("coordsToPoints", () => {
  it("rebuilds points from flat coords (lon,lat pairs)", () => {
    const pts = coordsToPoints([-0.1, 51.5, -0.11, 51.51]);
    expect(pts).toHaveLength(2);
    expect(pts[0].lat).toBe(51.5);
    expect(pts[0].lon).toBe(-0.1);
    expect(pts[1].lat).toBe(51.51);
    expect(pts[0].timestamp).toBe(0);
    expect(pts[0].accuracy).toBe(0);
  });

  it("ignores a trailing odd value", () => {
    expect(coordsToPoints([-0.1, 51.5, -0.11])).toHaveLength(1);
  });

  it("round-trips lat/lon for a sub-cap polyline", () => {
    const original = [pt(51.5, -0.1), pt(51.501, -0.0999), pt(51.502, -0.0998)];
    const round = coordsToPoints(downsampleCoords(original));
    expect(round).toHaveLength(3);
    round.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(original[i].lat, 6);
      expect(p.lon).toBeCloseTo(original[i].lon, 6);
    });
  });
});
