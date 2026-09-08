// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPrivacyZones, type PrivacyZone } from "../privacyZones";
import { sampleRoute, splitRouteSegments } from "../routeSegments";
import { parseGpx } from "../gpx";
import { routeTotalDistance, toGPX, type GPSPoint } from "../gps";
import { buildRoutePath, simplifyRoute } from "../shareCard/polyline";
import { resolveShareRoute } from "../shareRoute";

const point = (lat: number, lon: number, timestamp = 1000): GPSPoint => ({
  lat,
  lon,
  rawLat: lat,
  rawLon: lon,
  timestamp,
  accuracy: 5,
  speed: 3,
  altitude: 10,
});
const home: PrivacyZone = {
  id: "home",
  name: "Home",
  lat: 51.5,
  lon: 0,
  radiusMeters: 100,
};
const west = [point(51.5, -0.01), point(51.5, -0.005)];
const inside = point(51.5, 0);
const east = [point(51.5, 0.005), point(51.5, 0.01)];

afterEach(() => vi.restoreAllMocks());

describe("privacy gaps survive the sharing pipeline", () => {
  it("keeps repeated crossings disconnected in GPX export and re-import", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const safe = applyPrivacyZones(
      [...west, inside, ...east, inside, ...west],
      [home]
    );
    expect(
      splitRouteSegments(safe).map((segment) => segment.map(({ lon }) => lon))
    ).toEqual([
      [-0.01, -0.005],
      [0.005, 0.01],
      [-0.01, -0.005],
    ]);
    expect(safe.some((p) => p.lon === 0)).toBe(false);
    const doc = new DOMParser().parseFromString(
      toGPX(safe, "Private & safe"),
      "application/xml"
    );
    expect(doc.getElementsByTagName("trkseg")).toHaveLength(3);
    expect(splitRouteSegments(parseGpx(toGPX(safe, "Route")))).toHaveLength(3);
  });

  it("cuts an edge that jumps over the zone without an in-zone GPS fix", () => {
    const safe = applyPrivacyZones([...west, ...east], [home]);
    expect(splitRouteSegments(safe)).toHaveLength(2);
    expect(routeTotalDistance(safe)).toBeLessThan(
      routeTotalDistance([...west, ...east])
    );
  });

  it("sampling and simplification retain both sides of every cut", () => {
    const first = Array.from({ length: 50 }, (_, i) =>
      point(51.5, -0.1 + i * 0.001)
    );
    const next = Array.from({ length: 50 }, (_, i) => ({
      ...point(51.5, 0.01 + i * 0.001),
      ...(i === 0 ? { breakBefore: true } : {}),
    }));
    const sampled = sampleRoute([...first, ...next], 20);
    const segments = splitRouteSegments(sampled);
    expect(segments).toHaveLength(2);
    expect(segments[0].at(-1)).toEqual(first.at(-1));
    expect(segments[1][0]).toEqual(next[0]);
    expect(splitRouteSegments(simplifyRoute(sampled))).toHaveLength(2);
    const path = buildRoutePath(sampled, { clip: false }).d;
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/L/g)).toHaveLength(2);
  });

  it("refuses a route whose only survivors are isolated points", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(resolveShareRoute([west[0], inside, east[0]], [home])).toBeNull();
  });
});

it("many privacy gaps stay within the public point budget", () => {
  const route = Array.from({ length: 100 }, (_, index) => ({
    ...point(51.5, index / 100),
    ...(index > 0 && index % 2 === 0 ? { breakBefore: true } : {}),
  }));
  const sampled = sampleRoute(route, 20);
  expect(sampled.length).toBeLessThanOrEqual(20);
  expect(splitRouteSegments(sampled)).toHaveLength(10);
  expect(
    splitRouteSegments(sampled).every((segment) => segment.length === 2)
  ).toBe(true);
});
