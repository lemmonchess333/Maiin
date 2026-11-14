/**
 * The route a public post's page draws (App1 Q51; the owner, 14 November
 * 2026: the run's map with its start and finish cut off, as Strava does).
 * The pure rule: zones out, 400 m off each end along the line, no map
 * under 1 km or under half the run, and none for a treadmill, manual or
 * lift session.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  END_CUT_M,
  MAX_POINTS,
  haversine,
  publicRoute,
} = require("../lib/publicRoute");

/** Degrees of latitude in a metre, on the haversine's earth. */
const DEG_PER_M = 180 / (Math.PI * 6371000);
const START = { lat: 51.5, lon: -0.12 };

/** A run due north from START: a fix every `stepM` metres for `km`. */
function north(km, stepM = 50, extra = () => ({})) {
  const count = Math.round((km * 1000) / stepM);
  return Array.from({ length: count + 1 }, (_, i) => ({
    lat: START.lat + i * stepM * DEG_PER_M,
    lon: START.lon,
    ...extra(i),
  }));
}

/** The point `metres` north of START. */
function at(metres) {
  return { lat: START.lat + metres * DEG_PER_M, lon: START.lon };
}

function metres(a, b) {
  return haversine(a.lat, a.lon, b.lat, b.lon);
}

const SHARED = [at(0), at(1000)];

function route({ km = 5, points, zones = [], distance, post = {}, run = {} }) {
  const trace = points ?? north(km);
  return publicRoute({
    post: {
      type: "run",
      distance: distance ?? km * 1000,
      routePreview: SHARED,
      ...post,
    },
    run: { points: trace, place: null, activityType: "easy", ...run },
    zones,
  });
}

/** Where each piece of a drawn line starts and ends. */
function pieces(line) {
  const out = [];
  for (const p of line) {
    if (out.length === 0 || p.breakBefore) out.push([]);
    out[out.length - 1].push(p);
  }
  return out;
}

describe("the start and finish are cut off", () => {
  it("drops the first and last 400 m, so neither end is shown", () => {
    const trace = north(5);
    const line = route({ points: trace });
    expect(line).not.toBeNull();
    const first = trace[0];
    const last = trace[trace.length - 1];
    for (const p of line) {
      expect(metres(p, first)).toBeGreaterThanOrEqual(END_CUT_M - 1);
      expect(metres(p, last)).toBeGreaterThanOrEqual(END_CUT_M - 1);
    }
    // It starts at the first fix 400 m along, not further.
    expect(metres(line[0], first)).toBeLessThan(END_CUT_M + 51);
    expect(metres(line.at(-1), last)).toBeLessThan(END_CUT_M + 51);
    expect(line).not.toContainEqual(first);
    expect(line).not.toContainEqual(last);
  });

  it("measures the 400 m along the route, not across it", () => {
    // An out and back: 2.5 km north and home again. Its finish is its
    // start, and both are cut along the way out and the way back.
    const out = north(2.5);
    const back = out.slice(0, -1).reverse();
    const line = route({ points: [...out, ...back] });
    expect(line).not.toBeNull();
    for (const p of line) {
      expect(metres(p, START)).toBeGreaterThanOrEqual(END_CUT_M - 1);
    }
    expect(metres(line[0], START)).toBeLessThan(END_CUT_M + 51);
    expect(metres(line.at(-1), START)).toBeLessThan(END_CUT_M + 51);
  });
});

