/**
 * GPX 1.1 run import (Strava, Garmin Connect, Nike Run Club, Apple Fitness,
 * Coros, Suunto — competitive roadmap P1 #7).
 *
 * Parses trackpoints, multi-segment breaks, elevation, timestamps, and optional
 * Garmin TrackPointExtension heart rate (`gpxtpx:hr` / `ns3:hr` / `hr`), then
 * derives distance, elevation gain, splits, best efforts, HR summary + aerobic
 * decoupling through Tropos's existing GPS and physiology pipelines.
 *
 * Pure XML scanning (no DOMParser / external parser): works identically in
 * Node and browser without executing DTDs or XML entities.
 */
import { db } from "@/lib/firebase";
import { flushQueue, queueDurableWrite } from "@/lib/offlineQueue";
import { localDateString } from "@/lib/dateHelpers";
import {
  calculateSplits,
  detectBestEfforts,
  estimateRunCalories,
  haversine,
  isImpossibleStep,
  MAX_PLAUSIBLE_SPEED_MPS,
  totalDistance,
  totalElevationGain,
  type GPSPoint,
  type Split,
} from "@/lib/gps";
import {
  maxHrFromAge,
  summarizeHeartRate,
  type ActiveRunInterval,
  type HeartRateSample,
  type HeartRateSummary,
} from "@/lib/hrZones";
import { computeAerobicDecoupling } from "@/lib/aerobicDecoupling";
import { runDocument, type FinishedRun } from "@/lib/runCompletion";

export const MAX_GPX_FILE_BYTES = 15 * 1024 * 1024;
export const MIN_IMPORT_DISTANCE_M = 100;

export type GpxImportErrorCode =
  | "GPX_INVALID_XML"
  | "GPX_TOO_FEW_POINTS"
  | "GPX_NO_TIMESTAMPS"
  | "GPX_TOO_SHORT"
  /** The file names a sport that is not running (`importedSport`). */
  | "GPX_NOT_A_RUN"
  /** It moves faster than anyone runs for a minute or more. */
  | "GPX_TOO_FAST";

export class GpxImportError extends Error {
  readonly code: GpxImportErrorCode;
  constructor(code: GpxImportErrorCode, message: string) {
    super(message);
    this.name = "GpxImportError";
    this.code = code;
  }
}

export interface ParseGpxOptions {
  /** Body weight in kg for calorie estimation; defaults to 75 kg. */
  weightKg?: number;
  /** User's max HR (explicit or age-derived) for HR zone distribution. */
  maxHr?: number;
  /** Fallback age if `maxHr` is not supplied. */
  age?: number;
}

export interface ParsedGpxRun {
  /** Deterministic id (`gpx-...` or `tcx-...`) so re-importing is idempotent. */
  importId: string;
  source?: "gpx" | "tcx";
  place?: "treadmill";
  name: string | undefined;
  points: GPSPoint[];
  startedAt: number;
  finishedAt: number;
  date: string;
  distance: number;
  duration: number;
  avgPaceSeconds: number;
  elevationGain: number;
  calories: number;
  splits: Split[];
  bestEfforts: { distance: number; time: number; label: string }[];
  heartRate: HeartRateSummary | null;
}

export interface ImportedGpxRunSummary {
  runId: string;
  name: string;
  distance: number;
  duration: number;
  date: string;
  hasHeartRate: boolean;
}

/**
 * The sport a file names, as far as an import cares: a run, or what else
 * it is. `null` when the file names none, or only a word that says
 * nothing about the sport ("Other" in Garmin's GPX, "generic"): such a
 * file is read as the run it was offered as, and the speed check
 * (`SUSTAINED_TOO_FAST_SECONDS`) still stands guard.
 *
 * Tropos has no walk or hike, so those are refused with the rest. GPX
 * carries the sport in `<trk><type>`, as a word (Garmin Connect:
 * "running", "trail_running", "cycling", "road_biking", "walking",
 * "hiking") or as Strava's number, read by experiment since Strava
 * publishes none (Stack Overflow 61903437): 9 Run and 53 Virtual Run;
 * 1 Ride, 17 Virtual Ride and 18 E-Bike Ride; 10 Walk; 4 Hike.
 */
export type ImportedSport = "run" | "ride" | "walk" | "hike" | "other";

