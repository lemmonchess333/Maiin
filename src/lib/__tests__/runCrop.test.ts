import { describe, expect, it } from "vitest";
import { cropRunTrace } from "../runCrop";
import type { GPSPoint } from "../gps";

/** Build a straight northward run trace at ~3.33 m/s (5:00 /km), 1 fix every 10 s. */
function makeTrace(count: number, extraTailCount = 0): GPSPoint[] {
  const startMs = 1_700_000_000_000;
  // ~33.3 m north per 10 s (~0.0003 deg latitude)
  const pts: GPSPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    pts.push({
      lat: 51.5 + i * 0.0003,
      lon: -0.1,
      altitude: 10 + i * 0.5,
      timestamp: startMs + i * 10_000,
      accuracy: 5,
      speed: null,
      rawLat: 51.5 + i * 0.0003,
      rawLon: -0.1,
    });
  }
  const last = pts[pts.length - 1];
  // Simulate forgetting to stop the watch while driving away at 10 m/s
  for (let j = 1; j <= extraTailCount; j += 1) {
    pts.push({
      lat: last.lat + j * 0.0009,
      lon: last.lon,
      altitude: last.altitude,
      timestamp: last.timestamp + j * 10_000,
      accuracy: 5,
      speed: null,
      rawLat: last.lat + j * 0.0009,
      rawLon: last.lon,
    });
  }
  return pts;
}

describe("cropRunTrace", () => {
  it("trims trailing GPS points and recomputes distance, duration, splits, and elevation", () => {
    const full = makeTrace(40, 10); // 40 running points (~1.3 km) + 10 driving tail points
    const fullResult = cropRunTrace(full, 0, full.length - 1, 70);
    const cropped = cropRunTrace(full, 0, 39, 70);

    expect(fullResult.ok).toBe(true);
    expect(cropped.ok).toBe(true);
    if (!fullResult.ok || !cropped.ok) return;

    expect(cropped.data.distance).toBeLessThan(fullResult.data.distance);
    expect(cropped.data.duration).toBe(390);
    expect(cropped.data.points).toHaveLength(40);
    expect(cropped.data.splits.length).toBeGreaterThanOrEqual(1);
    expect(cropped.data.elevationGain).toBeGreaterThan(0);
    expect(cropped.data.calories).toBeGreaterThan(0);
    expect(cropped.data.avgPace).toBeGreaterThan(250);
    expect(cropped.data.avgPace).toBeLessThan(350);
  });

  it("clears a leading breakBefore flag when cropping starts on a post-pause point", () => {
    const trace = makeTrace(25);
    trace[5] = { ...trace[5], breakBefore: true };
    const result = cropRunTrace(trace, 5, 24, 70);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.points[0].breakBefore).toBe(false);
  });

  it("rejects crops shorter than 50 m or with fewer than 2 points", () => {
    const trace = makeTrace(10);
    const single = cropRunTrace(trace, 3, 3, 70);
    expect(single.ok).toBe(false);

    const tooShort = cropRunTrace(trace, 0, 1, 70); // ~33 m
    expect(tooShort.ok).toBe(false);
  });
});

/* A crop recomputes everything the run derived from its track, the laps
   and the work portion included (the 28 November audit, #3593: a crop
   left the old lap splits). Laps are placed on the trace by the run's
   moving clock and measured on the kept trace. */
describe("cropRunTrace — laps", () => {
  // 61 fixes 10 s and ~33.4 m apart: 10 minutes, about 2 km.
  const trace = makeTrace(61);
  const startMs = trace[0].timestamp;

  const manual = [
    {
      index: 1,
      label: "Lap 1",
      kind: "manual" as const,
      distanceMeters: 1000,
      durationSeconds: 300,
      paceSecondsPerKm: 300,
    },
    {
      index: 2,
      label: "Lap 2",
      kind: "manual" as const,
      distanceMeters: 1000,
      durationSeconds: 300,
      paceSecondsPerKm: 300,
    },
  ];

  it("drops a lap cropped off, cuts the lap the crop goes through, and renumbers", () => {
    // Start at 6:40 in: lap 1 is gone, lap 2 keeps 3:20 of its 5:00.
    const result = cropRunTrace(trace, 40, 60, 70, {
      lapSplits: manual,
      recordingStartedAtMs: startMs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lapSplits).toHaveLength(1);
    const [lap] = result.data.lapSplits;
    expect(lap).toMatchObject({ index: 1, label: "Lap 1", kind: "manual" });
    expect(lap.durationSeconds).toBe(200);
    // Measured on the kept trace, so the laps add up to the run.
    expect(lap.distanceMeters).toBe(result.data.distance);
    expect(lap.paceSecondsPerKm).toBe(
      Math.round(200 / (lap.distanceMeters / 1000))
    );
    expect(result.data.workPortion).toBeUndefined();
  });

  it("keeps both laps whole when only the edges outside them go", () => {
    const result = cropRunTrace(trace, 0, 60, 70, {
      lapSplits: manual,
      recordingStartedAtMs: startMs,
    });
    expect(
      result.ok && result.data.lapSplits.map((l) => l.durationSeconds)
    ).toEqual([300, 300]);
    if (!result.ok) return;
    const total = result.data.lapSplits.reduce(
      (s, l) => s + l.distanceMeters,
      0
    );
    expect(Math.abs(total - result.data.distance)).toBeLessThanOrEqual(1);
  });

  it("recomputes the work portion from the work laps left", () => {
    const planned = [
      {
        index: 1,
        label: "Warm up",
        kind: "warmup" as const,
        distanceMeters: 600,
        durationSeconds: 180,
        paceSecondsPerKm: 300,
      },
      {
        index: 2,
        label: "Tempo",
        kind: "work" as const,
        distanceMeters: 1000,
        durationSeconds: 300,
        paceSecondsPerKm: 300,
      },
      {
        index: 3,
        label: "Cool down",
        kind: "cooldown" as const,
        distanceMeters: 400,
        durationSeconds: 120,
        paceSecondsPerKm: 300,
      },
    ];
    // End at 6:00: the cool-down is gone, the tempo loses its last minute.
    const result = cropRunTrace(trace, 0, 36, 70, {
      lapSplits: planned,
      recordingStartedAtMs: startMs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.data.lapSplits.map((l) => [l.label, l.durationSeconds])
    ).toEqual([
      ["Warm up", 180],
      ["Tempo", 180],
    ]);
    expect(result.data.workPortion).toEqual({
      seconds: 180,
      meters: result.data.lapSplits[1].distanceMeters,
    });
  });

  it("writes no laps for a run that kept none", () => {
    const result = cropRunTrace(trace, 10, 50, 70);
    expect(result.ok && result.data.lapSplits).toEqual([]);
    expect(result.ok && "workPortion" in result.data).toBe(false);
  });
});
