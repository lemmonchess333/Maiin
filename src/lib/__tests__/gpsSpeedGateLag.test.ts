/**
 * The GPS implied-speed gate measures speed ÷ filter gain, not speed.
 *
 * `isValidReading` rejects a fix whose implied speed exceeds 12 m/s — a
 * teleport guard, and a sensible one. But it computes that speed from the
 * RAW incoming coordinate to `lastPoint`, and `lastPoint.lat/lon` are
 * KALMAN-SMOOTHED (`useGPS.makePoint` stores the filter output there, keeping
 * the unfiltered pair in `rawLat`/`rawLon`). The smoothed position lags a
 * moving runner, so the measured gap is the runner's real step PLUS the
 * filter's lag.
 *
 * That makes the gate's reading a function of the filter, not just the athlete:
 *
 *     lag        ≈ (1 − k) / k × step        (exponential filter tracking a ramp)
 *     dist       = lag + step = step / k
 *     impliedSpeed = dist / dt = trueSpeed / k
 *
 * where k is the Kalman gain. So the 12 m/s limit is really a cap of 12 × k,
 * and k falls as the reported `accuracy` worsens — the filter trusts a poor fix
 * less, lags further, and the gate reads a faster phantom speed.
 *
 * Two consequences follow, and both are asserted below because both are
 * counter-intuitive.
 *
 * **It is rate-invariant.** Halving the fix rate doubles both the gap and the
 * elapsed time, so the ratio is unchanged. Sampling more slowly does not help,
 * which rules out the obvious first explanation for a run recording short.
 *
 * **It is a cliff, not a slope.** Measured on a clean, noise-free 3 m/s runner
 * (5:33/km) driven through the real pipeline — `isValidReading` → `KalmanFilter`
 * → `haversine`:
 *
 *     reported accuracy   distance recorded
 *     4 m                 99%
 *     5 m                 99%
 *     6 m                 99%
 *     7 m                  2%      ← every fix after the first few rejected
 *     8 m                  2%
 *     15 m                 1%
 *
 * One metre of reported accuracy separates a complete trace from an empty one,
 * because once a fix is rejected `lastPoint` stops advancing, the gap to the
 * moving runner grows, and every subsequent fix is rejected too.
 *
 * Equivalently, at a given accuracy there is a maximum recordable PACE. At 8 m
 * (k ≈ 0.19) it is about 2.3 m/s — roughly 7:15/km. Slower than that records
 * fine; faster records nothing.
 *
 * ── Status: mechanism proven, field impact NOT measured ──
 *
 * Everything above is derived from the code and reproduced here, so the
 * mechanism is not in question. What this canNOT establish from a sandbox is
 * how often real devices report ≥7 m: if `enableHighAccuracy` outdoors
 * typically yields 3-5 m, the app works and falls off this cliff only in cities
 * and tree cover — which would present as "it sometimes loses my run" or
 * "distance reads short", not as an obvious breakage. That distribution needs
 * one device session to settle, and this file deliberately does not claim the
 * app is broken.
 *
 * Worth noting `routeQuality.ts` already surfaces `rejectedFixCount`, described
 * as "high counts here suggest the raw GPS signal was unreliable even when
 * fixes arrived". This says a share of those rejections are the gate comparing
 * against its own filter's lag rather than the signal being bad.
 *
 * ── The candidate fix, not applied ──
 *
 * `GPSPoint` already carries `rawLat`/`rawLon`. Comparing raw-to-raw would make
 * the gate measure the athlete's actual step and remove the filter from the
 * teleport check entirely — which is what the guard is trying to do. It is left
 * unapplied because it changes recorded distance for real runs and the
 * before/after belongs on a device, not in a sandbox.
 */
import { describe, it, expect } from "vitest";
import { KalmanFilter, isValidReading, haversine } from "@/lib/gps";
import type { GPSPoint } from "@/lib/gps";

const M_PER_DEG_LAT = 111_320;
const START_LAT = 51.5;

function coordsAt(lat: number, accuracy: number): GeolocationCoordinates {
  return {
    latitude: lat,
    longitude: 0,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  } as unknown as GeolocationCoordinates;
}

/**
 * The real pipeline, driven with a NOISE-FREE runner heading due north at a
 * constant speed: `isValidReading` (raw vs last smoothed) → `KalmanFilter` →
 * `haversine` between smoothed points, exactly as `useGPS` wires it.
 *
 * Noise-free on purpose — any rejection here is the gate reacting to the
 * filter, not to a bad fix.
 */