const STRAVA_TYPE_NUMBERS: Readonly<Record<string, ImportedSport>> = {
  "9": "run",
  "53": "run",
  "1": "ride",
  "17": "ride",
  "18": "ride",
  "10": "walk",
  "4": "hike",
};

/** Words that name no sport, so a file carrying one is not refused. */
const UNSTATED_SPORT_WORDS = new Set([
  "",
  "other",
  "generic",
  "unknown",
  "uncategorized",
  "uncategorised",
  "activity",
  "all",
]);

export function importedSport(raw: string | undefined): ImportedSport | null {
  const word = (raw ?? "").trim().toLowerCase();
  if (UNSTATED_SPORT_WORDS.has(word)) return null;
  if (/^\d+$/.test(word)) return STRAVA_TYPE_NUMBERS[word] ?? "other";
  if (/run|jog/.test(word)) return "run";
  if (/bik|cycl|ride|bicycl/.test(word)) return "ride";
  if (/walk/.test(word)) return "walk";
  if (/hik/.test(word)) return "hike";
  return "other";
}

/** Why a file of another sport is refused, in the import's own words. */
const NOT_A_RUN_MESSAGES: Readonly<
  Record<Exclude<ImportedSport, "run">, string>
> = {
  ride: "This file is a bike ride. Only runs can be imported.",
  walk: "This file is a walk. Only runs can be imported.",
  hike: "This file is a hike. Only runs can be imported.",
  other: "This file is from another sport. Only runs can be imported.",
};

function refuseUnlessRun(sport: ImportedSport | null): void {
  if (sport === null || sport === "run") return;
  throw new GpxImportError("GPX_NOT_A_RUN", NOT_A_RUN_MESSAGES[sport]);
}

/**
 * How long a track may move faster than anyone runs before it is refused,
 * in seconds. The bound is `MAX_PLAUSIBLE_SPEED_MPS` (12 m/s, 43 km/h),
 * the one a live run drops a fix past and a saved run's best efforts are
 * checked against (`keptBestEfforts`). A step or two past it is a GPS
 * glitch; a minute of it is a car or a train. A Tropos heuristic.
 */
export const SUSTAINED_TOO_FAST_SECONDS = 60;

const TOO_FAST_MESSAGE =
  "This file moves faster than anyone can run. Only runs can be imported.";

/** Throws when consecutive steps faster than any runner add up to a minute. */
function refuseSustainedTooFast(points: readonly RawTrackPoint[]): void {
  let stretchSeconds = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const pt = points[i];
    const seconds = (pt.timestamp - prev.timestamp) / 1000;
    if (
      pt.breakBefore ||
      !(seconds > 0) ||
      !isImpossibleStep(haversine(prev.lat, prev.lon, pt.lat, pt.lon), seconds)
    ) {
      stretchSeconds = 0;
      continue;
    }
    stretchSeconds += seconds;
    if (stretchSeconds >= SUSTAINED_TOO_FAST_SECONDS) {
      throw new GpxImportError("GPX_TOO_FAST", TOO_FAST_MESSAGE);
    }
  }
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0
        ? String.fromCodePoint(code)
        : "";
    });
}

