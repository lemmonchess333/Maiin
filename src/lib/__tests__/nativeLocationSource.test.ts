/**
 * RUN-01 Step 2 — the native source's shape translation. The plugin itself is
 * device-only; what IS unit-testable (and what a mistake here silently
 * corrupts) is the mapping from the plugin's Location/error shapes to the Web
 * Geolocation shapes the point pipeline (isValidReading → Kalman) consumes,
 * plus the platform branch in getLocationSource().
 */
import { describe, it, expect, vi } from "vitest";
import {
  toGeolocationPosition,
  toGeolocationError,
  nativeLocationSource,
} from "../nativeLocationSource";
import { climbBySegment, type GPSPoint } from "../gps";

describe("toGeolocationPosition", () => {
  it("maps plugin fields onto the Web Geolocation shape (bearing → heading)", () => {
    const pos = toGeolocationPosition({
      latitude: 51.5,
      longitude: -0.12,
      accuracy: 8,
      altitude: 33,
      altitudeAccuracy: 4,
      simulated: false,
      bearing: 270,
      speed: 3.2,
      time: 1_700_000_000_000,
    });
    expect(pos.coords.latitude).toBe(51.5);
    expect(pos.coords.longitude).toBe(-0.12);
    expect(pos.coords.accuracy).toBe(8);
    expect(pos.coords.altitude).toBe(33);
    expect(pos.coords.altitudeAccuracy).toBe(4);
    expect(pos.coords.heading).toBe(270); // bearing → heading
    expect(pos.coords.speed).toBe(3.2);
    expect(pos.timestamp).toBe(1_700_000_000_000);
  });

  it("falls back to now for a null time (some Android fixes omit it)", () => {
    const before = Date.now();
    const pos = toGeolocationPosition({
      latitude: 0,
      longitude: 0,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      simulated: false,
      bearing: null,
      speed: null,
      time: null,
    });
    expect(pos.timestamp).toBeGreaterThanOrEqual(before);
    expect(pos.coords.altitude).toBeNull();
    expect(pos.coords.heading).toBeNull();
  });
});

describe("a fix's altitude", () => {
  const fix = (altitude: number | null, altitudeAccuracy: number | null) =>
    toGeolocationPosition({
      latitude: 51.5,
      longitude: -0.12,
      accuracy: 65,
      altitude,
      altitudeAccuracy,
      simulated: false,
      bearing: null,
      speed: null,
      time: 1_700_000_000_000,
    });

  it("is none when iOS marks it unmeasured, as the web's Geolocation says", () => {
    // A Wi-Fi fix: CLLocation sends altitude 0 with verticalAccuracy -1.
    const pos = fix(0, -1);
    expect(pos.coords.altitude).toBeNull();
    expect(pos.coords.altitudeAccuracy).toBeNull();
    // The position itself still counts.
    expect(pos.coords.latitude).toBe(51.5);
    expect(pos.coords.accuracy).toBe(65);
  });

  it("is kept when it was measured, at sea level too", () => {
    expect(fix(0, 3).coords.altitude).toBe(0);
    expect(fix(12.5, 4).coords.altitude).toBe(12.5);
  });

  it("adds no climb to a flat run that began on Wi-Fi fixes", () => {
    // Ten Wi-Fi fixes (altitude 0, unmeasured), then GPS on flat ground at
    // 45 m. Read as 0, the run climbed 45 m before it had gone anywhere.
    const fixes = [
      ...Array.from({ length: 10 }, () => fix(0, -1)),
      ...Array.from({ length: 40 }, () => fix(45, 4)),
    ];
    const points: GPSPoint[] = fixes.map((pos, i) => ({
      lat: pos.coords.latitude + i * 0.0001,
      lon: pos.coords.longitude,
      altitude: pos.coords.altitude,
      accuracy: pos.coords.accuracy,
      speed: null,
      timestamp: 1_700_000_000_000 + i * 1000,
      rawLat: pos.coords.latitude + i * 0.0001,
      rawLon: pos.coords.longitude,
    }));
    const { gain } = climbBySegment(points);
    expect(gain.reduce((sum, metres) => sum + metres, 0)).toBe(0);
  });

  it("is kept when the platform gives no accuracy for it", () => {
    // Android can leave the vertical accuracy out on older versions.
    expect(fix(40, null).coords.altitude).toBe(40);
  });
});

describe("toGeolocationError", () => {
  it("NOT_AUTHORIZED maps to PERMISSION_DENIED (code 1) so the existing denied UX fires", () => {
    const err = toGeolocationError(
      Object.assign(new Error("Permission was denied"), {
        code: "NOT_AUTHORIZED",
      })
    );
    expect(err.code).toBe(1);
    expect(err.PERMISSION_DENIED).toBe(1);
    expect(err.message).toBe("Permission was denied");
  });

  it("anything else maps to POSITION_UNAVAILABLE (code 2)", () => {
    expect(toGeolocationError(new Error("GPS glitch")).code).toBe(2);
    expect(toGeolocationError(new Error("")).message).toBe(
      "Position unavailable"
    );
  });
});

describe("nativeLocationSource (plugin absent — e.g. web import)", () => {
  it("watch() is safe: no throw, clear() is a no-op, no callbacks fire", async () => {
    // In this test env the dynamic import of the plugin resolves, but the
    // registered proxy has no native implementation — the adapter must stay
    // inert rather than crash the run screen.
    const onFix = vi.fn();
    const onErr = vi.fn();
    const handle = nativeLocationSource.watch(
      { enableHighAccuracy: true },
      onFix,
      onErr
    );
    expect(() => handle.clear()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(onFix).not.toHaveBeenCalled();
  });
});
