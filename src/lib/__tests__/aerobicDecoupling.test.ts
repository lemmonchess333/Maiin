import { describe, it, expect } from "vitest";
import {
  computeAerobicDecoupling,
  classifyDecoupling,
  DECOUPLING_MIN_MOVING_SECONDS,
} from "../aerobicDecoupling";
import type { GPSPoint } from "../gps";
import type { ActiveRunInterval, HeartRateSample } from "../hrZones";

const START_MS = 1_790_000_000_000;

/**
 * Generate steady north-bound GPS points where 0.00001° lat ≈ 1.11195 m.
 * `firstHalfSpeedMps` applies for the first half of `durationSec`, and
 * `secondHalfSpeedMps` applies for the second half.
 */
function buildPoints(
  durationSec: number,
  firstHalfSpeedMps: number,
  secondHalfSpeedMps: number,
  stepSec = 10,
  pauseMidSec = 0
): GPSPoint[] {
  const halfSec = durationSec / 2;
  const pts: GPSPoint[] = [];
  let lat = 51.5;
  let ts = START_MS;
  for (let t = 0; t <= durationSec; t += stepSec) {
    if (t > 0) {
      const speed = t <= halfSec ? firstHalfSpeedMps : secondHalfSpeedMps;
      const dMeters = speed * stepSec;
      lat += dMeters / 111_195;
      ts += stepSec * 1000;
    }
    const justAfterPause = pauseMidSec > 0 && t === halfSec + stepSec;
    if (justAfterPause) {
      ts += pauseMidSec * 1000;
    }
    pts.push({
      lat,
      lon: -0.1,
      rawLat: lat,
      rawLon: -0.1,
      timestamp: ts,
      altitude: 10,
      accuracy: 5,
      speed: t <= halfSec ? firstHalfSpeedMps : secondHalfSpeedMps,
      ...(justAfterPause ? { breakBefore: true } : {}),
    });
  }
  return pts;
}

function buildHrSamples(
  durationSec: number,
  firstBpm: number,
  secondBpm: number,
  stepSec = 5,
  pauseMidSec = 0,
  source: "apple-watch" | "bluetooth" = "apple-watch"
): HeartRateSample[] {
  const halfSec = durationSec / 2;
  const samples: HeartRateSample[] = [];
  for (let t = 0; t < durationSec; t += stepSec) {
    const inSecond = t >= halfSec;
    const at = START_MS + t * 1000 + (inSecond ? pauseMidSec * 1000 : 0);
    samples.push({
      at,
      bpm: inSecond ? secondBpm : firstBpm,
      source,
    });
  }
  return samples;
}

