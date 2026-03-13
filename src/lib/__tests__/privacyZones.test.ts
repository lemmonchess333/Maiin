import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyPrivacyZones, type PrivacyZone } from "@/lib/privacyZones";
import type { GPSPoint } from "@/lib/gps";

function makePoint(lat: number, lon: number, t: number): GPSPoint {
  return { lat, lon, rawLat: lat, rawLon: lon, altitude: 10, timestamp: t, speed: 3, accuracy: 5 };
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
const outsidePoint1 = makePoint(51.55, -0.10, 3000);
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
    const points = [insidePoint1, insidePoint2, outsidePoint1, outsidePoint2, outsidePoint3];
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
    const points = [outsidePoint1, outsidePoint2, outsidePoint3, insidePoint1, insidePoint2];
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
