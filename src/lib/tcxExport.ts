/**
 * Garmin Training Center XML (TCX v2) run exporter.
 *
 * Works for both outdoor GPS runs (emitting `<Position>`, `<AltitudeMeters>`,
 * cumulative `<DistanceMeters>`, and `<HeartRateBpm>` per trackpoint across
 * pause/privacy segments) and indoor treadmill or manual runs (emitting lap
 * totals plus a clean distance-bearing track without GPS coordinates so
 * Strava, Garmin Connect, and Tropos import preserve distance, duration,
 * calories, and heart rate).
 */
import { haversine, type GPSPoint } from "./gps";
import { splitRouteSegments } from "./routeSegments";
import { routeSlug } from "./shareRoute";
import { MAX_HEART_RATE_SAMPLE_AGE_MS } from "./hrZones";

export interface TcxHeartRateSample {
  at: number;
  bpm: number;
}

export interface TcxRunInput {
  /** Human-readable run title written to `<Notes>`. */
  name: string;
  /** Run start timestamp in epoch milliseconds. */
  startedAtMs: number;
  /** Total run distance in metres. */
  distanceMeters: number;
  /** Active duration in seconds. */
  durationSeconds: number;
  /** Optional calories burned (kcal). */
  calories?: number | null;
  /** Optional average heart rate (bpm). */
  avgHeartRate?: number | null;
  /** Optional maximum heart rate (bpm). */
  maxHeartRate?: number | null;
  /** Privacy-trimmed GPS points (empty or omitted for treadmill/manual runs). */
  points?: readonly GPSPoint[];
  /** Optional per-timestamp heart rate samples. */
  heartRateSamples?: readonly TcxHeartRateSample[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function finitePositive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function matchHeartRateByPoint(
  points: readonly GPSPoint[],
  samples?: readonly TcxHeartRateSample[]
): Map<GPSPoint, number> | null {
  if (!samples || samples.length === 0 || points.length === 0) return null;
  const ordered = samples
    .filter(
      (s) =>
        Number.isFinite(s.at) &&
        Number.isFinite(s.bpm) &&
        s.bpm >= 30 &&
        s.bpm <= 240
    )
    .sort((a, b) => a.at - b.at);
  if (ordered.length === 0) return null;

  const byPoint = new Map<GPSPoint, number>();
  let cursor = 0;
  for (const point of points) {
    while (
      cursor + 1 < ordered.length &&
      ordered[cursor + 1].at <= point.timestamp
    ) {
      cursor += 1;
    }
    const candidate = ordered[cursor];
    if (
      candidate.at <= point.timestamp &&
      point.timestamp - candidate.at <= MAX_HEART_RATE_SAMPLE_AGE_MS
    ) {
      byPoint.set(point, Math.round(candidate.bpm));
    }
  }
  return byPoint.size > 0 ? byPoint : null;
}

function buildOutdoorTracks(
  points: readonly GPSPoint[],
  heartRateSamples?: readonly TcxHeartRateSample[]
): string {
  const hrByPoint = matchHeartRateByPoint(points, heartRateSamples);
  const segments = splitRouteSegments([...points]);
  let cumulativeMeters = 0;

  return segments
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const trackpoints = segment
        .map((point, index) => {
          if (index > 0) {
            const prev = segment[index - 1];
            cumulativeMeters += haversine(
              prev.lat,
              prev.lon,
              point.lat,
              point.lon
            );
          }
          const time = new Date(point.timestamp).toISOString();
          const lines = [
            `          <Trackpoint>`,
            `            <Time>${time}</Time>`,
            `            <Position>`,
            `              <LatitudeDegrees>${point.lat}</LatitudeDegrees>`,
            `              <LongitudeDegrees>${point.lon}</LongitudeDegrees>`,
            `            </Position>`,
          ];
          if (point.altitude != null && Number.isFinite(point.altitude)) {
            lines.push(
              `            <AltitudeMeters>${point.altitude.toFixed(1)}</AltitudeMeters>`
            );
          }
          lines.push(
            `            <DistanceMeters>${cumulativeMeters.toFixed(1)}</DistanceMeters>`
          );
          const hr = hrByPoint?.get(point);
          if (hr != null) {
            lines.push(
              `            <HeartRateBpm><Value>${hr}</Value></HeartRateBpm>`
            );
          }
          lines.push(`          </Trackpoint>`);
          return lines.join("\n");
        })
        .join("\n");
      return `        <Track>\n${trackpoints}\n        </Track>`;
    })
    .join("\n");
}

