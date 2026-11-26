/**
 * Aerobic decoupling / cardiac drift (Pw:Hr — Friel & Coggan, roadmap B3).
 *
 * Compares first-half vs second-half pace-to-heart-rate efficiency on steady
 * runs of 30 minutes or more:
 *   EF₁ = speed₁ / avgHR₁,  EF₂ = speed₂ / avgHR₂
 *   decoupling% = ((EF₁ − EF₂) / EF₁) × 100
 *
 * Under 5% indicates strong aerobic durability; 5–10% is mild cardiac drift;
 * above 10% signals noticeable second-half drift (often pacing, heat, or fuel).
 *
 * Pure module: no React, no Firestore, no clock reads.
 */
import { haversine, isImpossibleStep, type GPSPoint } from "./gps";
import {
  isHeartRateSourceKind,
  MAX_HEART_RATE_SAMPLE_AGE_MS,
  preferSensorReadings,
  ZONE_COVERAGE_MIN,
  type ActiveRunInterval,
  type AerobicDecouplingStatus,
  type AerobicDecouplingSummary,
  type HeartRateSample,
} from "./hrZones";

/** Minimum moving duration (seconds) before cardiac drift is meaningful. */
export const DECOUPLING_MIN_MOVING_SECONDS = 30 * 60;

/** Minimum GPS distance (metres) required in each half. */
const MIN_HALF_DISTANCE_M = 500;

/** Discard implausible values caused by dropout or extended walk stops. */
const MIN_PLAUSIBLE_PCT = -25;
const MAX_PLAUSIBLE_PCT = 50;

/** Session types where pace and HR naturally surge/recover rather than hold steady. */
const EXCLUDED_ACTIVITY_TYPES = new Set([
  "intervals",
  "interval",
  "race",
  "speed",
  "vo2",
  "repetition",
  "fartlek",
]);

function mergeIntervals(
  activeIntervals: readonly ActiveRunInterval[]
): ActiveRunInterval[] {
  const intervals = activeIntervals
    .filter(
      ({ startMs, endMs }) =>
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    )
    .sort((a, b) => a.startMs - b.startMs);
  const merged: ActiveRunInterval[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, interval.endMs);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function splitAtMovingMidpoint(merged: readonly ActiveRunInterval[]): {
  first: ActiveRunInterval[];
  second: ActiveRunInterval[];
  midpointMs: number;
  halfMovingMs: number;
} | null {
  const totalMovingMs = merged.reduce(
    (sum, { startMs, endMs }) => sum + (endMs - startMs),
    0
  );
  if (totalMovingMs <= 0) return null;
  const halfMovingMs = totalMovingMs / 2;
  const first: ActiveRunInterval[] = [];
  const second: ActiveRunInterval[] = [];
  let acc = 0;
  let midpointMs = merged[0].startMs;

  for (const interval of merged) {
    const len = interval.endMs - interval.startMs;
    if (acc + len <= halfMovingMs) {
      first.push(interval);
      acc += len;
      midpointMs = interval.endMs;
    } else if (acc >= halfMovingMs) {
      second.push(interval);
    } else {
      const remaining = halfMovingMs - acc;
      midpointMs = interval.startMs + remaining;
      if (midpointMs > interval.startMs) {
        first.push({ startMs: interval.startMs, endMs: midpointMs });
      }
      if (interval.endMs > midpointMs) {
        second.push({ startMs: midpointMs, endMs: interval.endMs });
      }
      acc = halfMovingMs;
    }
  }

  return { first, second, midpointMs, halfMovingMs };
}

function halfHeartRate(
  ordered: readonly HeartRateSample[],
  intervals: readonly ActiveRunInterval[],
  halfMovingMs: number
): { avgBpm: number; coverage: number } | null {
  let coveredMs = 0;
  let weightedBpm = 0;
  for (const interval of intervals) {
    for (let i = 0; i < ordered.length; i += 1) {
      const sample = ordered[i];
      if (sample.at < interval.startMs || sample.at >= interval.endMs) continue;
      const nextAt = ordered[i + 1]?.at ?? Number.POSITIVE_INFINITY;
      const from = Math.max(sample.at, interval.startMs);
      const to = Math.min(
        nextAt,
        sample.at + MAX_HEART_RATE_SAMPLE_AGE_MS,
        interval.endMs
      );
      if (to <= from) continue;
      const span = to - from;
      coveredMs += span;
      weightedBpm += sample.bpm * span;
    }
  }
  if (coveredMs <= 0 || halfMovingMs <= 0) return null;
  return {
    avgBpm: weightedBpm / coveredMs,
    coverage: Math.min(1, coveredMs / halfMovingMs),
  };
}

function halfDistances(
  points: readonly GPSPoint[],
  midpointMs: number
): { firstM: number; secondM: number } {
  let firstM = 0;
  let secondM = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.breakBefore) continue;
    const stepM = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    if (!Number.isFinite(stepM) || stepM <= 0) continue;
    const dtSec = (curr.timestamp - prev.timestamp) / 1000;
    if (dtSec <= 0 || isImpossibleStep(stepM, dtSec)) continue;
    const stepMidMs = (prev.timestamp + curr.timestamp) / 2;
    if (stepMidMs < midpointMs) {
      firstM += stepM;
    } else {
      secondM += stepM;
    }
  }
  return { firstM, secondM };
}