describe("computeAerobicDecoupling", () => {
  it("classifies Friel/Coggan bands accurately", () => {
    expect(classifyDecoupling(-1.2)).toBe("steady");
    expect(classifyDecoupling(4.9)).toBe("steady");
    expect(classifyDecoupling(5.0)).toBe("mild_drift");
    expect(classifyDecoupling(10.0)).toBe("mild_drift");
    expect(classifyDecoupling(10.1)).toBe("high_drift");
  });

  it("reports steady decoupling (< 5%) when pace and HR hold steady across a 40 min run", () => {
    const durationSec = 40 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0);
    const samples = buildHrSamples(durationSec, 145, 148); // ~2.0% drift

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points,
      plan: { activityType: "easy" },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("steady");
    expect(result!.firstHalfAvgBpm).toBe(146);
    expect(result!.secondHalfAvgBpm).toBe(148);
    expect(result!.pct).toBeCloseTo(1.4, 0);
  });

  it("reports mild_drift (5–10%) when HR rises modestly at constant pace", () => {
    const durationSec = 40 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0);
    const samples = buildHrSamples(durationSec, 140, 154); // ~6.1% post-warmup drift

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points,
      plan: { activityType: "long" },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("mild_drift");
    expect(result!.pct).toBeGreaterThanOrEqual(5);
    expect(result!.pct).toBeLessThanOrEqual(10);
  });

  it("reports high_drift (> 10%) when runner slows down while HR climbs", () => {
    const durationSec = 60 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.2, 2.8);
    const samples = buildHrSamples(durationSec, 145, 160);

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points,
      plan: { activityType: "long" },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("high_drift");
    expect(result!.pct).toBeGreaterThan(15);
  });

  it("splits on moving time across a mid-run pause", () => {
    const durationSec = 40 * 60;
    const halfMs = (durationSec / 2) * 1000;
    const pauseSec = 300;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + halfMs },
      {
        startMs: START_MS + halfMs + pauseSec * 1000,
        endMs: START_MS + durationSec * 1000 + pauseSec * 1000,
      },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0, 10, pauseSec);
    const samples = buildHrSamples(durationSec, 142, 142, 5, pauseSec);

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points,
      plan: { activityType: "easy" },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("steady");
    expect(Math.abs(result!.pct)).toBeLessThan(2);
  });

  it("returns null for runs under 30 minutes", () => {
    const durationSec = DECOUPLING_MIN_MOVING_SECONDS - 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const result = computeAerobicDecoupling({
      samples: buildHrSamples(durationSec, 145, 155),
      activeIntervals,
      points: buildPoints(durationSec, 3.0, 3.0),
      plan: { activityType: "easy" },
    });
    expect(result).toBeNull();
  });

  it("returns null for interval and race sessions", () => {
    const durationSec = 40 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0);
    const samples = buildHrSamples(durationSec, 150, 165);

    expect(
      computeAerobicDecoupling({
        samples,
        activeIntervals,
        points,
        plan: { activityType: "intervals" },
      })
    ).toBeNull();
    expect(
      computeAerobicDecoupling({
        samples,
        activeIntervals,
        points,
        plan: { activityType: "race" },
      })
    ).toBeNull();
  });

  it("returns null when either half has < 50% HR coverage", () => {
    const durationSec = 40 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    // Only first half has HR readings.
    const firstHalfOnly = buildHrSamples(durationSec / 2, 145, 145);
    expect(
      computeAerobicDecoupling({
        samples: firstHalfOnly,
        activeIntervals,
        points: buildPoints(durationSec, 3.0, 3.0),
        plan: { activityType: "easy" },
      })
    ).toBeNull();
  });

  it("prefers Bluetooth strap readings over Watch readings when both overlap", () => {
    const durationSec = 40 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0);
    const watchSamples = buildHrSamples(
      durationSec,
      130,
      180,
      5,
      0,
      "apple-watch"
    );
    const strapSamples = buildHrSamples(
      durationSec,
      145,
      146,
      5,
      0,
      "bluetooth"
    );

    const result = computeAerobicDecoupling({
      samples: [...watchSamples, ...strapSamples],
      activeIntervals,
      points,
      plan: { activityType: "easy" },
    });

    expect(result).not.toBeNull();
    expect(result!.firstHalfAvgBpm).toBe(145);
    expect(result!.secondHalfAvgBpm).toBe(146);
    expect(result!.status).toBe("steady");
  });

  it("excludes initial warm-up HR lag so early ramp-up does not fabricate cardiac drift", () => {
    const durationSec = 50 * 60;
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    const points = buildPoints(durationSec, 3.0, 3.0);
    // First 10 min warm up from 115 bpm; remaining 40 min hold steady at 150 bpm.
    const samples: HeartRateSample[] = [];
    for (let t = 0; t < durationSec; t += 5) {
      samples.push({
        at: START_MS + t * 1000,
        bpm: t < 10 * 60 ? 115 : 150,
        source: "bluetooth",
      });
    }

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points,
      plan: { activityType: "easy" },
    });

    expect(result).not.toBeNull();
    expect(result!.firstHalfAvgBpm).toBe(150);
    expect(result!.secondHalfAvgBpm).toBe(150);
    expect(result!.pct).toBe(0);
    expect(result!.status).toBe("steady");
  });

  it("applies Minetti grade-adjusted speed so an uphill first half and downhill second half at steady effort stays steady", () => {
    const durationSec = 50 * 60;
    const warmupSec = 10 * 60;
    const steadyMidSec = warmupSec + (durationSec - warmupSec) / 2; // 30 min
    const activeIntervals: ActiveRunInterval[] = [
      { startMs: START_MS, endMs: START_MS + durationSec * 1000 },
    ];
    // Steady metabolic effort (~3.0 m/s flat-equivalent): 2.31 m/s uphill (+5% grade,
    // Minetti cost ~1.30x) vs 3.95 m/s downhill (-5% grade, Minetti cost ~0.76x)
    // at constant 150 bpm. Horizontal speed alone would imply massive negative drift (~-71%),
    // whereas Minetti GAP brings both halves near equal flat-equivalent effort.
    const pts: GPSPoint[] = [];
    let lat = 51.5;
    let alt = 100;
    for (let t = 0; t <= durationSec; t += 10) {
      if (t > 0) {
        const uphill = t <= steadyMidSec;
        const speed = t <= warmupSec ? 3.0 : uphill ? 2.31 : 3.95;
        const stepM = speed * 10;
        lat += stepM / 111_195;
        if (t > warmupSec) {
          alt += uphill ? stepM * 0.05 : -stepM * 0.05;
        }
      }
      pts.push({
        lat,
        lon: -0.1,
        rawLat: lat,
        rawLon: -0.1,
        timestamp: START_MS + t * 1000,
        altitude: alt,
        accuracy: 5,
        speed: 3.0,
      });
    }
    const samples = buildHrSamples(durationSec, 150, 150, 5, 0, "bluetooth");

    const result = computeAerobicDecoupling({
      samples,
      activeIntervals,
      points: pts,
      plan: { activityType: "long" },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("steady");
    expect(Math.abs(result!.pct)).toBeLessThan(3);
  });
});

