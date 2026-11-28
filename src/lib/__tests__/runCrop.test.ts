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
