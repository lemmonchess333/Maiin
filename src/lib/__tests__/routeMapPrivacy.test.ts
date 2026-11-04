/**
 * A run post's map shows no more of the route than the post's preview may
 * (Soc15 call 5). The hard requirement of putting a run on a real street
 * map: a privacy zone still hides where the person lives, and the clipped
 * ends still hide where they started and finished.
 *
 * Both pictures come from one function, `sharedRouteTrace`
 * (runCompletion.ts): the post's 20-point preview and the map's line are
 * samples of what it returns, worked out together in `runPostRoute`. These
 * tests hold the map's line to it, a point at a time, and hold the
 * drawing (routeMapGeometry.ts) to the line, so a point the preview may
 * not show can never reach the image.
 */
import { describe, expect, it } from "vitest";
import {
  ROUTE_MAP_POINTS,
  runPostRoute,
  sharedRouteTrace,
} from "../runCompletion";
import { applyPrivacyZones, type PrivacyZone } from "../privacyZones";
import { DEFAULT_CLIP_METERS } from "../shareCard/polyline";
import { haversine, type GPSPoint } from "../gps";
import {
  hasRouteMapLine,
  routeMapBounds,
  routeMapEnds,
  routeMapLines,
} from "../routeMapGeometry";
import type { RouteCoordinate } from "../routeSegments";

/** About 11 km north out of a front door, a point every 11 m. */
const TRACE: GPSPoint[] = Array.from(
  { length: 1000 },
  (_, i) =>
    ({
      lat: 51.5 + i * 0.0001,
      lon: -0.12 + Math.sin(i / 40) * 0.002,
      timestamp: 1_760_000_000_000 + i * 4000,
    }) as GPSPoint
);
/** A zone round a friend's house, halfway along. */
const ZONE: PrivacyZone = {
  id: "z1",
  name: "Friend's",
  lat: TRACE[500].lat,
  lon: TRACE[500].lon,
  radiusMeters: 300,
};

const key = (p: RouteCoordinate) => `${p.lat},${p.lon}`;
const distanceFrom = (p: RouteCoordinate, q: RouteCoordinate) =>
  haversine(p.lat, p.lon, q.lat, q.lon);

/** The finish screen's order: zones cut first (RunSummary), then the post's route. */
function postedRoute(options: { withheld: boolean; showEnds: boolean }) {
  const zoned = applyPrivacyZones(TRACE, [ZONE]);
  return {
    zoned,
    shared: sharedRouteTrace(zoned, options),
    route: runPostRoute(zoned, options),
  };
}

describe("the map's line and the post's preview are one shared route", () => {
  it("draws every point of each from the one shared trace", () => {
    const { shared, route } = postedRoute({ withheld: false, showEnds: false });
    const allowed = new Set(shared.map(key));
    expect(route.mapLine.length).toBeGreaterThan(route.routePreview.length);
    expect(route.mapLine.length).toBeLessThanOrEqual(ROUTE_MAP_POINTS);
    for (const p of route.mapLine) expect(allowed.has(key(p))).toBe(true);
    for (const p of route.routePreview) expect(allowed.has(key(p))).toBe(true);
  });

  it("starts and ends where the preview does", () => {
    const { route } = postedRoute({ withheld: false, showEnds: false });
    expect(route.mapLine[0]).toEqual(route.routePreview[0]);
    expect(route.mapLine.at(-1)).toEqual(route.routePreview.at(-1));
  });
});

describe("a privacy zone", () => {
  it("keeps every point inside it off the map's line", () => {
    const { route } = postedRoute({ withheld: false, showEnds: false });
    // Anchor: the run passes through the zone, so there was a point to hide.
    expect(TRACE.some((p) => distanceFrom(p, ZONE) <= ZONE.radiusMeters)).toBe(
      true
    );
    for (const p of route.mapLine)
      expect(distanceFrom(p, ZONE)).toBeGreaterThan(ZONE.radiusMeters);
  });

  it("is a gap in the drawn line, never a straight line across it", () => {
    const { route } = postedRoute({ withheld: false, showEnds: false });
    const lines = routeMapLines(route.mapLine);
    expect(lines).toHaveLength(2);
    const north = (lonLat: [number, number]) => lonLat[1] > ZONE.lat;
    for (const line of lines) {
      // Each stretch stays on one side of the zone.
      expect(new Set(line.map(north)).size).toBe(1);
    }
  });
});

describe("the clipped ends", () => {
  it("keep the first and last 200 m off the map's line", () => {
    const { route } = postedRoute({ withheld: false, showEnds: false });
    const start = TRACE[0];
    const finish = TRACE[TRACE.length - 1];
    // Anchor: there are points within 200 m of each end to hide.
    expect(distanceFrom(TRACE[5], start)).toBeLessThan(DEFAULT_CLIP_METERS);
    for (const p of route.mapLine) {
      expect(distanceFrom(p, start)).toBeGreaterThan(DEFAULT_CLIP_METERS - 15);
      expect(distanceFrom(p, finish)).toBeGreaterThan(DEFAULT_CLIP_METERS - 15);
    }
    const ends = routeMapEnds(route.mapLine)!;
    expect(ends.start).not.toEqual([start.lon, start.lat]);
    expect(ends.finish).not.toEqual([finish.lon, finish.lat]);
  });

  it("are drawn when the runner chose to show them, on both", () => {
    const { route } = postedRoute({ withheld: false, showEnds: true });
    expect(route.mapLine[0]).toEqual({ lat: TRACE[0].lat, lon: TRACE[0].lon });
    expect(route.routePreview[0]).toEqual(route.mapLine[0]);
  });
});

describe("a withheld route", () => {
  it("gives the map nothing to draw, as it gives the post no preview", () => {
    const { route } = postedRoute({ withheld: true, showEnds: true });
    expect(route.routePreview).toEqual([]);
    expect(route.mapLine).toEqual([]);
    expect(hasRouteMapLine(route.mapLine)).toBe(false);
    expect(routeMapBounds(route.mapLine)).toBeNull();
    expect(routeMapEnds(route.mapLine)).toBeNull();
  });
});

describe("the drawing reads the line and nothing else", () => {
  it("draws only the line's points, and frames only them", () => {
    const { route } = postedRoute({ withheld: false, showEnds: false });
    const onLine = new Set(route.mapLine.map((p) => `${p.lon},${p.lat}`));
    for (const [lon, lat] of routeMapLines(route.mapLine).flat())
      expect(onLine.has(`${lon},${lat}`)).toBe(true);
    const [[west, south], [east, north]] = routeMapBounds(route.mapLine)!;
    expect(south).toBe(Math.min(...route.mapLine.map((p) => p.lat)));
    expect(north).toBe(Math.max(...route.mapLine.map((p) => p.lat)));
    expect(west).toBe(Math.min(...route.mapLine.map((p) => p.lon)));
    expect(east).toBe(Math.max(...route.mapLine.map((p) => p.lon)));
  });

  it("leaves out a stretch of one point, which draws nothing", () => {
    const line = [
      { lat: 1, lon: 1 },
      { lat: 2, lon: 2, breakBefore: true },
      { lat: 3, lon: 3, breakBefore: true },
      { lat: 4, lon: 4 },
    ];
    expect(routeMapLines(line)).toEqual([
      [
        [3, 3],
        [4, 4],
      ],
    ]);
    expect(routeMapEnds(line)).toEqual({ start: [3, 3], finish: [4, 4] });
    expect(hasRouteMapLine([{ lat: 1, lon: 1 }])).toBe(false);
  });
});
