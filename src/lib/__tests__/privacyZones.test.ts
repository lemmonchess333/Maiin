import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyPrivacyZones, type PrivacyZone } from "@/lib/privacyZones";
import type { GPSPoint } from "@/lib/gps";

function makePoint(lat: number, lon: number, t: number): GPSPoint {
  return {
    lat,
    lon,
    rawLat: lat,
    rawLon: lon,
    altitude: 10,
    timestamp: t,
    speed: 3,
    accuracy: 5,
  };
}

// Zone centered on London (51.5074, -0.1278), 200m radius
const londonZone: PrivacyZone = {
  id: "home",
  name: "Home",
  lat: 51.5074,
  lon: -0.1278,
  radiusMeters: 200,
};

// Points inside the zone (very close to zone center)
const insidePoint1 = makePoint(51.5074, -0.1278, 1000);
const insidePoint2 = makePoint(51.5075, -0.1279, 2000);

// Points clearly outside the zone (~5km away)
const outsidePoint1 = makePoint(51.55, -0.1, 3000);
const outsidePoint2 = makePoint(51.56, -0.09, 4000);
const outsidePoint3 = makePoint(51.57, -0.08, 5000);

describe("applyPrivacyZones", () => {
  beforeEach(() => {
    // Fix Math.random so the ±10% variation is deterministic
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns original points when zones array is empty", () => {
    const points = [outsidePoint1, outsidePoint2];
    expect(applyPrivacyZones(points, [])).toBe(points);
  });

  it("returns empty array when points array is empty", () => {
    // With no zones it returns the empty array reference directly
    const result = applyPrivacyZones([], [londonZone]);
    expect(result).toEqual([]);
  });

  it("trims points at the start that are inside a zone", () => {
    const points = [
      insidePoint1,
      insidePoint2,
      outsidePoint1,
      outsidePoint2,
      outsidePoint3,
    ];
    const result = applyPrivacyZones(points, [londonZone]);
    // The two inside points at the start should be removed
    // All remaining points should be outside the zone
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(p.lat).not.toBe(insidePoint1.lat);
    }
  });

  it("trims points at the end that are inside a zone", () => {
    const points = [
      outsidePoint1,
      outsidePoint2,
      outsidePoint3,
      insidePoint1,
      insidePoint2,
    ];
    const result = applyPrivacyZones(points, [londonZone]);
    // The two inside points at the end should be removed
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(p.lat).not.toBe(insidePoint1.lat);
    }
  });

  it("returns outside points unchanged when random variation is 0", () => {
    // All points outside, no trimming needed
    const points = [outsidePoint1, outsidePoint2, outsidePoint3];
    const result = applyPrivacyZones(points, [londonZone]);
    // With Math.random() = 0, variation adds 0 to start and subtracts 0 from end
    expect(result).toEqual(points);
  });
});

/**
 * Interior crossings — the case that was never tested and never worked.
 *
 * `applyPrivacyZones` used to trim inward from each end and `break` at the
 * first point outside a zone, so any crossing in the MIDDLE of a route
 * survived. An out-and-back past your own front door, or a loop starting at
 * the park that passes home halfway, published the exact home coordinates.
 *
 * Every fixture above starts or ends inside the zone; none crosses one
 * mid-route. That is why the gap survived, and why `LAUNCH_TODO.md` carried
 * privacy zones as "verified".
 *
 * `Math.random` is pinned to 0 by the suite's `beforeEach`, so the jitter
 * margin is 0 and these assert the removal itself rather than the padding.
 */
describe("applyPrivacyZones — interior crossings", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes a zone crossing in the middle of a route", () => {
    const points = [
      outsidePoint1,
      outsidePoint2,
      insidePoint1, // home, mid-route
      insidePoint2, // home, mid-route
      outsidePoint3,
    ];
    const result = applyPrivacyZones(points, [londonZone]);
    expect(result).toEqual([outsidePoint1, outsidePoint2, outsidePoint3]);
    // Stated as its own assertion because it is the actual privacy claim.
    expect(result).not.toContain(insidePoint1);
    expect(result).not.toContain(insidePoint2);
  });

  it("removes several separate crossings in one route", () => {
    // A loop that passes home twice — common on a two-lap route.
    const points = [
      outsidePoint1,
      insidePoint1,
      outsidePoint2,
      insidePoint2,
      outsidePoint3,
    ];
    const result = applyPrivacyZones(points, [londonZone]);
    expect(result).toEqual([outsidePoint1, outsidePoint2, outsidePoint3]);
  });

  it("still keeps a route that never enters a zone untouched", () => {
    /* Guards the guard: "drop everything" would satisfy every assertion
       above. The identity check also pins that a zone-free route is not
       needlessly copied. */
    const points = [outsidePoint1, outsidePoint2, outsidePoint3];
    expect(applyPrivacyZones(points, [londonZone])).toBe(points);
  });

  it("returns nothing when the whole route is inside a zone", () => {
    const points = [insidePoint1, insidePoint2];
    expect(applyPrivacyZones(points, [londonZone])).toEqual([]);
  });

  it("honours every configured zone, not just the first", () => {
    // Two homes / home + work. A second zone was never exercised.
    const workZone: PrivacyZone = {
      id: "work",
      name: "Work",
      lat: 51.55,
      lon: -0.1,
      radiusMeters: 200,
    };
    const points = [outsidePoint2, insidePoint1, outsidePoint1, outsidePoint3];
    const result = applyPrivacyZones(points, [londonZone, workZone]);
    // outsidePoint1 sits at the centre of workZone.
    expect(result).toEqual([outsidePoint2, outsidePoint3]);
  });
});

describe("applyPrivacyZones — cut jitter", () => {
  it("drops extra points around a crossing so cuts miss the zone edge", () => {
    /* The surviving endpoints must not sit exactly on the zone circle: an
       observer who has them can fit a circle and recover its centre, which
       is the house. With Math.random() at its maximum the margin is a full
       10% of the run either side, so more than the in-zone points go. */
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const inZone = Array.from({ length: 10 }, (_, i) =>
      makePoint(51.5074 + i * 0.00001, -0.1278, 2000 + i)
    );
    const points = [outsidePoint1, outsidePoint2, ...inZone, outsidePoint3];
    const result = applyPrivacyZones(points, [londonZone]);
    /* 13 points in total, so variation is ceil(13 * 0.1) = 2 and the margin
       is 1 either side: the 10 in-zone points plus one neighbour each way. */
    expect(result.length).toBe(1);
    expect(result).not.toContain(outsidePoint2); // the neighbour before
    expect(result).not.toContain(outsidePoint3); // the neighbour after
    for (const p of inZone) expect(result).not.toContain(p);
    vi.restoreAllMocks();
  });
});
