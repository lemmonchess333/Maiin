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

const GPX_11 = "http://www.topografix.com/GPX/1/1";
const GPX_10 = "http://www.topografix.com/GPX/1/0";

describe("parseGpx", () => {
  it.each([GPX_11, GPX_10])(
    "reads prefixed track elements in %s, including their name, measurements and gaps",
    (namespace) => {
      const xml = `<g:gpx xmlns:g="${namespace}" version="${namespace === GPX_11 ? "1.1" : "1.0"}" creator="test">
        <g:trk><g:name>Canal Loop</g:name>
          <g:trkseg>
            <g:trkpt lat="51.5" lon="-0.1"><g:ele>12.5</g:ele><g:time>2026-01-01T10:00:00Z</g:time></g:trkpt>
            <g:trkpt lat="51.501" lon="-0.11"/>
          </g:trkseg>
          <g:trkseg><g:trkpt lat="51.502" lon="-0.12"/></g:trkseg>
        </g:trk>
      </g:gpx>`;
      const points = parseGpx(xml);
      expect(points.map(({ lat, lon }) => [lat, lon])).toEqual([
        [51.5, -0.1],
        [51.501, -0.11],
        [51.502, -0.12],
      ]);
      expect(points[0]).toMatchObject({
        altitude: 12.5,
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
      });
      expect(points.map((point) => point.breakBefore === true)).toEqual([
        false,
        false,
        true,
      ]);
      expect(parseGpxName(xml)).toBe("Canal Loop");
    }
  );

  it.each([GPX_11, GPX_10])(
    "reads a prefixed route and its own name in %s when no track exists",
    (namespace) => {
      const xml = `<route:gpx xmlns:route="${namespace}" version="${namespace === GPX_11 ? "1.1" : "1.0"}" creator="test">
        <route:rte><route:name>Coast path</route:name>
          <route:rtept lat="40" lon="-70"/>
          <route:rtept lat="40.1" lon="-70.1"/>
        </route:rte>
      </route:gpx>`;
      expect(parseGpx(xml).map(({ lat, lon }) => [lat, lon])).toEqual([
        [40, -70],
        [40.1, -70.1],
      ]);
      expect(parseGpxName(xml)).toBe("Coast path");
    }
  );

  it("ignores foreign extension elements with GPX-looking local names", () => {
    const xml = `<gpx xmlns="${GPX_11}" version="1.1" creator="test">
      <trk><name>Actual route</name>
        <extensions>
          <trkpt xmlns="urn:vendor:preview" lat="1" lon="2"/>
        </extensions>
        <trkseg>
          <trkpt lat="51.5" lon="-0.1"><extensions>
            <ele xmlns="urn:vendor:preview">900</ele>
            <time xmlns="urn:vendor:preview">2030-01-01T00:00:00Z</time>
          </extensions></trkpt>
          <trkpt lat="51.501" lon="-0.11"/>
        </trkseg>
      </trk>
    </gpx>`;
    const points = parseGpx(xml);
    expect(points.map(({ lat, lon }) => [lat, lon])).toEqual([
      [51.5, -0.1],
      [51.501, -0.11],
    ]);
    expect(points[0]).toMatchObject({ altitude: null, timestamp: 0 });
    expect(parseGpxName(xml)).toBe("Actual route");
  });

  it("uses metadata when a track has only a waypoint name, not its own name", () => {
    const xml = `<gpx xmlns="${GPX_11}" version="1.1" creator="test">
      <metadata><name>Whole route</name></metadata>
      <trk><trkseg><trkpt lat="51.5" lon="-0.1"><name>Start point</name></trkpt></trkseg></trk>
    </gpx>`;
    expect(parseGpxName(xml)).toBe("Whole route");
  });

  it("still reads legacy unqualified GPX exports", () => {
    const legacy = TRK_GPX.replace(` xmlns="${GPX_11}"`, "");
    expect(parseGpx(legacy)).toEqual(parseGpx(TRK_GPX));
    expect(parseGpxName(legacy)).toBe("Loop");
  });

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

it("exports GPX 1.1 that an independent namespace-aware reader can consume", () => {
  const points = parseGpx(TRK_GPX).map((point, i) => ({
    ...point,
    ...(i === 2 ? { breakBefore: true } : {}),
  }));
  const doc = new DOMParser().parseFromString(
    toGPX(points, "Canal & bridge"),
    "application/xml"
  );
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  expect(doc.documentElement.namespaceURI).toBe(GPX_11);
  expect(doc.documentElement.getAttribute("version")).toBe("1.1");
  expect(doc.getElementsByTagNameNS(GPX_11, "trkpt")).toHaveLength(3);
  expect(doc.getElementsByTagNameNS(GPX_11, "trkseg")).toHaveLength(2);
  expect(doc.getElementsByTagNameNS(GPX_11, "name")[0].textContent).toBe(
    "Canal & bridge"
  );
  expect(doc.getElementsByTagNameNS(GPX_11, "ele")[0].textContent).toBe("10.0");
  expect(doc.getElementsByTagNameNS(GPX_11, "time")[0].textContent).toBe(
    "2026-01-01T10:00:00.000Z"
  );
});
