/**
 * The GPS implied-speed gate must measure the athlete, not the filter.
 *
 * `isValidReading` rejects a fix whose implied speed exceeds 12 m/s — a
 * teleport guard. It originally computed that speed from the raw incoming
 * coordinate to `lastPoint.lat/lon`, which are KALMAN-SMOOTHED (`useGPS
 * .makePoint` stores the filter output there and keeps the unfiltered pair in
 * `rawLat`/`rawLon`). The smoothed position lags a moving runner, so the gap
 * being measured was the runner's real step PLUS the filter's lag:
 *
 *     lag          ≈ (1 − k)/k × step
 *     impliedSpeed = (lag + step) / dt = trueSpeed / k
 *
 * which turned the 12 m/s limit into an effective cap of 12 × k. Because the
 * Kalman gain falls as reported `accuracy` worsens, the gate tightened exactly
 * when fixes got noisier.
 *
 * Measured end-to-end through the real pipeline — % of true distance recorded
 * by a 3 m/s runner (5:33/km) over ten minutes, and the longest unbroken run of
 * rejected fixes:
 *
 *     accuracy   before          after
 *      5 m       99%             99%
 *      8 m       71%  (42 s)     99%
 *     12 m       52%  (79 s)     99%
 *     20 m       30%  (94 s)     98%
 *     30 m       22%  (99 s)     97%
 *
 * ── A CORRECTION, recorded because it was published wrong ──
 *
 * PRs #1952 and #1953 reported this as "1-2% recorded" and "self-perpetuating —
 * the trace never recovers". Both were artefacts of THIS harness, which used to
 * re-stamp `lastPoint.timestamp` to "1 second ago" on every iteration. That
 * pinned `timeDiff` at 1 s, so a rejection streak could never age out.
 *
 * In the real pipeline `lastPoint.timestamp` holds the time of the last
 * ACCEPTED fix, so `timeDiff` GROWS while the gate is rejecting — and since
 * `dist` grows at the runner's true speed over the same interval, the implied
 * speed decays toward the true speed and the gate lets the next fix through.
 * The streak is therefore SELF-LIMITING, not permanent: 42-99 seconds at these
 * accuracies, not forever.
 *
 * So the old behaviour was materially better than published — 71% of distance
 * at 8 m accuracy, not 1% — and the defect is "a run loses chunks and reads
 * short", not "a run records nothing". The direction of the fix is unchanged
 * and its value is unchanged; only the severity was overstated. The harness now
 * advances a fake clock with `vi.setSystemTime`, and `maxStreak` is asserted
 * below so the self-limiting property is pinned rather than re-derived.
 *
 * ── The fix ──
 *
 * Compare raw-to-raw, which is what the guard is trying to ask. A genuine
 * teleport still trips the limit — 12 m/s is 43 km/h, faster than any sprint —
 * and normal running no longer does, at any accuracy the outer gate admits.
 * `rawLat`/`rawLon` already existed on `GPSPoint`; nothing new is stored.
 *
 * ── One honest limit ──
 *
 * The jitter model is INDEPENDENT Gaussian noise per axis per fix, which
 * overstates real fix-to-fix variation: consecutive GPS fixes are strongly
 * autocorrelated because the OS fuses them with inertial data before the app
 * ever sees them. Large independent jitter degrades both variants, because
 * raw-to-raw differencing then carries several m/s of noise on its own against
 * a 12 m/s limit. Only the 0-2 m range is asserted here; beyond it the model,
 * not the implementation, is what is being measured.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { KalmanFilter, isValidReading, haversine } from "@/lib/gps";
import type { GPSPoint } from "@/lib/gps";

const M_PER_DEG_LAT = 111_320;
const START_LAT = 51.5;

function coordsAt(
  lat: number,
  lon: number,
  accuracy: number
): GeolocationCoordinates {
  return {
    latitude: lat,
    longitude: lon,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  } as unknown as GeolocationCoordinates;
}

/** Deterministic standard normal, so every number here is reproducible. */
function makeRng(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return () => {
    const u = Math.max(next(), 1e-9);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/**
 * The real pipeline: `isValidReading` → `KalmanFilter` → `haversine` between
 * smoothed points, wired as `useGPS` wires it — including the cascade, since
 * `last` only advances on an accepted fix.
 */
function record(o: {
  accuracy: number;
  speedMps: number;
  jitterM?: number;
  seconds: number;
  seed?: number;
}) {
  const rng = makeRng(o.seed ?? 1);
  const jitter = o.jitterM ?? 0;
  const filter = new KalmanFilter();
  let last: GPSPoint | null = null;
  let distance = 0;
  let rejected = 0;
  let accepted = 0;
  let streak = 0;
  let maxStreak = 0;
  // Wall-clock anchor for the simulated run, so `lastPoint.timestamp` can carry
  // the REAL time of the last accepted fix (see the note at its assignment).
  const t0 = Date.now();
  vi.useFakeTimers({ now: t0, shouldAdvanceTime: false });

  for (let t = 0; t < o.seconds; t++) {
    const lat =
      START_LAT +
      (o.speedMps * t) / M_PER_DEG_LAT +
      (rng() * jitter) / M_PER_DEG_LAT;
    const lon =
      (rng() * jitter) /
      (M_PER_DEG_LAT * Math.cos((START_LAT * Math.PI) / 180));
    /* `isValidReading` derives its interval as `Date.now() - lastPoint
       .timestamp`, so the simulated clock has to advance with `t` and the
       previous point must keep the timestamp of the fix that was actually
       ACCEPTED. An earlier version of this harness re-stamped it to "1 second
       ago" on every iteration, which pinned `timeDiff` at 1 s and made a
       rejection streak look permanent — see the header. */
    vi.setSystemTime(t0 + t * 1000);
    if (!isValidReading(coordsAt(lat, lon, o.accuracy), last, t)) {
      rejected++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      continue;
    }
    streak = 0;
    accepted++;
    const sm = filter.process(lat, lon, o.accuracy);
    const point = {
      lat: sm.lat,
      lon: sm.lon,
      altitude: null,
      accuracy: o.accuracy,
      speed: null,
      timestamp: t0 + t * 1000,
      rawLat: lat,
      rawLon: lon,
    } as GPSPoint;
    if (last) distance += haversine(last.lat, last.lon, point.lat, point.lon);
    last = point;
  }
  const truth = o.speedMps * (o.seconds - 1);
  return {
    distance,
    rejected,
    accepted,
    maxStreak,
    truth,
    ratio: distance / truth,
  };
}

const pct = (r: number) => Math.round(r * 100);

// `record` advances a fake clock; leaving it set would leak into other files.
afterEach(() => {
  vi.useRealTimers();
});

describe("GPS speed gate — the filter's lag is out of the measurement", () => {
  it("records a runner's distance at every accuracy the outer gate admits", () => {
    /* The outer accuracy gate stops at 35 m, so this is the whole admissible
       range. Before the raw-to-raw change, 8 m recorded 71% and 20 m recorded
       30% — with rejection streaks of 42 s and 94 s punched out of the trace. */
    for (const accuracy of [5, 6, 7, 8, 12, 20]) {
      const r = record({ accuracy, speedMps: 3, seconds: 300 });
      expect(pct(r.ratio), `accuracy ${accuracy}m`).toBeGreaterThan(95);
      expect(r.rejected, `accuracy ${accuracy}m`).toBe(0);
    }
  });

  it("loses a little at the worst admissible accuracy — to the filter, not the gate", () => {
    /* At 30 m the trace comes in at 94%, and the missing 6% is a DIFFERENT
       effect worth separating from the one this file is about: distance is
       summed between SMOOTHED points, and the filter's convergence lag (~50 m
       at this accuracy) is never made back over the run. No fix is rejected —
       the gate is doing its job — the smoother is simply cutting the corner it
       is designed to cut. Pinned so a future reading of "94%" is not mistaken
       for the cliff returning. */
    const r = record({ accuracy: 30, speedMps: 3, seconds: 300 });
    expect(r.rejected).toBe(0);
    expect(pct(r.ratio)).toBe(94);
  });

  it("holds up under per-fix jitter, which the old reference did not", () => {
    /* 1-2 m of independent jitter is already more fix-to-fix variation than a
       real receiver shows. The old gate lost the run at 1 m even with a 5 m
       accuracy report. */
    for (const jitterM of [1, 2]) {
      for (const accuracy of [5, 8, 20]) {
        const r = record({
          accuracy,
          speedMps: 3,
          jitterM,
          seconds: 300,
          seed: 3,
        });
        expect(
          pct(r.ratio),
          `accuracy ${accuracy}m, jitter ${jitterM}m`
        ).toBeGreaterThan(90);
      }
    }
  });

  it("records fast and slow runners alike", () => {
    /* The old gate capped a maximum recordable PACE at roughly 12 × k — about
       2.3 m/s at 8 m accuracy, so a jog recorded and a run did not. */
    for (const speedMps of [1.5, 2.5, 3, 4, 5.5]) {
      const r = record({ accuracy: 8, speedMps, seconds: 300 });
      expect(pct(r.ratio), `${speedMps} m/s`).toBeGreaterThan(95);
    }
  });

  it("still rejects a genuine teleport", () => {
    /* The guard's actual job, unchanged: 12 m/s is 43 km/h. */
    const filter = new KalmanFilter();
    const sm = filter.process(START_LAT, 0, 8);
    const last = {
      lat: sm.lat,
      lon: sm.lon,
      altitude: null,
      accuracy: 8,
      speed: null,
      timestamp: Date.now() - 1000,
      rawLat: START_LAT,
      rawLon: 0,
    } as GPSPoint;
    const jump = coordsAt(START_LAT + 500 / M_PER_DEG_LAT, 0, 8);
    expect(isValidReading(jump, last, 60)).toBe(false);
    // And a plausible 1-second step is still accepted.
    const step = coordsAt(START_LAT + 3 / M_PER_DEG_LAT, 0, 8);
    expect(isValidReading(step, last, 60)).toBe(true);
  });

  it("a rejection streak ages out on its own — it is not a permanent cascade", () => {
    /* The property whose absence was published in #1952/#1953, pinned directly
       so it cannot be mis-stated again.

       While the gate is rejecting, `lastPoint` is frozen but its TIMESTAMP is
       frozen with it, so `timeDiff` grows at the same rate as the runner's
       distance from it. The implied speed therefore decays toward the runner's
       true speed and the next fix is admitted. Demonstrated on the OLD
       behaviour by driving the gate against the SMOOTHED reference by hand —
       the current code cannot reproduce it, which is the point. */
    const filter = new KalmanFilter();
    const t0 = Date.now();
    // Seed the filter and let it fall behind a 3 m/s runner.
    let sm = { lat: START_LAT, lon: 0 };
    for (let t = 0; t < 60; t++) {
      sm = filter.process(START_LAT + (3 * t) / M_PER_DEG_LAT, 0, 12);
    }
    const frozenAt = 60;
    const impliedAgainstSmoothed = (secondsStuck: number) => {
      const trueLat =
        START_LAT + (3 * (frozenAt + secondsStuck)) / M_PER_DEG_LAT;
      return haversine(sm.lat, sm.lon, trueLat, 0) / secondsStuck;
    };
    // One second after freezing, the lag dominates and the gate refuses.
    expect(impliedAgainstSmoothed(1)).toBeGreaterThan(12);
    // Left alone, the same comparison decays under the limit and recovers.
    expect(impliedAgainstSmoothed(30)).toBeLessThan(12);
    expect(impliedAgainstSmoothed(120)).toBeLessThan(4);
    void t0;
  });

  it("the lag that used to leak in is real, and is why raw-to-raw matters", () => {
    /* Kept as the derivation: the filter genuinely does sit this far behind a
       3 m/s runner. It is a correct property of a smoother — it simply has no
       business inside a teleport check. */
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
    expect(lagAt(30)).toBe(50.4);
    // Against a 1-second interval those lags alone imply 7.3 / 12.4 / 50.4 m/s
    // — the last two over the 12 m/s limit before the runner moves at all.
    expect(lagAt(8)).toBeGreaterThan(12);
  });
});