describe("privacy zones", () => {
  it("drops every point inside a zone, then 400 m beyond what is left", () => {
    const zone = { lat: START.lat, lon: START.lon, radiusMeters: 300 };
    const line = route({ zones: [zone] });
    expect(line).not.toBeNull();
    for (const p of line) {
      expect(metres(p, START)).toBeGreaterThanOrEqual(300 + END_CUT_M - 1);
    }
  });

  it("leaves a gap where a zone is passed mid-run, cut back 400 m each side", () => {
    const home = { ...at(3000), radiusMeters: 200 };
    const line = route({ km: 6, zones: [home] });
    expect(line).not.toBeNull();
    expect(pieces(line)).toHaveLength(2);
    for (const p of line) {
      expect(metres(p, home)).toBeGreaterThanOrEqual(200 + END_CUT_M - 1);
    }
  });

  it("breaks a stretch that jumps across a zone with no fix inside it", () => {
    // A fix every 500 m; the zone sits between the 3.0 and 3.5 km fixes.
    const home = { ...at(3250), radiusMeters: 100 };
    const line = route({ points: north(6, 500), km: 6, zones: [home] });
    expect(line).not.toBeNull();
    const drawn = pieces(line);
    expect(drawn).toHaveLength(2);
    // No piece reaches across the zone.
    for (const piece of drawn) {
      const lats = piece.map((p) => p.lat);
      const across =
        Math.min(...lats) < home.lat && Math.max(...lats) > home.lat;
      expect(across).toBe(false);
    }
  });

  it("reads a zone saved without a radius as 500 m, as the app does", () => {
    const line = route({ zones: [{ lat: START.lat, lon: START.lon }] });
    expect(line).not.toBeNull();
    for (const p of line) {
      expect(metres(p, START)).toBeGreaterThanOrEqual(500 + END_CUT_M - 1);
    }
  });

  it("draws no map when the zones are unread or one cannot be read", () => {
    expect(route({ zones: null })).toBeNull();
    expect(route({ zones: [{ lat: "51.5", lon: -0.12 }] })).toBeNull();
  });
});

describe("enough left to draw", () => {
  it("draws no map when under 1 km is left", () => {
    // 1.7 km less 800 m is 900 m; 1.85 km leaves 1.05 km.
    expect(route({ km: 1.7 })).toBeNull();
    expect(route({ km: 1.85 })).not.toBeNull();
  });

  it("draws no map when under half the run is left", () => {
    // A zone round the start of a 4 km run: 1.5 km in it, 400 m more off
    // each end, leaves 1.7 km of 4.
    const zone = { lat: START.lat, lon: START.lon, radiusMeters: 1500 };
    expect(route({ km: 4, zones: [zone] })).toBeNull();
    // 1 km in it leaves 2.2 km of 4.
    expect(
      route({ km: 4, zones: [{ ...zone, radiusMeters: 1000 }] })
    ).not.toBeNull();
  });

  it("measures half against the run's distance when the trace is short of it", () => {
    // GPS caught 3 km of a 10 km run: 2.2 km left is under half.
    expect(route({ km: 3, distance: 10000 })).toBeNull();
    expect(route({ km: 3, distance: 3000 })).not.toBeNull();
  });
});

describe("only an outdoor GPS run whose post shares a route", () => {
  it("draws none for a treadmill run, old or new, or one entered by hand", () => {
    expect(route({ run: { place: "treadmill" } })).toBeNull();
    expect(route({ run: { activityType: "treadmill" } })).toBeNull();
    expect(route({ run: { activityType: "manual" } })).toBeNull();
  });

  it("draws none for a lift", () => {
    expect(route({ post: { type: "workout" } })).toBeNull();
  });

  it("draws none when the post shares no route, whatever the run holds", () => {
    expect(route({ post: { routePreview: [] } })).toBeNull();
    expect(route({ post: { routePreview: undefined } })).toBeNull();
  });

  it("draws none without the run or its trace", () => {
    expect(
      publicRoute({
        post: { type: "run", distance: 5000, routePreview: SHARED },
        run: null,
        zones: [],
      })
    ).toBeNull();
    expect(route({ points: [] })).toBeNull();
  });
});

describe("what is sent", () => {
  it("is latitude and longitude only, to about a metre, in about 400 points", () => {
    const trace = north(10, 5, (i) => ({
      timestamp: 1_700_000_000_000 + i * 1000,
      rawLat: START.lat,
      rawLon: START.lon,
      accuracy: 4,
      speed: 3,
    }));
    const line = route({ points: trace, km: 10 });
    expect(line).not.toBeNull();
    expect(line.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(line.length).toBeGreaterThan(MAX_POINTS / 2);
    for (const p of line) {
      expect(Object.keys(p).sort()).toEqual(["lat", "lon"]);
      expect(String(p.lat).split(".")[1].length).toBeLessThanOrEqual(5);
    }
  });

  it("does not draw across a fix it cannot read", () => {
    const trace = north(6);
    trace[60] = { lat: "x", lon: null };
    const line = route({ points: trace, km: 6 });
    expect(pieces(line)).toHaveLength(2);
  });
});