function record(o: {
  accuracy: number;
  speedMps: number;
  fixIntervalS: number;
  seconds: number;
}) {
  const filter = new KalmanFilter();
  let last: GPSPoint | null = null;
  let distance = 0;
  let rejected = 0;
  let accepted = 0;

  for (let t = 0; t < o.seconds; t += o.fixIntervalS) {
    const lat = START_LAT + (o.speedMps * t) / M_PER_DEG_LAT;
    // `isValidReading` derives its interval from `Date.now()`, so the previous
    // point is stamped one interval into the past to imply the sample rate.
    if (last) last.timestamp = Date.now() - o.fixIntervalS * 1000;
    if (!isValidReading(coordsAt(lat, o.accuracy), last, t)) {
      rejected++;
      continue;
    }
    accepted++;
    const sm = filter.process(lat, 0, o.accuracy);
    const point = {
      lat: sm.lat,
      lon: sm.lon,
      altitude: null,
      accuracy: o.accuracy,
      speed: null,
      timestamp: Date.now(),
      rawLat: lat,
      rawLon: 0,
    } as GPSPoint;
    if (last) distance += haversine(last.lat, last.lon, point.lat, point.lon);
    last = point;
  }
  const truth = o.speedMps * (o.seconds - o.fixIntervalS);
  return { distance, rejected, accepted, truth, ratio: distance / truth };
}

const pct = (r: number) => Math.round(r * 100);

describe("GPS speed gate — the smoothed lag is inside the measurement", () => {
  it("the Kalman lag grows with reported accuracy", () => {
    /* The input to everything else. A clean ramp at 3 m/s, no noise: how far
       behind the truth does the filter settle? */
    const lagAt = (accuracy: number) => {
      const f = new KalmanFilter();
      let lag = 0;
      for (let t = 0; t < 120; t++) {
        const trueLat = START_LAT + (3 * t) / M_PER_DEG_LAT;
        const sm = f.process(trueLat, 0, accuracy);
        lag = (trueLat - sm.lat) * M_PER_DEG_LAT;
      }
      return Math.round(lag * 10) / 10;
    };
    expect(lagAt(5)).toBe(7.3);
    expect(lagAt(8)).toBe(12.4);
    expect(lagAt(15)).toBe(24.5);
    expect(lagAt(30)).toBe(50.4);
  });

  it("is a one-metre cliff, not a gradual degradation", () => {
    const at = (accuracy: number) =>
      pct(record({ accuracy, speedMps: 3, fixIntervalS: 1, seconds: 300 }).ratio);
    expect(at(4)).toBe(99);
    expect(at(5)).toBe(99);
    expect(at(6)).toBe(99);
    // One metre of reported accuracy later:
    expect(at(7)).toBe(2);
    expect(at(8)).toBe(2);
    expect(at(15)).toBe(1);
  });

  it("does not improve at a slower fix rate — the ratio is scale-free", () => {
    /* The counter-intuitive half, and the one that rules out the obvious
       explanation: the gap and the elapsed time both scale with the interval,
       so `dist / dt` is unchanged. Sampling less often cannot rescue it. */
    for (const fixIntervalS of [1, 2, 3]) {
      const good = record({ accuracy: 5, speedMps: 3, fixIntervalS, seconds: 300 });
      const poor = record({ accuracy: 8, speedMps: 3, fixIntervalS, seconds: 300 });
      expect(pct(good.ratio), `${fixIntervalS}s @5m`).toBeGreaterThan(95);
      expect(pct(poor.ratio), `${fixIntervalS}s @8m`).toBeLessThan(10);
    }
  });

  it("caps a maximum recordable PACE at each accuracy", () => {
    /* Restated as the thing an athlete would notice. At 8 m the gate admits
       roughly 12 × k ≈ 2.3 m/s; a jog records, a run does not. */
    const at = (speedMps: number) =>
      pct(record({ accuracy: 8, speedMps, fixIntervalS: 1, seconds: 300 }).ratio);
    expect(at(1.5)).toBeGreaterThan(95); // 11:07/km — fine
    expect(at(2.0)).toBeGreaterThan(95); // 8:20/km  — fine
    expect(at(2.5)).toBeLessThan(10); //  6:40/km  — gone
    expect(at(3.0)).toBeLessThan(10); //  5:33/km  — gone
    expect(at(5.0)).toBeLessThan(10); //  3:20/km  — gone
  });

  it("a rejection is self-perpetuating, which is why it is a cliff", () => {
    /* `lastPoint` only advances on an ACCEPTED fix, so once one is refused the
       runner keeps moving away from a frozen reference and every later fix
       implies an even faster speed. The trace does not recover on its own. */
    const r = record({ accuracy: 8, speedMps: 3, fixIntervalS: 1, seconds: 300 });
    expect(r.accepted).toBeLessThan(15);
    expect(r.rejected).toBeGreaterThan(280);
  });

  it("raw-to-raw would measure the athlete instead — the candidate fix", () => {
    /* Not applied; asserted so the proposal is concrete rather than a comment.
       `GPSPoint` already stores `rawLat`/`rawLon`, and the distance between
       consecutive RAW positions is the runner's actual step — 3 m at 3 m/s,
       nowhere near the 12 m/s limit, at any accuracy. The filter's lag has no
       business inside a teleport check. */
    const step = haversine(
      START_LAT,
      0,
      START_LAT + 3 / M_PER_DEG_LAT,
      0
    );
    expect(Math.round(step)).toBe(3);
    expect(step).toBeLessThan(12); // would never trip the gate
  });
});
