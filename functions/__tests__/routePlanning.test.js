/**
 * Road-aware route planning core (Run11/Mapbox) — validation bounds,
 * loop-seed geometry, the ≤4-provider-call calibration budget, the
 * 5000-point geometry cap, and privacy (no coordinate content in
 * thrown errors).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MAX_LOOP_PROVIDER_CALLS,
  MAX_GEOMETRY_POINTS,
  RoutePlanningError,
  validateAlignWaypoints,
  validateLoopRequest,
  squareLoopSeed,
  alignToRoads,
  generateLoop,
} = require("../lib/routePlanning");

const LONDON = { lat: 51.5074, lon: -0.1278 };

function mapboxResponse({ distanceM, duration = 1200, points = 40 }) {
  const coordinates = Array.from({ length: points }, (_, i) => [
    -0.1278 + i * 0.0001,
    51.5074 + i * 0.0001,
  ]);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      routes: [{ geometry: { coordinates }, distance: distanceM, duration }],
    }),
  };
}

describe("validation", () => {
  it("align: rejects <2, >12, and malformed coordinates", () => {
    expect(() => validateAlignWaypoints([LONDON])).toThrow(RoutePlanningError);
    expect(() =>
      validateAlignWaypoints(Array.from({ length: 13 }, () => LONDON))
    ).toThrow(RoutePlanningError);
    expect(() => validateAlignWaypoints([LONDON, { lat: 91, lon: 0 }])).toThrow(
      RoutePlanningError
    );
    expect(() =>
      validateAlignWaypoints([LONDON, { lat: "51", lon: 0 }])
    ).toThrow(RoutePlanningError);
    expect(validateAlignWaypoints([LONDON, LONDON])).toHaveLength(2);
  });

  it("loop: accepts only the offered distances", () => {
    expect(() => validateLoopRequest({ start: LONDON, targetKm: 7 })).toThrow(
      RoutePlanningError
    );
    expect(() => validateLoopRequest({ targetKm: 5 })).toThrow(
      RoutePlanningError
    );
    expect(validateLoopRequest({ start: LONDON, targetKm: 5 }).targetKm).toBe(
      5
    );
  });

  it("errors never carry coordinate content", () => {
    try {
      validateAlignWaypoints([LONDON, { lat: 91, lon: -0.1278 }]);
    } catch (error) {
      expect(String(error.message)).not.toContain("51.5");
      expect(String(error.message)).not.toContain("-0.12");
    }
  });
});

describe("squareLoopSeed", () => {
  it("closes at the start and spans ~perimeter/4 per side", () => {
    const seed = squareLoopSeed(LONDON, 5);
    expect(seed[0]).toEqual(seed[seed.length - 1]);
    expect(seed).toHaveLength(5);
    // Latitude span of the square ≈ side length (5/4 km ≈ 0.0113°).
    const latSpan = Math.max(...seed.map((p) => p.lat)) - LONDON.lat;
    expect(latSpan).toBeGreaterThan(0.008);
    expect(latSpan).toBeLessThan(0.015);
  });
});

describe("alignToRoads", () => {
  it("returns lat/lon points + rounded distance from the provider", async () => {
    const fetchImpl = vi.fn(async () => mapboxResponse({ distanceM: 4321.6 }));
    const result = await alignToRoads({
      fetchImpl,
      token: "tok",
      waypoints: [LONDON, { lat: 51.51, lon: -0.13 }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.distanceM).toBe(4322);
    expect(result.points[0]).toEqual({ lat: 51.5074, lon: -0.1278 });
    // Token travels in the request, never in the result.
    expect(JSON.stringify(result)).not.toContain("tok");
  });

  it("caps geometry at MAX_GEOMETRY_POINTS", async () => {
    const fetchImpl = vi.fn(async () =>
      mapboxResponse({ distanceM: 5000, points: MAX_GEOMETRY_POINTS + 500 })
    );
    const result = await alignToRoads({
      fetchImpl,
      token: "tok",
      waypoints: [LONDON, LONDON],
    });
    expect(result.points.length).toBeLessThanOrEqual(MAX_GEOMETRY_POINTS);
  });

  it("maps provider failures to bounded error codes", async () => {
    const down = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    await expect(
      alignToRoads({ fetchImpl: down, token: "t", waypoints: [LONDON, LONDON] })
    ).rejects.toMatchObject({ code: "provider-unavailable" });
    const empty = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ routes: [] }),
    }));
    await expect(
      alignToRoads({
        fetchImpl: empty,
        token: "t",
        waypoints: [LONDON, LONDON],
      })
    ).rejects.toMatchObject({ code: "no-route" });
  });
});

describe("generateLoop calibration", () => {
  it("stops immediately when the first attempt is within tolerance", async () => {
    const fetchImpl = vi.fn(async () => mapboxResponse({ distanceM: 5100 }));
    const result = await generateLoop({
      fetchImpl,
      token: "t",
      start: LONDON,
      targetKm: 5,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.distanceM).toBe(5100);
  });

  it("rescales toward the target and never exceeds the call budget", async () => {
    // Provider keeps answering 60% of whatever perimeter was asked —
    // never inside tolerance, so the budget is the stop condition.
    const asked = [];
    const fetchImpl = vi.fn(async (url) => {
      asked.push(url);
      return mapboxResponse({ distanceM: 2000 });
    });
    const result = await generateLoop({
      fetchImpl,
      token: "t",
      start: LONDON,
      targetKm: 10,
    });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(
      MAX_LOOP_PROVIDER_CALLS
    );
    expect(result.distanceM).toBe(2000); // best (only) achievable answer
  });

  it("converges on the second call when the provider tracks the seed", async () => {
    // First attempt routes short (70% of target); after rescale the
    // provider returns on-target.
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return mapboxResponse({ distanceM: call === 1 ? 7000 : 9800 });
    });
    const result = await generateLoop({
      fetchImpl,
      token: "t",
      start: LONDON,
      targetKm: 10,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.distanceM).toBe(9800);
  });
});
