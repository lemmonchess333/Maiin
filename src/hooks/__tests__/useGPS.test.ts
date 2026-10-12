/**
 * Phase B3 — pins the useGPS rehydration contract: appendPoints
 * restores the persisted trail, rebuilds cumulative distance via
 * haversine, and updates lastFixAt/currentPoint to match the last
 * restored point. The live GPS / watchPosition path is intentionally
 * untouched — it requires a navigator.geolocation mock that the
 * existing useRunTimer tests don't carry, and Phase B3 only depends
 * on the rehydration semantics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGPS } from "../useGPS";
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  calculateSplits,
  type GPSPoint,
} from "../../lib/gps";

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

function geoPos(
  lat: number,
  lon: number,
  accuracy = 5,
  timestamp: unknown = Date.now(),
  speed: number | null = null
): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed,
    },
    timestamp,
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

/** Metres in one degree of latitude, by gps.ts's haversine. */
const M_PER_DEG = (6371000 * Math.PI) / 180;
/** `m` metres north of 51.5°N along the meridian through -0.12. */
const north = (m: number) => 51.5 + m / M_PER_DEG;

describe("useGPS — a point is stamped when its fix was TAKEN", () => {
  const T0 = Date.parse("2026-10-04T08:00:00Z");

  beforeEach(() => {
    h.watchOnFix = null;
    h.getCurrentImpl = () => {};
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("uses the fix's own time, not its arrival", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(51.5, -0.12, 5, T0 - 1500)));
    expect(result.current.points[0].timestamp).toBe(T0 - 1500);
    // Reception is still about arrival.
    expect(result.current.lastFixAt).toBe(T0);
  });

  it("keeps the seconds between fixes the OS hands over in one batch", () => {
    /* Ten fixes taken a second apart, 3 m apart, all delivered in the same
       millisecond — what iOS does for a backgrounded app. Stamped on
       arrival, the second fix was 3 m in 0 s: a teleport to the speed
       gate, so the whole batch after its first fix was thrown away, and
       what survived sat at one instant. */
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(north(0), -0.12, 5, T0 - 20_000)));
    vi.setSystemTime(T0);
    act(() => {
      for (let k = 1; k <= 9; k++) {
        h.watchOnFix?.(geoPos(north(3 * k), -0.12, 5, T0 - 10_000 + k * 1000));
      }
    });
    const pts = result.current.points;
    expect(pts).toHaveLength(10);
    expect(pts.slice(1).map((p) => p.timestamp - (T0 - 10_000))).toEqual([
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
    ]);
    expect(result.current.getRejectedFixCount()).toBe(0);
  });

  it("falls back to arrival when the fix's own time cannot be trusted", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    // Missing (a source that gives none), and then not a number. Built by
    // hand: passing undefined to geoPos would re-apply its default.
    const noTime = {
      ...geoPos(north(0), -0.12, 5),
      timestamp: undefined,
    } as unknown as GeolocationPosition;
    act(() => h.watchOnFix?.(noTime));
    expect(result.current.points[0].timestamp).toBe(T0);
    vi.setSystemTime(T0 + 2000);
    act(() => h.watchOnFix?.(geoPos(north(6), -0.12, 5, NaN)));
    expect(result.current.points[1].timestamp).toBe(T0 + 2000);
    // An hour in the future: a broken clock.
    vi.setSystemTime(T0 + 4000);
    act(() => h.watchOnFix?.(geoPos(north(12), -0.12, 5, T0 + 3_600_000)));
    expect(result.current.points[2].timestamp).toBe(T0 + 4000);
    // Older than the point before it: a stale cached fix.
    vi.setSystemTime(T0 + 6000);
    act(() => h.watchOnFix?.(geoPos(north(18), -0.12, 5, T0 + 1000)));
    expect(result.current.points[3].timestamp).toBe(T0 + 6000);
  });
});

