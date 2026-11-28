import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  queueDurableWrite: vi.fn(),
  flushQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/offlineQueue", () => ({
  queueDurableWrite: (...args: unknown[]) => mocks.queueDurableWrite(...args),
  flushQueue: (...args: unknown[]) => mocks.flushQueue(...args),
}));

import {
  GpxImportError,
  importRunFile,
  parseGpxRun,
  parseRunFile,
  parseTcxRun,
} from "@/lib/gpxImport";

/**
 * Generates a realistic GPX 1.1 track moving north at ~111 m per 0.001 deg lat.
 */
function buildSampleGpx({
  name = "Morning 5K",
  pointCount = 60,
  stepSec = 10,
  stepLat = 0.0003,
  includeHr = true,
  hrStart = 148,
  hrEnd = 158,
  splitSegmentAt = -1,
  pauseGapSec = 0,
  startIso = "2026-10-12T07:00:00Z",
}: {
  name?: string;
  pointCount?: number;
  stepSec?: number;
  stepLat?: number;
  includeHr?: boolean;
  hrStart?: number;
  hrEnd?: number;
  splitSegmentAt?: number;
  pauseGapSec?: number;
  startIso?: string;
} = {}): string {
  const startMs = Date.parse(startIso);
  let elapsedOffsetMs = 0;
  const seg1: string[] = [];
  const seg2: string[] = [];

  for (let i = 0; i < pointCount; i++) {
    if (i === splitSegmentAt) {
      elapsedOffsetMs += pauseGapSec * 1000;
    }
    const ts = new Date(
      startMs + i * stepSec * 1000 + elapsedOffsetMs
    ).toISOString();
    const lat = 51.5 + i * stepLat;
    const lon = -0.12;
    const ele = 20 + (i % 12 < 6 ? i * 0.5 : (i - 1) * 0.5);
    const hr = Math.round(
      hrStart + ((hrEnd - hrStart) * i) / Math.max(1, pointCount - 1)
    );
    const pt = `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${ts}</time>${
          includeHr
            ? `
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>${hr}</gpxtpx:hr>
          </gpxtpx:TrackPointExtension>
        </extensions>`
            : ""
        }
      </trkpt>`;
    if (splitSegmentAt > 0 && i >= splitSegmentAt) seg2.push(pt);
    else seg1.push(pt);
  }

  const segXml =
    seg2.length > 0
      ? `    <trkseg>\n${seg1.join("\n")}\n    </trkseg>\n    <trkseg>\n${seg2.join("\n")}\n    </trkseg>`
      : `    <trkseg>\n${seg1.join("\n")}\n    </trkseg>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StravaGPX" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>${name}</name>
${segXml}
  </trk>
</gpx>`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseGpxRun", () => {
  it("parses coordinates, distance, duration, splits, elevation, and HR zones", () => {
    const xml = buildSampleGpx({
      name: "River &amp; Park Run",
      pointCount: 120,
      stepSec: 5,
      stepLat: 0.00018, // ~20 m per 5 s => ~2.38 km in ~10 min
      includeHr: true,
    });

    const parsed = parseGpxRun(xml, { weightKg: 70, maxHr: 190 });
    expect(parsed.name).toBe("River & Park Run");
    expect(parsed.points).toHaveLength(120);
    expect(parsed.distance).toBeGreaterThan(2200);
    expect(parsed.distance).toBeLessThan(2600);
    expect(parsed.duration).toBe(595);
    expect(parsed.avgPaceSeconds).toBeCloseTo(
      (parsed.duration / parsed.distance) * 1000,
      2
    );
    expect(parsed.splits.length).toBeGreaterThanOrEqual(2);
    expect(parsed.elevationGain).toBeGreaterThan(0);
    expect(parsed.calories).toBeGreaterThan(100);
    expect(parsed.heartRate).not.toBeNull();
    expect(parsed.heartRate!.averageBpm).toBeGreaterThanOrEqual(148);
    expect(parsed.heartRate!.averageBpm).toBeLessThanOrEqual(158);
    expect(parsed.heartRate!.zoneSeconds).toHaveLength(5);
    expect(parsed.importId).toMatch(/^gpx-[0-9a-f]{8}$/);
  });

  it("excludes pause gaps across multiple <trkseg> blocks and marks breakBefore", () => {
    const xml = buildSampleGpx({
      pointCount: 40,
      stepSec: 10,
      stepLat: 0.0003,
      splitSegmentAt: 20,
      pauseGapSec: 300, // 5-minute stopped break
      includeHr: false,
    });

    const parsed = parseGpxRun(xml);
    expect(parsed.points[20].breakBefore).toBe(true);
    // 39 intervals * 10 s = 390 s active; the 300 s pause is excluded, plus the 10 s inter-seg step
    expect(parsed.duration).toBe(380);
    expect(parsed.heartRate).toBeNull();
  });

  it("computes aerobic decoupling for steady runs >= 30 min with HR", () => {
    const xml = buildSampleGpx({
      pointCount: 240,
      stepSec: 10, // 40 min
      stepLat: 0.00025, // ~27.8 m per 10 s => ~6.6 km
      includeHr: true,
      hrStart: 145,
      hrEnd: 160,
    });

    const parsed = parseGpxRun(xml, { maxHr: 190 });
    expect(parsed.heartRate?.decoupling).toBeDefined();
    expect(parsed.heartRate?.decoupling?.pct).toBeGreaterThan(3);
  });

  it("produces deterministic importId for idempotent re-imports", () => {
    const xml = buildSampleGpx();
    const a = parseGpxRun(xml);
    const b = parseGpxRun(xml);
    expect(a.importId).toBe(b.importId);
  });

  it("supports <ns3:hr> Garmin extension namespace", () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk><name>Garmin Track</name><trkseg>
    <trkpt lat="51.5000" lon="-0.1200"><time>2026-10-12T07:00:00Z</time><extensions><ns3:TrackPointExtension><ns3:hr>150</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
    <trkpt lat="51.5020" lon="-0.1200"><time>2026-10-12T07:01:00Z</time><extensions><ns3:TrackPointExtension><ns3:hr>154</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;
    const parsed = parseGpxRun(xml, { maxHr: 190 });
    expect(parsed.heartRate?.averageBpm).toBeGreaterThanOrEqual(150);
  });

  it("rejects non-GPX XML, too-few points, missing timestamps, and < 100 m tracks", () => {
    expect(() => parseGpxRun("<html>not gpx</html>")).toThrowError(
      GpxImportError
    );
    expect(() =>
      parseGpxRun(
        `<gpx version="1.1"><trk><trkseg><trkpt lat="51.5" lon="-0.1"><time>2026-10-12T07:00:00Z</time></trkpt></trkseg></trk></gpx>`
      )
    ).toThrow(/enough GPS points/i);
    expect(() =>
      parseGpxRun(
        `<gpx version="1.1"><trk><trkseg><trkpt lat="51.5" lon="-0.1"/><trkpt lat="51.51" lon="-0.1"/></trkseg></trk></gpx>`
      )
    ).toThrow(/timestamps/i);
    expect(() =>
      parseGpxRun(
        `<gpx version="1.1"><trk><trkseg>
          <trkpt lat="51.50000" lon="-0.12000"><time>2026-10-12T07:00:00Z</time></trkpt>
          <trkpt lat="51.50010" lon="-0.12000"><time>2026-10-12T07:00:10Z</time></trkpt>
        </trkseg></trk></gpx>`
      )
    ).toThrow(/100 m/i);
  });
});

