import { describe, it, expect } from "vitest";
import { buildRunTcx, tcxFile } from "../tcxExport";
import { parseTcxRun } from "../gpxImport";
import type { GPSPoint } from "../gps";

function makeTrack(count: number, startMs: number): GPSPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 51.5 + i * 0.0005,
    lon: -0.1,
    rawLat: 51.5 + i * 0.0005,
    rawLon: -0.1,
    altitude: 25 + i * 0.5,
    accuracy: 5,
    speed: 3.2,
    timestamp: startMs + i * 10_000,
  }));
}

describe("buildRunTcx", () => {
  it("exports an outdoor GPS run with positions, altitude, HR, and round-trips through parseTcxRun", () => {
    const startMs = Date.parse("2026-10-12T07:30:00Z");
    const points = makeTrack(20, startMs);
    const tcx = buildRunTcx({
      name: "Tempo & Hills",
      startedAtMs: startMs,
      distanceMeters: 1056,
      durationSeconds: 190,
      calories: 112,
      avgHeartRate: 158,
      maxHeartRate: 174,
      points,
      heartRateSamples: points.map((p, idx) => ({
        at: p.timestamp,
        bpm: 150 + idx,
      })),
    });

    expect(tcx).toContain(
      'xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"'
    );
    expect(tcx).toContain("<Notes>Tempo &amp; Hills</Notes>");
    expect(tcx).toContain("<Calories>112</Calories>");
    expect(tcx).toContain(
      "<AverageHeartRateBpm><Value>158</Value></AverageHeartRateBpm>"
    );
    expect(tcx).toContain(
      "<MaximumHeartRateBpm><Value>174</Value></MaximumHeartRateBpm>"
    );
    expect(tcx).toContain("<Position>");

    // Round-trip into Tropos TCX importer.
    const parsed = parseTcxRun(tcx);
    expect(parsed.name).toBe("Tempo & Hills");
    expect(parsed.place).toBeUndefined();
    expect(parsed.points.length).toBeGreaterThanOrEqual(15);
    expect(parsed.heartRate?.averageBpm).toBeGreaterThan(140);
    expect(parsed.distance).toBeGreaterThan(900);
  });

  it("exports an indoor treadmill run without GPS positions and round-trips cleanly", () => {
    const startMs = Date.parse("2026-10-14T18:00:00Z");
    const tcx = buildRunTcx({
      name: "Treadmill Easy 5K",
      startedAtMs: startMs,
      distanceMeters: 5000,
      durationSeconds: 1650,
      calories: 340,
      avgHeartRate: 146,
      maxHeartRate: 160,
      points: [],
    });

    expect(tcx).not.toContain("<Position>");
    expect(tcx).toContain("<DistanceMeters>5000.0</DistanceMeters>");
    expect(tcx).toContain("<TotalTimeSeconds>1650.0</TotalTimeSeconds>");

    const parsed = parseTcxRun(tcx);
    expect(parsed.place).toBe("treadmill");
    expect(parsed.distance).toBe(5000);
    expect(parsed.duration).toBe(1650);
    expect(parsed.points).toEqual([]);
  });

  it("wraps TCX output in a File with a slugged .tcx filename and Garmin MIME type", () => {
    const file = tcxFile("<TrainingCenterDatabase/>", "Morning Run · 5.0 km");
    expect(file.name).toBe("morning-run-5-0-km.tcx");
    expect(file.type).toBe("application/vnd.garmin.tcx+xml");
  });
});
