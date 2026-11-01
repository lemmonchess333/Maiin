/**
 * Route planner core — pins the waypoint→plan conversion contract (the
 * coordsToPoints/no-timestamp shape follow expects), straight-segment
 * distance, and the close-loop rules.
 */
import { describe, it, expect } from "vitest";
import {
  waypointsToRoute,
  plannerDistanceM,
  closeLoop,
  isLoopClosed,
} from "../routePlanner";

// ~1km apart north-south at this latitude.
const A = { lat: 51.5, lon: -0.12 };
const B = { lat: 51.509, lon: -0.12 };
const C = { lat: 51.509, lon: -0.135 };

describe("waypointsToRoute", () => {
  it("emits the GPSPoint plan shape (no timestamps, raw coords mirrored)", () => {
    const [p] = waypointsToRoute([A]);
    expect(p).toEqual({
      lat: A.lat,
      lon: A.lon,
      altitude: null,
      accuracy: 0,
      speed: null,
      timestamp: 0,
      rawLat: A.lat,
      rawLon: A.lon,
    });
  });
});

describe("plannerDistanceM", () => {
  it("zero for fewer than 2 waypoints; haversine chain otherwise", () => {
    expect(plannerDistanceM([])).toBe(0);
    expect(plannerDistanceM([A])).toBe(0);
    const d = plannerDistanceM([A, B]);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1100);
    // Chain adds up segment by segment.
    expect(plannerDistanceM([A, B, C])).toBeGreaterThan(d);
  });
});

describe("closeLoop / isLoopClosed", () => {
  it("appends the start point to close an open loop", () => {
    const closed = closeLoop([A, B, C]);
    expect(closed).toHaveLength(4);
    expect(closed[3]).toEqual(A);
    expect(isLoopClosed(closed)).toBe(true);
  });

  it("no-op when already closed or too few points", () => {
    const closed = closeLoop([A, B, C]);
    expect(closeLoop(closed)).toBe(closed);
    const single = [A];
    expect(closeLoop(single)).toBe(single);
  });

  it("an out-and-back that ends near the start counts as closed (tolerance)", () => {
    const nearStart = { lat: A.lat + 0.0001, lon: A.lon }; // ~11m away
    expect(isLoopClosed([A, B, nearStart])).toBe(true);
  });
});