export function classifyDecoupling(pct: number): AerobicDecouplingStatus {
  if (pct < 5) return "steady";
  if (pct <= 10) return "mild_drift";
  return "high_drift";
}

export interface ComputeAerobicDecouplingInput {
  samples: readonly HeartRateSample[];
  activeIntervals: readonly ActiveRunInterval[];
  points: readonly GPSPoint[];
  activityType?: string | null;
  movingSecondsOverride?: number;
}

/**
 * Compute first-half vs second-half pace-to-HR decoupling for a steady GPS run.
 * Returns `null` whenever the run is too short, non-steady (intervals/race),
 * lacks GPS distance in either half, or has < 50% HR coverage in either half.
 */
export function computeAerobicDecoupling({
  samples,
  activeIntervals,
  points,
  activityType,
  movingSecondsOverride,
}: ComputeAerobicDecouplingInput): AerobicDecouplingSummary | null {
  const normalizedType = (activityType ?? "").trim().toLowerCase();
  if (EXCLUDED_ACTIVITY_TYPES.has(normalizedType)) return null;

  const merged = mergeIntervals(activeIntervals);
  if (merged.length === 0) return null;

  const intervalMovingMs = merged.reduce(
    (sum, { startMs, endMs }) => sum + (endMs - startMs),
    0
  );
  const movingSeconds = Math.max(
    intervalMovingMs / 1000,
    Number.isFinite(movingSecondsOverride) && (movingSecondsOverride ?? 0) > 0
      ? movingSecondsOverride!
      : 0
  );
  if (
    movingSeconds < DECOUPLING_MIN_MOVING_SECONDS ||
    intervalMovingMs < DECOUPLING_MIN_MOVING_SECONDS * 1000 * 0.5
  ) {
    return null;
  }

  const split = splitAtMovingMidpoint(merged);
  if (!split) return null;

  const seen = new Set<string>();
  const validSamples = samples
    .filter((sample) => {
      if (
        !isHeartRateSourceKind(sample.source) ||
        !Number.isFinite(sample.bpm) ||
        sample.bpm < 30 ||
        sample.bpm > 250 ||
        !Number.isFinite(sample.at)
      ) {
        return false;
      }
      if (sample.id) {
        if (seen.has(sample.id)) return false;
        seen.add(sample.id);
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.at - b.at ||
        Number(a.source !== "bluetooth") - Number(b.source !== "bluetooth")
    );
  const ordered = preferSensorReadings(validSamples);
  if (ordered.length === 0) return null;

  const firstHr = halfHeartRate(ordered, split.first, split.halfMovingMs);
  const secondHr = halfHeartRate(ordered, split.second, split.halfMovingMs);
  if (
    !firstHr ||
    !secondHr ||
    firstHr.coverage < ZONE_COVERAGE_MIN ||
    secondHr.coverage < ZONE_COVERAGE_MIN
  ) {
    return null;
  }

  const { firstM, secondM } = halfDistances(points, split.midpointMs);
  if (firstM < MIN_HALF_DISTANCE_M || secondM < MIN_HALF_DISTANCE_M) {
    return null;
  }

  const halfSec = split.halfMovingMs / 1000;
  const ef1 = firstM / halfSec / firstHr.avgBpm;
  const ef2 = secondM / halfSec / secondHr.avgBpm;
  if (!Number.isFinite(ef1) || !Number.isFinite(ef2) || ef1 <= 0) return null;

  const rawPct = ((ef1 - ef2) / ef1) * 100;
  const pct = Math.round(rawPct * 10) / 10;
  if (
    !Number.isFinite(pct) ||
    pct < MIN_PLAUSIBLE_PCT ||
    pct > MAX_PLAUSIBLE_PCT
  ) {
    return null;
  }

  return {
    pct: Object.is(pct, -0) ? 0 : pct,
    firstHalfAvgBpm: Math.round(firstHr.avgBpm),
    secondHalfAvgBpm: Math.round(secondHr.avgBpm),
    status: classifyDecoupling(pct),
  };
}
