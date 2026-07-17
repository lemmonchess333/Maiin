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
  downsampleRoute,
  MAX_FOLLOW_POINTS,
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

describe("downsampleRoute", () => {
  // A dense straight line heading north — one point every ~1.1m.
  const dense = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      lat: A.lat + i * 0.00001,
      lon: A.lon,
    }));

  it("is a no-op when already within budget (typical provider routes)", () => {
    const short = dense(200);
    expect(downsampleRoute(short)).toBe(short);
  });

  it("thins dense geometry to the budget, keeping both endpoints", () => {
    const route = dense(MAX_FOLLOW_POINTS * 3);
    const thinned = downsampleRoute(route);
    expect(thinned.length).toBeLessThanOrEqual(MAX_FOLLOW_POINTS);
    expect(thinned.length).toBeGreaterThan(MAX_FOLLOW_POINTS / 2);
    expect(thinned[0]).toEqual(route[0]);
    expect(thinned[thinned.length - 1]).toEqual(route[route.length - 1]);
  });

  it("preserves total distance within a small tolerance", () => {
    const route = dense(MAX_FOLLOW_POINTS * 3);
    const before = plannerDistanceM(route);
    const after = plannerDistanceM(downsampleRoute(route));
    // A straight line loses nothing; the pin is that thinning never
    // shortens the followed route materially.
    expect(after).toBeGreaterThan(before * 0.99);
    expect(after).toBeLessThanOrEqual(before * 1.001);
  });

  it("respects an explicit budget", () => {
    const route = dense(500);
    const thinned = downsampleRoute(route, 50);
    expect(thinned.length).toBeLessThanOrEqual(50);
    expect(thinned[0]).toEqual(route[0]);
    expect(thinned[thinned.length - 1]).toEqual(route[route.length - 1]);
  });
});