describe("useGPS — holds: the trace stops when the run's clock does", () => {
  const T0 = Date.parse("2026-10-04T08:00:00Z");

  beforeEach(() => {
    h.watchOnFix = null;
    h.getCurrentImpl = () => {};
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  /** Deliver a fix taken now, `m` metres north, then step the clock 1 s. */
  function fixAt(m: number, speed: number | null = null) {
    act(() => h.watchOnFix?.(geoPos(north(m), -0.12, 5, Date.now(), speed)));
    vi.setSystemTime(Date.now() + 1000);
  }

  it("records no drift while held, and stamps the next point with the time held", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    fixAt(0);
    fixAt(3);
    const before = result.current.points.length;
    const distanceBefore = result.current.distance;

    // Auto-pause at the crossing: a minute of GPS wander, 1–2 m a fix,
    // and one fix too coarse to use.
    act(() => result.current.pause());
    const heldFrom = Date.now();
    for (let k = 0; k < 59; k++) fixAt(3 + (k % 2 ? 2 : -1), 0.1);
    act(() => h.watchOnFix?.(geoPos(north(40), -0.12, 120, Date.now())));
    vi.setSystemTime(Date.now() + 1000);
    expect(result.current.points.length).toBe(before);
    expect(result.current.distance).toBe(distanceBefore);
    // The dot still follows the runner, and auto-resume can read the speed.
    expect(result.current.currentPoint?.speed).toBe(0.1);
    // A held fix is not a bad fix.
    expect(result.current.getRejectedFixCount()).toBe(0);

    act(() => result.current.resume());
    const heldMs = Date.now() - heldFrom;
    fixAt(6);
    const resumed = result.current.points[result.current.points.length - 1];
    expect(result.current.points.length).toBe(before + 1);
    expect(resumed.pausedMs).toBe(heldMs);
    // Only the step after the resume (smoothed, so a little under 3 m).
    expect(result.current.distance).toBeGreaterThan(distanceBefore);
    expect(result.current.distance).toBeLessThan(distanceBefore + 3.01);
  });

  it("does not record a fix taken while held, however late it arrives", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    fixAt(0);
    act(() => result.current.pause());
    vi.setSystemTime(Date.now() + 30_000);
    act(() => result.current.resume());
    const resumedAt = Date.now();
    vi.setSystemTime(resumedAt + 200);
    // Taken half a second before the resume, delivered after it.
    act(() => h.watchOnFix?.(geoPos(north(5), -0.12, 5, resumedAt - 500)));
    expect(result.current.points).toHaveLength(1);
  });

  it("does not count a lift taken while paused as distance", () => {
    /* Paused, driven 2 km, resumed. The line to the first fix after the
       resume is credited only as far as the clock-running seconds either
       side of the stop could carry a runner. */
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    fixAt(0);
    act(() => result.current.pause());
    vi.setSystemTime(Date.now() + 600_000);
    act(() => result.current.resume());
    vi.setSystemTime(Date.now() + 1000);
    act(() => h.watchOnFix?.(geoPos(north(2000), -0.12, 5, Date.now())));
    expect(result.current.points).toHaveLength(2);
    // 1 s before the hold began + 1 s after it ended, at most.
    expect(result.current.distance).toBeLessThanOrEqual(
      2 * MAX_PLAUSIBLE_SPEED_MPS + 1e-6
    );
  });

  it("times a split without the wait — end to end through the hook", () => {
    /* 1.2 km at 5:00/km, a fix a second, with a five-minute auto-pause at
       600 m. km 1 must read 5:00, as the timer does — plus the ~2.4 s the
       position filter's lag (~8 m at this pace) adds to any kilometre. On
       the wall clock it read 10:02. */
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    for (let s = 0; s <= 180; s++) fixAt((s * 10) / 3);
    act(() => result.current.pause());
    vi.setSystemTime(Date.now() + 300_000);
    act(() => result.current.resume());
    for (let s = 181; s <= 360; s++) fixAt((s * 10) / 3);
    const [km1] = calculateSplits(result.current.points);
    expect(km1.time).toBeGreaterThan(299);
    expect(km1.time).toBeLessThan(306);
  });

  it("carries a restored trail's held time on, and holds from when the app went away", () => {
    /* The app died 10 minutes ago; the snapshot's last write was 2 s after
       its last point. The trail had already been held 5 s (the
       countdown). The next point must take out the 5 s AND the dead time
       since the write — not just one of them. */
    const { result } = renderHook(() => useGPS());
    const lastAt = T0 - 600_000;
    act(() =>
      result.current.appendPoints([
        makePoint(north(0), -0.12, lastAt - 1000),
        { ...makePoint(north(3), -0.12, lastAt), pausedMs: 5000 },
      ])
    );
    act(() => result.current.pause(lastAt + 2000));
    act(() => result.current.start());
    act(() => result.current.resume());
    vi.setSystemTime(T0 + 1000);
    act(() => h.watchOnFix?.(geoPos(north(6), -0.12, 5, Date.now())));
    const pts = result.current.points;
    expect(pts).toHaveLength(3);
    expect(pts[2].pausedMs).toBe(5000 + (T0 - (lastAt + 2000)));
  });

  it("starts a fresh trace with nothing held", () => {
    /* A hold left over from before the trace began (nothing recorded yet)
       must not swallow the new run's first fixes. */
    const { result } = renderHook(() => useGPS());
    act(() => result.current.pause());
    vi.setSystemTime(Date.now() + 5000);
    act(() => result.current.start());
    fixAt(0);
    fixAt(3);
    expect(result.current.points).toHaveLength(2);
    expect(result.current.points[1].pausedMs).toBeUndefined();
  });

  it("never backdates a hold past the last recorded point", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    fixAt(0);
    const lastAt = result.current.points[0].timestamp;
    act(() => result.current.pause(lastAt - 60_000));
    vi.setSystemTime(lastAt + 10_000);
    act(() => result.current.resume());
    vi.setSystemTime(lastAt + 11_000);
    act(() => h.watchOnFix?.(geoPos(north(3), -0.12, 5, Date.now())));
    expect(result.current.points[1].pausedMs).toBe(10_000);
  });
});

describe("useGPS — standing still is not a weak signal", () => {
  /* Route quality reads the count of rejected fixes: more than 20 and the
     route is "poor". A fix that had not moved a metre counted as one, so
     twenty seconds at a crossing with auto-pause off marked a clean route
     poor. */
  const T0 = Date.parse("2026-10-04T08:00:00Z");

  beforeEach(() => {
    h.watchOnFix = null;
    h.getCurrentImpl = () => {};
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("adds nothing for a fix that has not moved, and counts it as no fault", () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.start());
    act(() => h.watchOnFix?.(geoPos(north(0), -0.12, 5, Date.now())));
    for (let s = 1; s <= 30; s++) {
      vi.setSystemTime(T0 + s * 1000);
      act(() => h.watchOnFix?.(geoPos(north(0.3), -0.12, 5, Date.now())));
    }
    expect(result.current.points).toHaveLength(1);
    expect(result.current.getRejectedFixCount()).toBe(0);
    // Anchor: a fix the trace cannot believe still counts.
    vi.setSystemTime(T0 + 31_000);
    act(() => h.watchOnFix?.(geoPos(north(20), -0.12, 80, Date.now())));
    expect(result.current.getRejectedFixCount()).toBe(1);
  });
});
