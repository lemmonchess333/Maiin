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
  | "GPX_TOO_SHORT";

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
  /** Deterministic id (`gpx-...`) so re-importing the same file is idempotent. */
  importId: string;
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

function extractHeartRateBpm(body: string): number | null {
  const m =
    /<(?:[\w-]+:)?(?:hr|heartrate)\b[^>]*>\s*([\d.]+)\s*<\/(?:[\w-]+:)?(?:hr|heartrate)>/i.exec(
      body
    );
  if (!m) return null;
  const bpm = Number(m[1]);
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

interface RawTrackPoint {
  lat: number;
  lon: number;
  altitude: number | null;
  timestamp: number;
  hr: number | null;
  breakBefore: boolean;
}

const TRKSEG_RE = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi;
const TRKPT_RE = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;

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
      "This GPX file doesn’t include valid timestamps."
    );
  }

  // Convert into Tropos GPSPoints, accumulating pause time across explicit
  // `<trkseg>` breaks so moving time and splits exclude stopped segments.
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
        id: `gpx-${i}-${pt.timestamp}`,
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
      "This GPX file doesn’t have a positive run duration."
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
  const weightKg =
    typeof options.weightKg === "number" &&
    Number.isFinite(options.weightKg) &&
    options.weightKg > 20
      ? options.weightKg
      : 75;
  const calories = estimateRunCalories(distance, weightKg);

  const resolvedMaxHr =
    typeof options.maxHr === "number" &&
    Number.isFinite(options.maxHr) &&
    options.maxHr > 0
      ? options.maxHr
      : typeof options.age === "number" &&
          Number.isFinite(options.age) &&
          options.age > 0
        ? maxHrFromAge(options.age)
        : 0;

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
  const importId = `gpx-${fnv1aHex(signature)}`;

  return {
    importId,
    name,
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

/**
 * Parses a GPX file and queues it durably into `users/{uid}/runs/{importId}`
 * using the canonical `runDocument` builder so History, RunDetail, splits,
 * maps, HR zones, and exports all read it seamlessly.
 */
export async function importGpxRun(
  uid: string,
  xml: string,
  options: ParseGpxOptions = {}
): Promise<ImportedGpxRunSummary> {
  const parsed = parseGpxRun(xml, options);
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
    notes: "Imported from GPX",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: parsed.bestEfforts,
    name: parsed.name,
  };

  const docData = runDocument(finishedRun, new Date(parsed.finishedAt));
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