/* Drift is read only for a run meant to hold one pace (the 28 November
   audit, Appendix I). A tempo held exactly, 10 minutes at 6:00 /km, 20 at
   4:30 and 15 at 6:15, read 16.4% and was saved on the run as
   "Noticeable second-half drift". */
describe("drift is read only for steady runs", () => {
  /** Phases of a run: seconds, speed and the heart rate across them. */
  function phased(
    phases: { sec: number; mps: number; fromBpm: number; toBpm: number }[]
  ) {
    const points: GPSPoint[] = [];
    const samples: HeartRateSample[] = [];
    let lat = 51.5;
    let t = 0;
    points.push({
      lat,
      lon: -0.1,
      rawLat: lat,
      rawLon: -0.1,
      timestamp: START_MS,
      altitude: 10,
      accuracy: 5,
      speed: phases[0].mps,
    });
    for (const phase of phases) {
      for (let s = 0; s < phase.sec; s += 5) {
        t += 5;
        lat += (phase.mps * 5) / 111_195;
        points.push({
          lat,
          lon: -0.1,
          rawLat: lat,
          rawLon: -0.1,
          timestamp: START_MS + t * 1000,
          altitude: 10,
          accuracy: 5,
          speed: phase.mps,
        });
        samples.push({
          at: START_MS + t * 1000,
          bpm: Math.round(
            phase.fromBpm + ((phase.toBpm - phase.fromBpm) * s) / phase.sec
          ),
          source: "apple-watch",
        });
      }
    }
    return {
      points,
      samples,
      activeIntervals: [{ startMs: START_MS, endMs: START_MS + t * 1000 }],
    };
  }

  const tempo = phased([
    { sec: 600, mps: 1000 / 360, fromBpm: 135, toBpm: 150 },
    { sec: 1200, mps: 1000 / 270, fromBpm: 168, toBpm: 168 },
    { sec: 900, mps: 1000 / 375, fromBpm: 150, toBpm: 150 },
  ]);
  const steady = phased([{ sec: 2700, mps: 3, fromBpm: 145, toBpm: 148 }]);

  it("reads no drift for a tempo run, which was saved as high drift", () => {
    // The same beats read as an easy run do drift: the tempo is what changes.
    expect(
      computeAerobicDecoupling({ ...tempo, plan: { activityType: "easy" } })
        ?.status
    ).toBe("high_drift");
    expect(
      computeAerobicDecoupling({ ...tempo, plan: { activityType: "tempo" } })
    ).toBeNull();
  });

  it.each(["intervals", "race", "fartlek", "threshold"])(
    "reads no drift for a %s run",
    (activityType) => {
      expect(
        computeAerobicDecoupling({ ...steady, plan: { activityType } })
      ).toBeNull();
    }
  );

  it("reads no drift for a run whose plan changes pace, whatever its type", () => {
    const strides = [
      { type: "warmup" },
      { type: "easy" },
      { type: "hard" },
      { type: "recovery" },
      { type: "cooldown" },
    ];
    expect(
      computeAerobicDecoupling({
        ...steady,
        plan: { activityType: "easy", segments: strides },
      })
    ).toBeNull();
    expect(
      computeAerobicDecoupling({
        ...steady,
        plan: {
          activityType: "freerun",
          intervals: { reps: 6, restDuration: 90 },
        },
      })
    ).toBeNull();
    expect(
      computeAerobicDecoupling({
        ...steady,
        plan: {
          activityType: "guided",
          guidedWorkout: { segments: [{ type: "easy" }, { type: "hard" }] },
        },
      })
    ).toBeNull();
    // A guided run with no steps to read is not known to be steady.
    expect(
      computeAerobicDecoupling({ ...steady, plan: { activityType: "guided" } })
    ).toBeNull();
  });

  it("reads drift for an easy, long, free or unplanned run that holds its pace", () => {
    for (const plan of [
      { activityType: "easy" },
      { activityType: "long", segments: [{ type: "easy" }] },
      { activityType: "freerun" },
      {
        activityType: "guided",
        guidedWorkout: {
          segments: [
            { type: "warmup" },
            { type: "easy" },
            { type: "cooldown" },
          ],
        },
      },
      null,
    ]) {
      expect(computeAerobicDecoupling({ ...steady, plan })?.status).toBe(
        "steady"
      );
    }
  });
});
