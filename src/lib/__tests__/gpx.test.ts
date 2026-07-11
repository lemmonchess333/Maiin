// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect } from "vitest";
import { parseGpx, parseGpxName } from "../gpx";
import { toGPX, type GPSPoint } from "../gps";

const TRK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Loop</name><trkseg>
    <trkpt lat="51.5000" lon="-0.1000"><ele>10.0</ele><time>2026-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="51.5010" lon="-0.1000"><ele>12.5</ele><time>2026-01-01T10:01:00Z</time></trkpt>
    <trkpt lat="51.5020" lon="-0.1000"></trkpt>
  </trkseg></trk>
</gpx>`;

const RTE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="40.0" lon="-70.0"></rtept>
    <rtept lat="40.1" lon="-70.1"></rtept>
  </rte>
</gpx>`;

describe("parseGpx", () => {
  it("parses track points with lat/lon/ele (namespaced GPX)", () => {
    const pts = parseGpx(TRK_GPX);
    expect(pts).toHaveLength(3);
    expect(pts[0].lat).toBeCloseTo(51.5, 4);
    expect(pts[0].lon).toBeCloseTo(-0.1, 4);
    expect(pts[0].altitude).toBeCloseTo(10, 1);
    expect(pts[1].altitude).toBeCloseTo(12.5, 1);
  });

  it("reads <time> into timestamp, defaults to 0 when absent", () => {
    const pts = parseGpx(TRK_GPX);
    expect(pts[0].timestamp).toBe(Date.parse("2026-01-01T10:00:00Z"));
    expect(pts[2].timestamp).toBe(0);
    expect(pts[2].altitude).toBeNull();
  });

  it("marks imported points as a plan (accuracy 0, speed null, raw = lat/lon)", () => {
    const [p] = parseGpx(TRK_GPX);
    expect(p.accuracy).toBe(0);
    expect(p.speed).toBeNull();
    expect(p.rawLat).toBe(p.lat);
    expect(p.rawLon).toBe(p.lon);
  });

  it("falls back to <rtept> route points when there are no track points", () => {
    const pts = parseGpx(RTE_GPX);
    expect(pts).toHaveLength(2);
    expect(pts[1].lat).toBeCloseTo(40.1, 4);
    expect(pts[1].lon).toBeCloseTo(-70.1, 4);
  });

  it("returns [] for empty, malformed, or out-of-range input", () => {
    expect(parseGpx("")).toEqual([]);
    expect(parseGpx("not xml at all <<<")).toEqual([]);
    expect(
      parseGpx(
        `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="200" lon="0"/></trkseg></trk></gpx>`
      )
    ).toEqual([]);
  });

  it("reads the route name (trk/rte/metadata), null when absent", () => {
    expect(parseGpxName(TRK_GPX)).toBe("Loop");
    expect(parseGpxName(RTE_GPX)).toBeNull();
    expect(
      parseGpxName(
        `<gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Meta Route</name></metadata><trk><trkseg><trkpt lat="51.5" lon="-0.1"/></trkseg></trk></gpx>`
      )
    ).toBe("Meta Route");
    expect(parseGpxName("")).toBeNull();
    expect(parseGpxName("garbage")).toBeNull();
  });

  it("round-trips with toGPX (lat/lon preserved)", () => {
    const original: GPSPoint[] = [
      {
        lat: 51.5,
        lon: -0.1,
        altitude: 10,
        accuracy: 5,
        speed: 2,
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
        rawLat: 51.5,
        rawLon: -0.1,
      },
      {
        lat: 51.501,
        lon: -0.0999,
        altitude: 11,
        accuracy: 5,
        speed: 2,
        timestamp: Date.parse("2026-01-01T10:00:30Z"),
        rawLat: 51.501,
        rawLon: -0.0999,
      },
    ];
    const round = parseGpx(toGPX(original, "Test"));
    expect(round).toHaveLength(2);
    expect(round[0].lat).toBeCloseTo(original[0].lat, 5);
    expect(round[0].lon).toBeCloseTo(original[0].lon, 5);
    expect(round[1].lat).toBeCloseTo(original[1].lat, 5);
  });
});
