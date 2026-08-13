/**
 * Phase B3 — pins the useGPS rehydration contract: appendPoints
 * restores the persisted trail, rebuilds cumulative distance via
 * haversine, and updates lastFixAt/currentPoint to match the last
 * restored point. The live GPS / watchPosition path is intentionally
 * untouched — it requires a navigator.geolocation mock that the
 * existing useRunTimer tests don't carry, and Phase B3 only depends
 * on the rehydration semantics.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGPS } from "../useGPS";
import type { GPSPoint } from "../../lib/gps";

// Controllable location-source mock for the watchdog tests. `watchOnFix`
// captures the callback watchPosition was given (so a test can choose
// whether the "watch" ever fires); `getCurrentImpl` lets a test drive the
// getCurrentPosition fallback poll.
const h = vi.hoisted(() => ({
  watchOnFix: null as PositionCallback | null,
  getCurrentImpl: null as
    | ((onFix: PositionCallback, onErr: PositionErrorCallback) => void)
    | null,
}));

vi.mock("../../lib/locationSource", () => ({
  getLocationSource: () => ({
    getCurrent: (
      _opts: PositionOptions,
      onFix: PositionCallback,
      onErr: PositionErrorCallback
    ) => {
      h.getCurrentImpl?.(onFix, onErr);
    },
    watch: (_opts: PositionOptions, onFix: PositionCallback) => {
      h.watchOnFix = onFix;
      return { clear: () => {} };
    },
  }),
}));

function geoPos(lat: number, lon: number, accuracy = 5): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function makePoint(lat: number, lon: number, ts: number): GPSPoint {
  return {
    lat,
    lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: ts,
    rawLat: lat,
    rawLon: lon,
  };
}

describe("useGPS — appendPoints (Phase B3 rehydration)", () => {
  beforeEach(() => {
    // The hook reads navigator.geolocation only inside start(); we
    // never call start() in these tests, so no mock is needed.
  });

  it("is a no-op on an empty array", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.appendPoints([]));
    expect(result.current.points).toEqual([]);
    expect(result.current.distance).toBe(0);
    expect(result.current.currentPoint).toBeNull();
    expect(result.current.lastFixAt).toBeNull();
  });

  it("appends a single point with zero added distance", () => {
    const { result } = renderHook(() => useGPS());
    const p = makePoint(51.5, -0.12, 1_000_000);
    act(() => result.current.appendPoints([p]));
    expect(result.current.points).toHaveLength(1);
    expect(result.current.distance).toBe(0);
    expect(result.current.currentPoint?.lat).toBe(51.5);
    expect(result.current.lastFixAt).toBe(1_000_000);
  });

  it("rebuilds cumulative distance across the restored trail", () => {
    // Two ~111km moves along the equator (1° lat). The haversine
    // sum must be > 0 and roughly ~222km. Generous bounds keep the
    // test resilient to haversine constant tweaks.
    const { result } = renderHook(() => useGPS());
    const trail = [
      makePoint(0, 0, 1_000_000),
      makePoint(1, 0, 1_001_000),
      makePoint(2, 0, 1_002_000),
    ];
    act(() => result.current.appendPoints(trail));
    expect(result.current.points).toHaveLength(3);
    expect(result.current.distance).toBeGreaterThan(200_000); // > 200km
    expect(result.current.distance).toBeLessThan(250_000); // < 250km
    expect(result.current.lastFixAt).toBe(1_002_000);
  });

  it("sets currentPoint to the last restored point", () => {
    const { result } = renderHook(() => useGPS());
    const trail = [
      makePoint(51.5, -0.12, 1_000_000),
      makePoint(51.51, -0.13, 1_001_000),
    ];
    act(() => result.current.appendPoints(trail));
    expect(result.current.currentPoint?.lat).toBe(51.51);
    expect(result.current.currentPoint?.lon).toBe(-0.13);
  });

  it("append after append concatenates and accumulates distance", () => {
    const { result } = renderHook(() => useGPS());
    const trail1 = [makePoint(0, 0, 1_000_000), makePoint(1, 0, 1_001_000)];
    const trail2 = [makePoint(2, 0, 1_002_000)];
    act(() => result.current.appendPoints(trail1));
    const distAfterFirst = result.current.distance;
    act(() => result.current.appendPoints(trail2));
    expect(result.current.points).toHaveLength(3);
    // Distance after the second append is the first trail's
    // distance PLUS the second trail's internal distance (0 — a
    // single point). The cross-segment gap between trail1's last
    // and trail2's only point is intentionally NOT counted —
    // appendPoints rebuilds distance from each restored array
    // internally; cross-restore stitching is by design left to a
    // future patch since a partial-resume scenario is the only
    // case where it would matter and our snapshot writes are
    // monolithic today.
    expect(result.current.distance).toBe(distAfterFirst);
  });
});

describe("useGPS — watchPosition watchdog (iOS Safari/PWA fallback)", () => {
  beforeEach(() => {
    h.watchOnFix = null;
    h.getCurrentImpl = null;
    // start() guards on navigator.geolocation being present.
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
  });

  it("records a first fix from the getCurrentPosition poll when watchPosition never fires", () => {
    // watch captures its callback but never invokes it (the iOS bug);
    // the immediate poll delivers a fix instead.
    h.getCurrentImpl = (onFix) => onFix(geoPos(51.5, -0.12));
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    expect(result.current.points.length).toBeGreaterThan(0);
    expect(result.current.isTracking).toBe(true);
    expect(result.current.currentPoint?.lat).toBeCloseTo(51.5, 1);
  });

  it("records fixes from watchPosition when it is healthy", () => {
    h.getCurrentImpl = () => {}; // poll never returns a fix
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(51.5, -0.12)));
    expect(result.current.points.length).toBeGreaterThan(0);
    expect(result.current.isTracking).toBe(true);
  });

  it("surfaces a permission-denied error from the poll", () => {
    h.getCurrentImpl = (_onFix, onErr) =>
      onErr({ code: 1, message: "denied" } as GeolocationPositionError);
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    expect(result.current.permissionState).toBe("denied");
    expect(result.current.error).toBe("denied");
  });
});

describe("useGPS — lastFixAt tracks RECEPTION, not movement", () => {
  /* The device bug, 2026-08-13. `lastFixAt` used to be stamped only when a
     fix was accepted into the trail, and `isValidReading` rejects any fix
     within 1m of the previous one — a correct jitter filter, without which
     stationary GPS noise would accumulate phantom distance.

     The consequence: standing still froze `lastFixAt`, and after 8s the run
     screen said "GPS recovering · last fix Ns ago" and never stopped, while
     the accuracy chip read ±6m with full green bars. The tell in the
     screenshots was that the reported age ran exactly `elapsed + 3s` — the
     age of the first fix, never replaced.

     Waiting at a crossing, stretching before the first step, or pausing to
     look at the phone are all normal, and all produced a permanent
     "your GPS is broken" claim on a device with a perfect lock. */

  beforeEach(() => {
    h.watchOnFix = null;
    h.getCurrentImpl = null;
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
  });

  it("advances while stationary, when every fix is a sub-metre duplicate", async () => {
    h.getCurrentImpl = () => {};
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());

    // First fix anchors the trail.
    act(() => h.watchOnFix?.(geoPos(51.5, -0.12)));
    const firstFixAt = result.current.lastFixAt;
    expect(firstFixAt).not.toBeNull();
    const pointsAfterFirst = result.current.points.length;

    // Stand still. Each subsequent fix lands well inside the 1m duplicate
    // gate, so none is recorded — 1e-6° of latitude is about 0.11m.
    await new Promise((r) => setTimeout(r, 12));
    act(() => h.watchOnFix?.(geoPos(51.500001, -0.12)));
    act(() => h.watchOnFix?.(geoPos(51.5000005, -0.1200005)));

    // Reception is current...
    expect(result.current.lastFixAt).toBeGreaterThan(firstFixAt as number);
    // ...and the jitter filter still did its job: no phantom points, no
    // phantom distance. Fixing the banner must not cost us that.
    expect(result.current.points.length).toBe(pointsAfterFirst);
    expect(result.current.distance).toBe(0);
  });

  it("advances even on a fix too coarse to record", async () => {
    // Quality is the accuracy chip's job. A poor fix still proves the
    // receiver is alive, which is the only thing this field claims.
    h.getCurrentImpl = () => {};
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(51.5, -0.12)));
    const firstFixAt = result.current.lastFixAt as number;

    await new Promise((r) => setTimeout(r, 12));
    act(() => h.watchOnFix?.(geoPos(51.5006, -0.12, 120)));

    expect(result.current.lastFixAt).toBeGreaterThan(firstFixAt);
  });

  it("does NOT advance when no fix arrives — the banner must still work", () => {
    /* The control, and the reason the other two are not enough: stamping
       unconditionally somewhere that always runs would satisfy them while
       making the GPS-loss banner permanently silent. Real loss means the
       callback stops being invoked, and nothing may move the field then. */
    h.getCurrentImpl = () => {};
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(51.5, -0.12)));
    const at = result.current.lastFixAt as number;

    // No further fixes delivered.
    expect(result.current.lastFixAt).toBe(at);
  });

  it("is null before the first fix of a session", () => {
    // `Run.tsx` returns early on null so the banner cannot fire during
    // acquisition, when "Acquiring GPS" is the correct message.
    h.getCurrentImpl = () => {};
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    expect(result.current.lastFixAt).toBeNull();
  });
});