function buildIndoorTrack(
  startedAtMs: number,
  durationSeconds: number,
  distanceMeters: number,
  avgHeartRate: number | null,
  heartRateSamples?: readonly TcxHeartRateSample[]
): string {
  const endMs = startedAtMs + Math.max(1, durationSeconds) * 1000;
  const spanMs = Math.max(1000, endMs - startedAtMs);
  const validSamples = (heartRateSamples ?? [])
    .filter(
      (s) =>
        Number.isFinite(s.at) &&
        Number.isFinite(s.bpm) &&
        s.bpm >= 30 &&
        s.bpm <= 240
    )
    .sort((a, b) => a.at - b.at);

  const rawPoints: { at: number; dist: number; bpm: number | null }[] =
    validSamples.length >= 2
      ? validSamples.map((s) => {
          const ratio = Math.min(1, Math.max(0, (s.at - startedAtMs) / spanMs));
          return {
            at: s.at,
            dist: distanceMeters * ratio,
            bpm: Math.round(s.bpm),
          };
        })
      : [
          {
            at: startedAtMs,
            dist: 0,
            bpm: avgHeartRate ? Math.round(avgHeartRate) : null,
          },
          {
            at: endMs,
            dist: distanceMeters,
            bpm: avgHeartRate ? Math.round(avgHeartRate) : null,
          },
        ];

  const trackpoints = rawPoints
    .map((tp) => {
      const lines = [
        `          <Trackpoint>`,
        `            <Time>${new Date(tp.at).toISOString()}</Time>`,
        `            <DistanceMeters>${tp.dist.toFixed(1)}</DistanceMeters>`,
      ];
      if (tp.bpm != null) {
        lines.push(
          `            <HeartRateBpm><Value>${tp.bpm}</Value></HeartRateBpm>`
        );
      }
      lines.push(`          </Trackpoint>`);
      return lines.join("\n");
    })
    .join("\n");

  return `        <Track>\n${trackpoints}\n        </Track>`;
}

/**
 * Serialises an outdoor or indoor run into a Garmin TrainingCenterDatabase v2
 * XML document (`.tcx`).
 */
export function buildRunTcx(input: TcxRunInput): string {
  const points = (input.points ?? []).filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Number.isFinite(p.timestamp)
  );
  const startMs = Number.isFinite(input.startedAtMs)
    ? input.startedAtMs
    : (points[0]?.timestamp ?? Date.now());
  const startIso = new Date(startMs).toISOString();
  const durationSeconds = Math.max(
    0,
    Number.isFinite(input.durationSeconds) ? input.durationSeconds : 0
  );
  const distanceMeters = Math.max(
    0,
    Number.isFinite(input.distanceMeters) ? input.distanceMeters : 0
  );
  const calories = finitePositive(input.calories);
  const avgHr = finitePositive(input.avgHeartRate);
  const maxHr = finitePositive(input.maxHeartRate);
  const title = input.name.trim() || "Run";

  const lapMeta = [
    `        <TotalTimeSeconds>${durationSeconds.toFixed(1)}</TotalTimeSeconds>`,
    `        <DistanceMeters>${distanceMeters.toFixed(1)}</DistanceMeters>`,
  ];
  if (calories != null) {
    lapMeta.push(`        <Calories>${Math.round(calories)}</Calories>`);
  }
  if (avgHr != null) {
    lapMeta.push(
      `        <AverageHeartRateBpm><Value>${Math.round(avgHr)}</Value></AverageHeartRateBpm>`
    );
  }
  if (maxHr != null) {
    lapMeta.push(
      `        <MaximumHeartRateBpm><Value>${Math.round(maxHr)}</Value></MaximumHeartRateBpm>`
    );
  }
  lapMeta.push(`        <Intensity>Active</Intensity>`);
  lapMeta.push(`        <TriggerMethod>Manual</TriggerMethod>`);

  const tracks =
    points.length >= 2
      ? buildOutdoorTracks(points, input.heartRateSamples)
      : buildIndoorTrack(
          startMs,
          durationSeconds,
          distanceMeters,
          avgHr,
          input.heartRateSamples
        );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">`,
    `  <Activities>`,
    `    <Activity Sport="Running">`,
    `      <Id>${startIso}</Id>`,
    `      <Lap StartTime="${startIso}">`,
    ...lapMeta,
    tracks,
    `      </Lap>`,
    `      <Notes>${escapeXml(title)}</Notes>`,
    `    </Activity>`,
    `  </Activities>`,
    `</TrainingCenterDatabase>`,
    "",
  ].join("\n");
}

/** Wraps TCX XML in a `.tcx` `File` with a safe filename slug. */
export function tcxFile(tcx: string, name: string): File {
  return new File([tcx], `${routeSlug(name)}.tcx`, {
    type: "application/vnd.garmin.tcx+xml",
  });
}