describe("importRunFile (GPX)", () => {
  it("writes a canonical run document to users/{uid}/runs/{importId} and flushes", async () => {
    const xml = buildSampleGpx({ name: "Strava Tempo" });
    const summary = await importRunFile("u-123", xml, {
      weightKg: 72,
      maxHr: 192,
    });

    expect(summary.runId).toMatch(/^gpx-[0-9a-f]{8}$/);
    expect(summary.name).toBe("Strava Tempo");
    expect(summary.hasHeartRate).toBe(true);

    expect(mocks.queueDurableWrite).toHaveBeenCalledOnce();
    const [uid, colPath, docId, payload] =
      mocks.queueDurableWrite.mock.calls[0];
    expect(uid).toBe("u-123");
    expect(colPath).toBe("users/u-123/runs");
    expect(docId).toBe(summary.runId);
    expect(payload.type).toBe("run");
    expect(payload.activityType).toBe("freerun");
    expect(payload.isInvalid).toBe(false);
    expect(payload.notes).toBe("Imported from GPX");
    expect(payload.points.length).toBeGreaterThan(0);
    expect(mocks.flushQueue).toHaveBeenCalledOnce();
  });
});

function buildSampleTcx({
  notes = "Garmin Tempo",
  pointCount = 60,
  stepSec = 10,
  stepLat = 0.0003,
  includePosition = true,
  includeHr = true,
  splitTrackAt = -1,
  pauseGapSec = 0,
  startIso = "2026-10-14T07:30:00Z",
}: {
  notes?: string;
  pointCount?: number;
  stepSec?: number;
  stepLat?: number;
  includePosition?: boolean;
  includeHr?: boolean;
  splitTrackAt?: number;
  pauseGapSec?: number;
  startIso?: string;
} = {}): string {
  const startMs = Date.parse(startIso);
  let elapsedOffsetMs = 0;
  const track1: string[] = [];
  const track2: string[] = [];

  for (let i = 0; i < pointCount; i++) {
    if (i === splitTrackAt) {
      elapsedOffsetMs += pauseGapSec * 1000;
    }
    const ts = new Date(
      startMs + i * stepSec * 1000 + elapsedOffsetMs
    ).toISOString();
    const lat = 51.5 + i * stepLat;
    const lon = -0.12;
    const alt = 30 + (i % 10 < 5 ? i * 0.4 : (i - 1) * 0.4);
    const distM = i * 33.3;
    const hr = Math.round(146 + (14 * i) / Math.max(1, pointCount - 1));
    const pt = `          <Trackpoint>
            <Time>${ts}</Time>${
              includePosition
                ? `
            <Position>
              <LatitudeDegrees>${lat.toFixed(6)}</LatitudeDegrees>
              <LongitudeDegrees>${lon.toFixed(6)}</LongitudeDegrees>
            </Position>
            <AltitudeMeters>${alt.toFixed(1)}</AltitudeMeters>`
                : ""
            }
            <DistanceMeters>${distM.toFixed(1)}</DistanceMeters>${
              includeHr
                ? `
            <HeartRateBpm><Value>${hr}</Value></HeartRateBpm>`
                : ""
            }
          </Trackpoint>`;
    if (splitTrackAt > 0 && i >= splitTrackAt) track2.push(pt);
    else track1.push(pt);
  }

  const totalTimeSec = (pointCount - 1) * stepSec;
  const totalDistM = (pointCount - 1) * 33.3;
  const tracksXml =
    track2.length > 0
      ? `        <Track>\n${track1.join("\n")}\n        </Track>\n        <Track>\n${track2.join("\n")}\n        </Track>`
      : `        <Track>\n${track1.join("\n")}\n        </Track>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${startIso}</Id>
      <Notes>${notes}</Notes>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${totalTimeSec}</TotalTimeSeconds>
        <DistanceMeters>${totalDistM.toFixed(1)}</DistanceMeters>
${tracksXml}
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

describe("parseTcxRun & importRunFile", () => {
  it("parses outdoor GPS TCX tracks with elevation, splits, HR zones, and multi-track pauses", () => {
    const xml = buildSampleTcx({
      notes: "Coros &amp; Hills",
      pointCount: 60,
      stepSec: 10,
      stepLat: 0.0003,
      splitTrackAt: 30,
      pauseGapSec: 240,
    });

    const parsed = parseTcxRun(xml, { weightKg: 70, maxHr: 190 });
    expect(parsed.source).toBe("tcx");
    expect(parsed.place).toBeUndefined();
    expect(parsed.name).toBe("Coros & Hills");
    expect(parsed.importId).toMatch(/^tcx-[0-9a-f]{8}$/);
    expect(parsed.points).toHaveLength(60);
    expect(parsed.points[30].breakBefore).toBe(true);
    // 59 steps * 10 s minus the 10 s inter-track gap (240 s pause excluded)
    expect(parsed.duration).toBe(580);
    expect(parsed.distance).toBeGreaterThan(1800);
    expect(parsed.splits.length).toBeGreaterThanOrEqual(1);
    expect(parsed.heartRate).not.toBeNull();
    expect(parsed.heartRate!.averageBpm).toBeGreaterThanOrEqual(146);
    expect(parsed.heartRate!.averageBpm).toBeLessThanOrEqual(160);
  });

  it("parses indoor treadmill TCX files without GPS positions and preserves HR", async () => {
    const xml = buildSampleTcx({
      notes: "Treadmill Easy",
      pointCount: 31,
      stepSec: 20, // 600 s = 10 min
      includePosition: false,
      includeHr: true,
    });

    const parsed = parseRunFile(xml, { weightKg: 72, maxHr: 192 });
    expect(parsed.source).toBe("tcx");
    expect(parsed.place).toBe("treadmill");
    expect(parsed.points).toEqual([]);
    expect(parsed.distance).toBe(999);
    expect(parsed.duration).toBe(600);
    expect(parsed.heartRate).not.toBeNull();

    const summary = await importRunFile("u-123", xml, {
      weightKg: 72,
      maxHr: 192,
    });
    expect(summary.runId).toBe(parsed.importId);
    expect(summary.hasHeartRate).toBe(true);
    expect(mocks.queueDurableWrite).toHaveBeenCalledWith(
      "u-123",
      "users/u-123/runs",
      parsed.importId,
      expect.objectContaining({
        place: "treadmill",
        notes: "Imported from TCX",
        distance: 999,
      })
    );
    expect(mocks.flushQueue).toHaveBeenCalledOnce();
  });

  it("auto-detects GPX vs TCX in parseRunFile and rejects unrecognized XML", () => {
    const gpx = buildSampleGpx({ name: "Auto GPX" });
    const tcx = buildSampleTcx({ notes: "Auto TCX" });

    expect(parseRunFile(gpx).importId).toMatch(/^gpx-[0-9a-f]{8}$/);
    expect(parseRunFile(tcx).importId).toMatch(/^tcx-[0-9a-f]{8}$/);
    expect(() => parseRunFile("<unknown/>")).toThrowError(GpxImportError);
    expect(() =>
      parseTcxRun("<TrainingCenterDatabase></TrainingCenterDatabase>")
    ).toThrow(/GPS points or lap data/i);
  });
});

/* Imports keep, with checks (owner, 28 November). A ride imported as a
   run fed Bests, the community goal, km challenges, the league and
   segment boards: a 20 km GPX ride at 8 m/s read as a 5K in 10:30 (the
   28 November audit, Appendix G). A file that names another sport is
   refused, and so is a track that moves faster than anyone runs for a
   minute or more. */
describe("only runs come in", () => {
  /** The sample track with a `<type>` under its name. */
  const gpxOfType = (type: string, options = {}) =>
    buildSampleGpx(options).replace(
      "<name>Morning 5K</name>",
      `<name>Morning 5K</name>\n    <type>${type}</type>`
    );
  /** A 20 km ride at 8 m/s: 250 fixes 10 s and 80 m apart. */
  const RIDE = { pointCount: 250, stepSec: 10, stepLat: 80 / 111_195 };

  const refusal = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      return err instanceof GpxImportError
        ? { code: err.code, message: err.message }
        : err;
    }
    return null;
  };

  it("refuses a GPX ride, and says it is one", () => {
    expect(refusal(() => parseGpxRun(gpxOfType("cycling", RIDE)))).toEqual({
      code: "GPX_NOT_A_RUN",
      message: "This file is a bike ride. Only runs can be imported.",
    });
    // Strava writes the sport as its own number: 1 is a ride.
    expect(refusal(() => parseRunFile(gpxOfType("1", RIDE)))).toEqual(
      expect.objectContaining({ code: "GPX_NOT_A_RUN" })
    );
  });

  it("refuses walks and hikes, which Tropos has no type for", () => {
    expect(refusal(() => parseGpxRun(gpxOfType("walking")))).toEqual({
      code: "GPX_NOT_A_RUN",
      message: "This file is a walk. Only runs can be imported.",
    });
    expect(refusal(() => parseGpxRun(gpxOfType("10")))).toEqual(
      expect.objectContaining({ code: "GPX_NOT_A_RUN" })
    );
    expect(refusal(() => parseGpxRun(gpxOfType("hiking")))).toEqual({
      code: "GPX_NOT_A_RUN",
      message: "This file is a hike. Only runs can be imported.",
    });
    expect(refusal(() => parseGpxRun(gpxOfType("swimming")))).toEqual({
      code: "GPX_NOT_A_RUN",
      message: "This file is from another sport. Only runs can be imported.",
    });
  });

  it.each(["running", "trail_running", "Run", "9", "53", "other", ""])(
    "imports a GPX run whose type is %j",
    (type) => {
      const run = parseGpxRun(gpxOfType(type));
      expect(run.distance).toBeGreaterThan(1900);
    }
  );

  it("refuses a TCX ride or other sport, and reads the run in a multisport file", () => {
    const tcx = buildSampleTcx();
    expect(
      refusal(() =>
        parseTcxRun(tcx.replace('Sport="Running"', 'Sport="Biking"'))
      )
    ).toEqual({
      code: "GPX_NOT_A_RUN",
      message: "This file is a bike ride. Only runs can be imported.",
    });
    expect(
      refusal(() =>
        parseTcxRun(tcx.replace('Sport="Running"', 'Sport="Other"'))
      )
    ).toEqual(expect.objectContaining({ code: "GPX_NOT_A_RUN" }));
    // A ride, then the run: the run is what comes in.
    const ride = `<Activity Sport="Biking"><Id>2026-10-14T06:00:00Z</Id></Activity>\n    `;
    const multisport = tcx.replace(
      '<Activity Sport="Running">',
      `${ride}<Activity Sport="Running">`
    );
    expect(parseTcxRun(multisport).distance).toBeGreaterThan(1900);
  });

  it("refuses a track faster than anyone runs for a minute, past 12 m/s", () => {
    // No sport named; 20 m/s for ten minutes.
    const drive = buildSampleGpx({ stepSec: 10, stepLat: 200 / 111_195 });
    expect(refusal(() => parseGpxRun(drive))).toEqual({
      code: "GPX_TOO_FAST",
      message:
        "This file moves faster than anyone can run. Only runs can be imported.",
    });
  });

  it("keeps a run with a GPS glitch of a few seconds past 12 m/s", () => {
    // One fix 400 m off for a single 10 s step, then back on the line.
    const glitch = buildSampleGpx().replace(
      /lat="51\.509000"/,
      'lat="51.512600"'
    );
    expect(glitch).toContain('lat="51.512600"');
    expect(parseGpxRun(glitch).distance).toBeGreaterThan(1900);
  });

  it("refuses an indoor TCX whose laps cover the distance faster than anyone runs", () => {
    const fast = buildSampleTcx({ includePosition: false, stepSec: 1 });
    expect(refusal(() => parseTcxRun(fast))).toEqual(
      expect.objectContaining({ code: "GPX_TOO_FAST" })
    );
    // The same laps at a running speed come in.
    expect(
      parseTcxRun(buildSampleTcx({ includePosition: false })).distance
    ).toBeGreaterThan(1900);
  });
});
