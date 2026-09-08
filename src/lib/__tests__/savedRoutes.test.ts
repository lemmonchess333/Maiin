const write = vi.hoisted(() => vi.fn());
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore");
vi.mock("@/lib/firestoreWrite", () => ({
  addDocGuarded: write,
  deleteDocGuarded: vi.fn(),
}));
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  downsampleCoords,
  coordsToPoints,
  MAX_COORDS,
  saveRoute,
} from "../savedRoutes";
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
    const pts = Array.from({ length: 5000 }, (_, i) =>
      pt(51.5 + i * 1e-5, -0.1)
    );
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

describe("saved route segment persistence", () => {
  beforeEach(() => {
    write.mockReset().mockResolvedValue({ id: "saved" });
  });
  it("preserves redaction gaps when the library route is reconstructed", async () => {
    const points = [
      pt(51.5, -0.1),
      pt(51.51, -0.1),
      { ...pt(51.6, 0.1), breakBefore: true },
      pt(51.61, 0.1),
    ];
    await saveRoute("owner", {
      name: "Route with a gap",
      source: "gpx",
      points,
    });
    const data = write.mock.calls[0][1];
    expect(data.segmentStarts).toEqual([2]);
    const restored = coordsToPoints(data.coords, data.segmentStarts);
    expect(restored[2].breakBefore).toBe(true);
    expect(restored[1].breakBefore).toBeUndefined();
  });

  it("does not reconnect isolated points when sampling leaves one segment", async () => {
    const connected = [pt(51.5, -0.1), pt(51.501, -0.1)];
    const isolated = Array.from({ length: MAX_COORDS }, (_, index) => ({
      ...pt(51.6 + index * 0.001, 0.1),
      breakBefore: true,
    }));
    await saveRoute("owner", {
      name: "Fragmented route",
      source: "gpx",
      points: [...connected, ...isolated],
    });
    const data = write.mock.calls[0][1];
    expect(data.coords).toEqual([-0.1, 51.5, -0.1, 51.501]);
    expect(data.segmentStarts).toBeUndefined();
    expect(coordsToPoints(data.coords, data.segmentStarts)).toHaveLength(2);
  });
});