function extractFirstTagText(xml: string, tagName: string): string | undefined {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tagName}>`,
    "i"
  );
  const m = re.exec(xml);
  if (!m) return undefined;
  const decoded = decodeXmlEntities(m[1]).trim();
  return decoded.length > 0 ? decoded : undefined;
}

function parseAttrNumber(attrs: string, name: string): number {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = re.exec(attrs);
  if (!m) return NaN;
  return Number(m[1]);
}

function parseAttrString(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = re.exec(attrs);
  return m ? decodeXmlEntities(m[1]).trim() : undefined;
}

function extractHeartRateBpm(body: string): number | null {
  const m =
    /<(?:[\w-]+:)?(?:hr|heartrate)\b[^>]*>\s*([\d.]+)\s*<\/(?:[\w-]+:)?(?:hr|heartrate)>/i.exec(
      body
    );
  if (!m) return null;
  const bpm = Number(m[1]);
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 250 ? bpm : null;
}

function extractTcxHeartRateBpm(body: string): number | null {
  const block =
    /<(?:[\w-]+:)?HeartRateBpm\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?HeartRateBpm>/i.exec(
      body
    );
  if (!block) return null;
  const valStr = extractFirstTagText(block[1], "Value");
  const bpm = valStr !== undefined ? Number(valStr) : NaN;
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 250 ? bpm : null;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function resolveWeightKg(weightKg?: number): number {
  return typeof weightKg === "number" &&
    Number.isFinite(weightKg) &&
    weightKg > 20
    ? weightKg
    : 75;
}

function resolveMaxHr(options: ParseGpxOptions): number {
  if (
    typeof options.maxHr === "number" &&
    Number.isFinite(options.maxHr) &&
    options.maxHr > 0
  ) {
    return options.maxHr;
  }
  if (
    typeof options.age === "number" &&
    Number.isFinite(options.age) &&
    options.age > 0
  ) {
    return maxHrFromAge(options.age);
  }
  return 0;
}

interface RawTrackPoint {
  lat: number;
  lon: number;
  altitude: number | null;
  timestamp: number;
  hr: number | null;
  breakBefore: boolean;
}

function buildParsedRunFromTrackPoints(
  rawPoints: RawTrackPoint[],
  meta: {
    source: "gpx" | "tcx";
    formatLabel: string;
    name: string | undefined;
    options: ParseGpxOptions;
  }
): ParsedGpxRun {
  // Enforce non-decreasing timestamps while preserving segment breaks.
  const ordered: RawTrackPoint[] = [];
  for (const pt of rawPoints) {
    const prev = ordered[ordered.length - 1];
    if (prev && pt.timestamp < prev.timestamp) continue;
    ordered.push(pt);
  }

  if (ordered.length < 2) {
    throw new GpxImportError(
      "GPX_NO_TIMESTAMPS",
      `This ${meta.formatLabel} file doesn’t include valid timestamps.`
    );
  }
  refuseSustainedTooFast(ordered);

  // Convert into Tropos GPSPoints, accumulating pause time across explicit
  // segment breaks so moving time and splits exclude stopped segments.
  let cumulativePausedMs = 0;
  const points: GPSPoint[] = [];
  const hrSamples: HeartRateSample[] = [];
  const activeIntervals: ActiveRunInterval[] = [];
  let intervalStartMs = ordered[0].timestamp;

  for (let i = 0; i < ordered.length; i++) {
    const pt = ordered[i];
    const prev = i > 0 ? ordered[i - 1] : null;
    if (prev && pt.breakBefore) {
      const gapMs = Math.max(0, pt.timestamp - prev.timestamp);
      if (prev.timestamp > intervalStartMs) {
        activeIntervals.push({
          startMs: intervalStartMs,
          endMs: prev.timestamp,
        });
      }
      cumulativePausedMs += gapMs;
      intervalStartMs = pt.timestamp;
    }

    let speed: number | null = null;
    if (prev && !pt.breakBefore) {
      const dtS = (pt.timestamp - prev.timestamp) / 1000;
      if (dtS > 0) {
        const distM = haversine(prev.lat, prev.lon, pt.lat, pt.lon);
        const mps = distM / dtS;
        if (Number.isFinite(mps) && mps >= 0 && mps <= 15) {
          speed = mps;
        }
      }
    }

    const gpsPoint: GPSPoint = {
      ...(pt.breakBefore ? { breakBefore: true } : {}),
      lat: pt.lat,
      lon: pt.lon,
      altitude: pt.altitude,
      accuracy: 5,
      speed,
      timestamp: pt.timestamp,
      rawLat: pt.lat,
      rawLon: pt.lon,
      ...(cumulativePausedMs > 0 ? { pausedMs: cumulativePausedMs } : {}),
    };
    points.push(gpsPoint);

    if (pt.hr !== null) {
      hrSamples.push({
        bpm: pt.hr,
        at: pt.timestamp,
        source: "bluetooth",
        id: `${meta.source}-${i}-${pt.timestamp}`,
      });
    }
  }

  const startedAt = ordered[0].timestamp;
  const finishedAt = ordered[ordered.length - 1].timestamp;
  if (finishedAt > intervalStartMs) {
    activeIntervals.push({ startMs: intervalStartMs, endMs: finishedAt });
  }

  const totalSpanMs = finishedAt - startedAt;
  const activeMs = Math.max(0, totalSpanMs - cumulativePausedMs);
  if (activeMs < 1000) {
    throw new GpxImportError(
      "GPX_NO_TIMESTAMPS",
      `This ${meta.formatLabel} file doesn’t have a positive run duration.`
    );
  }

  const distance = Math.round(totalDistance(points));
  if (distance < MIN_IMPORT_DISTANCE_M) {
    throw new GpxImportError(
      "GPX_TOO_SHORT",
      "Imported runs must be at least 100 m."
    );
  }

  const duration = Math.round(activeMs / 1000);
  const avgPaceSeconds = (duration / distance) * 1000;
  const elevationGain = Math.round(totalElevationGain(points));
  const splits = calculateSplits(points);
  const bestEfforts = detectBestEfforts(points, distance);
  const calories = estimateRunCalories(
    distance,
    resolveWeightKg(meta.options.weightKg)
  );
  const resolvedMaxHr = resolveMaxHr(meta.options);

  let heartRate: HeartRateSummary | null = null;
  if (hrSamples.length > 0) {
    const summary = summarizeHeartRate(
      hrSamples,
      activeIntervals,
      resolvedMaxHr,
      duration
    );
    if (summary) {
      const decoupling = computeAerobicDecoupling({
        points,
        samples: hrSamples,
        activeIntervals,
        movingSecondsOverride: duration,
      });
      heartRate = decoupling ? { ...summary, decoupling } : summary;
    }
  }

  const signature = `${startedAt}:${distance}:${duration}:${ordered[0].lat.toFixed(4)}:${ordered[0].lon.toFixed(4)}`;
  const importId = `${meta.source}-${fnv1aHex(signature)}`;

  return {
    importId,
    source: meta.source,
    name: meta.name,
    points,
    startedAt,
    finishedAt,
    date: localDateString(new Date(startedAt)),
    distance,
    duration,
    avgPaceSeconds,
    elevationGain,
    calories,
    splits,
    bestEfforts,
    heartRate,
  };
}

const TRKSEG_RE = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi;
const TRKPT_RE = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;

const TCX_ACTIVITY_RE =
  /<(?:[\w-]+:)?Activity\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?Activity>/gi;
const TCX_LAP_RE = /<(?:[\w-]+:)?Lap\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?Lap>/gi;
const TCX_TRACK_RE =
  /<(?:[\w-]+:)?Track\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Track>/gi;
const TCX_TRACKPOINT_RE =
  /<(?:[\w-]+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Trackpoint>/gi;

/**
 * Parses a GPX 1.1 XML string into a validated, metrics-computed run ready to
 * persist into `users/{uid}/runs`.
 */
export function parseGpxRun(
  xml: string,
  options: ParseGpxOptions = {}
): ParsedGpxRun {
  if (!xml || !/<gpx\b/i.test(xml)) {
    throw new GpxImportError(
      "GPX_INVALID_XML",
      "This file isn’t a valid GPX track."
    );
  }

  // Prefer the first <trk><name>; fall back to <metadata><name>.
  const trkMatch = /<trk\b[^>]*>([\s\S]*?)<\/trk>/i.exec(xml);
  const trkBlock = trkMatch ? trkMatch[1] : xml;
  const trkHeader = trkBlock.split(/<trkseg\b/i)[0] ?? "";
  const metadataMatch = /<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i.exec(xml);
  const name =
    extractFirstTagText(trkHeader, "name") ??
    (metadataMatch ? extractFirstTagText(metadataMatch[1], "name") : undefined);
  refuseUnlessRun(importedSport(extractFirstTagText(trkHeader, "type")));

  const segments: string[] = [];
  for (const m of trkBlock.matchAll(TRKSEG_RE)) {
    segments.push(m[1]);
  }
  // Some minimalist exporters omit <trkseg> and put <trkpt> directly in <trk>.
  if (segments.length === 0) {
    segments.push(trkBlock);
  }

  const rawPoints: RawTrackPoint[] = [];
  let sawValidCoordinateCount = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    let isFirstInSeg = true;
    for (const m of segments[segIdx].matchAll(TRKPT_RE)) {
      const attrs = m[1] ?? "";
      const body = m[2] ?? "";
      const lat = parseAttrNumber(attrs, "lat");
      const lon = parseAttrNumber(attrs, "lon");
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        continue;
      }
      sawValidCoordinateCount++;

      const timeStr = extractFirstTagText(body, "time");
      const timestamp = timeStr ? Date.parse(timeStr) : NaN;
      if (!Number.isFinite(timestamp)) continue;

      const eleStr = extractFirstTagText(body, "ele");
      const eleNum = eleStr !== undefined ? Number(eleStr) : NaN;
      const altitude = Number.isFinite(eleNum) ? eleNum : null;

      const hr = extractHeartRateBpm(body);

      rawPoints.push({
        lat,
        lon,
        altitude,
        timestamp,
        hr,
        breakBefore: segIdx > 0 && isFirstInSeg && rawPoints.length > 0,
      });
      isFirstInSeg = false;
    }
  }

  if (sawValidCoordinateCount < 2) {
    throw new GpxImportError(
      "GPX_TOO_FEW_POINTS",
      "This GPX file doesn’t contain enough GPS points for a run."
    );
  }

  if (rawPoints.length < 2) {
    throw new GpxImportError(
      "GPX_NO_TIMESTAMPS",
      "This GPX file doesn’t include timestamps."
    );
  }

  return buildParsedRunFromTrackPoints(rawPoints, {
    source: "gpx",
    formatLabel: "GPX",
    name,
    options,
  });
}

/**
 * Parses a Garmin Training Center XML (`.tcx`) file into a validated,
 * metrics-computed run. Supports outdoor GPS tracks (including multi-track
 * pause breaks, altitude, and heart rate) as well as indoor/treadmill TCX
 * files that carry `<DistanceMeters>` and `<HeartRateBpm>` without GPS
 * `<Position>` coordinates.
 */
export function parseTcxRun(
  xml: string,
  options: ParseGpxOptions = {}
): ParsedGpxRun {
  if (!xml || !/<(?:[\w-]+:)?TrainingCenterDatabase\b/i.test(xml)) {
    throw new GpxImportError(
      "GPX_INVALID_XML",
      "This file isn’t a valid TCX activity."
    );
  }

  const activities: { sport: string; body: string }[] = [];
  for (const m of xml.matchAll(TCX_ACTIVITY_RE)) {
    const sport = (parseAttrString(m[1] ?? "", "Sport") ?? "").toLowerCase();
    activities.push({ sport, body: m[2] ?? "" });
  }
  // A multisport file is read for its run. With none, the first activity
  // says what the file is; TCX's Sport is Running, Biking or Other.
  const chosenActivity =
    activities.find((a) => importedSport(a.sport) === "run") ?? activities[0];
  if (chosenActivity) {
    const sport = chosenActivity.sport.trim().toLowerCase();
    refuseUnlessRun(
      sport === "other" ? "other" : importedSport(chosenActivity.sport)
    );
  }
  const activityBody = chosenActivity ? chosenActivity.body : xml;

  const notesText = extractFirstTagText(activityBody, "Notes");
  const name = notesText && notesText.length <= 120 ? notesText : undefined;

  const tracks: string[] = [];
  for (const m of activityBody.matchAll(TCX_TRACK_RE)) {
    tracks.push(m[1]);
  }

  const rawPoints: RawTrackPoint[] = [];
  let sawValidCoordinateCount = 0;

  // Indoor/treadmill accumulators for TCX files without <Position>.
  const indoorHrSamples: HeartRateSample[] = [];
  const indoorIntervals: ActiveRunInterval[] = [];
  let maxTrackpointDistanceM = 0;
  let firstTrackpointMs: number | null = null;
  let lastTrackpointMs: number | null = null;

  for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
    let isFirstGpsInTrack = true;
    let trackFirstMs: number | null = null;
    let trackLastMs: number | null = null;
    let ptIndex = 0;

    for (const m of tracks[trackIdx].matchAll(TCX_TRACKPOINT_RE)) {
      const body = m[1] ?? "";
      const timeStr = extractFirstTagText(body, "Time");
      const timestamp = timeStr ? Date.parse(timeStr) : NaN;
      const hr = extractTcxHeartRateBpm(body);

      const distStr = extractFirstTagText(body, "DistanceMeters");
      const distNum = distStr !== undefined ? Number(distStr) : NaN;
      if (Number.isFinite(distNum) && distNum > maxTrackpointDistanceM) {
        maxTrackpointDistanceM = distNum;
      }

      if (Number.isFinite(timestamp)) {
        if (firstTrackpointMs === null || timestamp < firstTrackpointMs) {
          firstTrackpointMs = timestamp;
        }
        if (lastTrackpointMs === null || timestamp > lastTrackpointMs) {
          lastTrackpointMs = timestamp;
        }
        if (trackFirstMs === null) trackFirstMs = timestamp;
        if (trackLastMs === null || timestamp >= trackLastMs) {
          trackLastMs = timestamp;
        }
        if (hr !== null) {
          indoorHrSamples.push({
            bpm: hr,
            at: timestamp,
            source: "bluetooth",
            id: `tcx-indoor-${trackIdx}-${ptIndex}-${timestamp}`,
          });
        }
      }

      const posMatch =
        /<(?:[\w-]+:)?Position\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Position>/i.exec(
          body
        );
      if (posMatch) {
        const latStr = extractFirstTagText(posMatch[1], "LatitudeDegrees");
        const lonStr = extractFirstTagText(posMatch[1], "LongitudeDegrees");
        const lat = latStr !== undefined ? Number(latStr) : NaN;
        const lon = lonStr !== undefined ? Number(lonStr) : NaN;
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180
        ) {
          sawValidCoordinateCount++;
          if (Number.isFinite(timestamp)) {
            const altStr = extractFirstTagText(body, "AltitudeMeters");
            const altNum = altStr !== undefined ? Number(altStr) : NaN;
            rawPoints.push({
              lat,
              lon,
              altitude: Number.isFinite(altNum) ? altNum : null,
              timestamp,
              hr,
              breakBefore:
                trackIdx > 0 && isFirstGpsInTrack && rawPoints.length > 0,
            });
            isFirstGpsInTrack = false;
          }
        }
      }
      ptIndex++;
    }

    if (
      trackFirstMs !== null &&
      trackLastMs !== null &&
      trackLastMs > trackFirstMs
    ) {
      indoorIntervals.push({ startMs: trackFirstMs, endMs: trackLastMs });
    }
  }

  // Outdoor GPS TCX run: reuse the exact GPX pipeline.
  if (rawPoints.length >= 2) {
    return buildParsedRunFromTrackPoints(rawPoints, {
      source: "tcx",
      formatLabel: "TCX",
      name,
      options,
    });
  }

  if (sawValidCoordinateCount >= 2) {
    throw new GpxImportError(
      "GPX_NO_TIMESTAMPS",
      "This TCX file doesn’t include timestamps."
    );
  }

  // Indoor / treadmill TCX fallback: derive totals from <Lap> summaries and
  // trackpoint <DistanceMeters> / <HeartRateBpm>.
  let lapDistanceM = 0;
  let lapDurationSec = 0;
  let firstLapStartMs: number | null = null;
  for (const m of activityBody.matchAll(TCX_LAP_RE)) {
    const startAttr = parseAttrString(m[1] ?? "", "StartTime");
    const startMs = startAttr ? Date.parse(startAttr) : NaN;
    if (
      Number.isFinite(startMs) &&
      (firstLapStartMs === null || startMs < firstLapStartMs)
    ) {
      firstLapStartMs = startMs;
    }
    const lapBody = m[2] ?? "";
    // Read direct lap totals before any <Track> block so trackpoint tags
    // aren't accidentally matched.
    const lapHeader = lapBody.split(/<(?:[\w-]+:)?Track\b/i)[0] ?? lapBody;
    const dStr = extractFirstTagText(lapHeader, "DistanceMeters");
    const tStr = extractFirstTagText(lapHeader, "TotalTimeSeconds");
    const dNum = dStr !== undefined ? Number(dStr) : NaN;
    const tNum = tStr !== undefined ? Number(tStr) : NaN;
    if (Number.isFinite(dNum) && dNum > 0) lapDistanceM += dNum;
    if (Number.isFinite(tNum) && tNum > 0) lapDurationSec += tNum;
  }

  const distance = Math.round(Math.max(maxTrackpointDistanceM, lapDistanceM));
  const activeMsFromTracks = indoorIntervals.reduce(
    (sum, iv) => sum + (iv.endMs - iv.startMs),
    0
  );
  const duration = Math.round(
    lapDurationSec > 0 ? lapDurationSec : activeMsFromTracks / 1000
  );

  const activityIdStr = extractFirstTagText(activityBody, "Id");
  const activityIdMs = activityIdStr ? Date.parse(activityIdStr) : NaN;
  const startedAt =
    firstTrackpointMs ??
    firstLapStartMs ??
    (Number.isFinite(activityIdMs) ? activityIdMs : null);

  if (startedAt === null || duration < 1) {
    throw new GpxImportError(
      "GPX_TOO_FEW_POINTS",
      "This TCX file doesn’t contain enough GPS points or lap data for a run."
    );
  }
  if (distance < MIN_IMPORT_DISTANCE_M) {
    throw new GpxImportError(
      "GPX_TOO_SHORT",
      "Imported runs must be at least 100 m."
    );
  }
  // No track to check step by step: the laps' distance over their time is
  // the speed, as a treadmill run typed in is judged (`getInvalidRunReason`).
  if (distance / duration > MAX_PLAUSIBLE_SPEED_MPS) {
    throw new GpxImportError("GPX_TOO_FAST", TOO_FAST_MESSAGE);
  }

  const finishedAt =
    lastTrackpointMs !== null && lastTrackpointMs > startedAt
      ? lastTrackpointMs
      : startedAt + duration * 1000;
  const avgPaceSeconds = (duration / distance) * 1000;
  const calories = estimateRunCalories(
    distance,
    resolveWeightKg(options.weightKg)
  );
  const resolvedMaxHr = resolveMaxHr(options);
  const hrIntervals =
    indoorIntervals.length > 0
      ? indoorIntervals
      : [{ startMs: startedAt, endMs: finishedAt }];
  const heartRate =
    indoorHrSamples.length > 0
      ? summarizeHeartRate(
          indoorHrSamples,
          hrIntervals,
          resolvedMaxHr,
          duration
        )
      : null;

  const signature = `treadmill:${startedAt}:${distance}:${duration}`;
  const importId = `tcx-${fnv1aHex(signature)}`;

  return {
    importId,
    source: "tcx",
    place: "treadmill",
    name,
    points: [],
    startedAt,
    finishedAt,
    date: localDateString(new Date(startedAt)),
    distance,
    duration,
    avgPaceSeconds,
    elevationGain: 0,
    calories,
    splits: [],
    bestEfforts: [],
    heartRate,
  };
}

/**
 * Auto-detects and parses either a GPX 1.1 or Garmin TCX run XML file.
 */
export function parseRunFile(
  xml: string,
  options: ParseGpxOptions = {}
): ParsedGpxRun {
  if (!xml) {
    throw new GpxImportError(
      "GPX_INVALID_XML",
      "This file isn’t a valid GPX or TCX run."
    );
  }
  if (/<(?:[\w-]+:)?TrainingCenterDatabase\b/i.test(xml)) {
    return parseTcxRun(xml, options);
  }
  if (/<gpx\b/i.test(xml)) {
    return parseGpxRun(xml, options);
  }
  throw new GpxImportError(
    "GPX_INVALID_XML",
    "This file isn’t a valid GPX or TCX run."
  );
}

async function persistParsedRun(
  uid: string,
  parsed: ParsedGpxRun
): Promise<ImportedGpxRunSummary> {
  const finishedRun: FinishedRun = {
    points: parsed.points,
    startedAt: parsed.startedAt,
    recordingStartedAt: parsed.startedAt,
    finishedAt: parsed.finishedAt,
    heartRate: parsed.heartRate,
    distance: parsed.distance,
    elapsed: parsed.duration,
    avgPaceSeconds: parsed.avgPaceSeconds,
    calories: parsed.calories,
    elevationGain: parsed.elevationGain,
    splits: parsed.splits,
    runConfig: null,
    notes: parsed.source === "tcx" ? "Imported from TCX" : "Imported from GPX",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: parsed.bestEfforts,
    name: parsed.name,
  };

  const baseDoc = runDocument(finishedRun, new Date(parsed.finishedAt));
  const docData =
    parsed.place === "treadmill"
      ? { ...baseDoc, place: "treadmill" as const }
      : baseDoc;
  queueDurableWrite(uid, `users/${uid}/runs`, parsed.importId, docData);
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    await flushQueue(db, uid).catch(() => {});
  }

  return {
    runId: parsed.importId,
    name: docData.name,
    distance: parsed.distance,
    duration: parsed.duration,
    date: parsed.date,
    hasHeartRate: parsed.heartRate !== null,
  };
}

/**
 * Parses a GPX or TCX run file and queues it durably into `users/{uid}/runs`
 * using the canonical `runDocument` builder so History, RunDetail, splits,
 * maps, HR zones, and exports all read it seamlessly.
 */
export async function importRunFile(
  uid: string,
  xml: string,
  options: ParseGpxOptions = {}
): Promise<ImportedGpxRunSummary> {
  return persistParsedRun(uid, parseRunFile(xml, options));
}
