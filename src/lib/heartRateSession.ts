/**
 * Phone moving intervals plus an in-memory copy of the run's readings, from
 * the Watch or a Bluetooth sensor. The native WatchRun coordinator is the
 * durable raw-HR store for the Watch, with iOS file protection; the native
 * HeartRateSensor plugin keeps a sensor's readings in memory for the run,
 * which outlives a reloaded web view but not the app. WebView localStorage
 * holds only interval timestamps. Raw readings never go to Firestore or
 * analytics. Callers clear every store on save or discard.
 */
import {
  MAX_HEART_RATE_SAMPLE_AGE_MS,
  isHeartRateSourceKind,
  type ActiveRunInterval,
  type HeartRateSample,
} from "./hrZones";
import { getPendingWatchHeartRateSamples } from "./watchRunBridge";
import {
  clearHeartRateSensorSessions,
  getHeartRateSensorSessionSamples,
} from "./heartRateSensorBridge";
import { keysWithPrefix, readJson, remove, writeJson } from "./localStore";

const PREFIX = "tropos:watch-heart-rate:v1:";
/** A sensor reads about once a second (Heart Rate Service 1.0 §3.1.1.5), so
 *  this holds 12 hours of it; a Watch's readings, every few seconds, far
 *  longer. */
const MAX_SAMPLES = 43_200;
/** `lastObservedAt` is written at most this often, ms: a strap's beat a
 *  second would otherwise rewrite the record every second. It bounds a
 *  moving interval after the web view dies, which this coarsens by at most
 *  as much. A Tropos heuristic. */
const OBSERVED_WRITE_EVERY_MS = 5_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSession {
  updatedAt: number;
  activeSince: number | null;
  lastObservedAt: number | null;
  activeIntervals: ActiveRunInterval[];
}

export interface HeartRateSessionSnapshot {
  samples: HeartRateSample[];
  activeIntervals: ActiveRunInterval[];
}

const sampleBuffers = new Map<string, HeartRateSample[]>();
const sampleIds = new Map<string, Set<string>>();

function key(uid: string, sessionId: string): string | null {
  if (!uid || !sessionId) return null;
  return `${PREFIX}${encodeURIComponent(uid)}:${encodeURIComponent(sessionId)}`;
}

function empty(): StoredSession {
  return {
    updatedAt: Date.now(),
    activeSince: null,
    lastObservedAt: null,
    activeIntervals: [],
  };
}

function load(uid: string, sessionId: string): StoredSession {
  const storageKey = key(uid, sessionId);
  if (!storageKey) return empty();
  const parsed = readJson<StoredSession | null>(storageKey, null);
  if (!parsed || typeof parsed !== "object") return empty();
  if (
    !Number.isFinite(parsed.updatedAt) ||
    Date.now() - parsed.updatedAt > MAX_AGE_MS ||
    !Array.isArray(parsed.activeIntervals)
  ) {
    remove(storageKey);
    return empty();
  }
  return parsed;
}

function save(uid: string, sessionId: string, session: StoredSession): void {
  const storageKey = key(uid, sessionId);
  if (!storageKey) return;
  // A full or unavailable store must never interrupt recording.
  writeJson(storageKey, {
    updatedAt: Date.now(),
    activeSince: session.activeSince,
    lastObservedAt: session.lastObservedAt,
    activeIntervals: session.activeIntervals,
  });
}

/** Mark the phone recorder's start or resume; a second call is a recovery boundary. */
export function beginMoving(
  uid: string,
  sessionId: string,
  atMs: number
): void {
  if (!Number.isFinite(atMs)) return;
  const session = load(uid, sessionId);
  if (session.activeSince != null) {
    // A resumed JS process must not turn the time while it was dead into a
    // continuous HR interval. A recent reading bounds the old interval.
    const last = session.lastObservedAt;
    const end =
      last == null
        ? session.activeSince
        : Math.min(atMs, last + MAX_HEART_RATE_SAMPLE_AGE_MS);
    if (end > session.activeSince)
      session.activeIntervals.push({
        startMs: session.activeSince,
        endMs: end,
      });
  }
  session.activeSince = atMs;
  session.lastObservedAt = null;
  save(uid, sessionId, session);
}

/** End the current moving interval on a phone pause or run finish. */
export function pauseMoving(
  uid: string,
  sessionId: string,
  atMs: number
): void {
  if (!Number.isFinite(atMs)) return;
  const session = load(uid, sessionId);
  if (session.activeSince != null && atMs > session.activeSince) {
    session.activeIntervals.push({
      startMs: session.activeSince,
      endMs: atMs,
    });
  }
  session.activeSince = null;
  session.lastObservedAt = null;
  save(uid, sessionId, session);
}

export const finishMoving = pauseMoving;

/** Ignore invalid beats and retransmissions; retain only a bounded tail. */
export function appendHeartRateSample(
  uid: string,
  sessionId: string,
  sample: HeartRateSample
): void {
  if (
    !Number.isFinite(sample.at) ||
    !Number.isFinite(sample.bpm) ||
    sample.bpm < 30 ||
    sample.bpm > 250 ||
    !isHeartRateSourceKind(sample.source)
  )
    return;
  const storageKey = key(uid, sessionId);
  if (!storageKey) return;
  const buffer = sampleBuffers.get(storageKey) ?? [];
  const ids = sampleIds.get(storageKey) ?? new Set<string>();
  if (sample.id && ids.has(sample.id)) return;
  buffer.push(sample);
  if (sample.id) ids.add(sample.id);
  if (buffer.length > MAX_SAMPLES) {
    for (const dropped of buffer.splice(0, buffer.length - MAX_SAMPLES))
      if (dropped.id) ids.delete(dropped.id);
  }
  sampleBuffers.set(storageKey, buffer);
  sampleIds.set(storageKey, ids);
  const session = load(uid, sessionId);
  if (session.activeSince == null) return;
  const observed = Math.max(session.lastObservedAt ?? sample.at, sample.at);
  if (
    session.lastObservedAt != null &&
    observed - session.lastObservedAt < OBSERVED_WRITE_EVERY_MS
  )
    return;
  session.lastObservedAt = observed;
  save(uid, sessionId, session);
}

export function getHeartRateSession(
  uid: string,
  sessionId: string
): HeartRateSessionSnapshot {
  const session = load(uid, sessionId);
  return {
    samples: [...(sampleBuffers.get(key(uid, sessionId) ?? "") ?? [])],
    activeIntervals: session.activeIntervals.map((interval) => ({
      ...interval,
    })),
  };
}

/** Merge protected native backlog after a WebView restart or disconnect,
 *  and the sensor's readings native kept for the run. */
export async function getRecoveredHeartRateSession(
  uid: string,
  sessionId: string
): Promise<HeartRateSessionSnapshot> {
  const local = getHeartRateSession(uid, sessionId);
  const [pending, sensor] = await Promise.all([
    getPendingWatchHeartRateSamples(),
    getHeartRateSensorSessionSamples(sessionId),
  ]);
  const seen = new Set(
    local.samples.map((sample) => sample.id).filter(Boolean)
  );
  for (const sample of pending) {
    if (sample.sessionId !== sessionId || seen.has(sample.sampleId)) continue;
    seen.add(sample.sampleId);
    local.samples.push({
      id: sample.sampleId,
      at: sample.timestampMs,
      bpm: sample.bpm,
      source: "apple-watch",
    });
  }
  for (const sample of sensor) {
    if (!sample.id || seen.has(sample.id)) continue;
    seen.add(sample.id);
    local.samples.push(sample);
  }
  return local;
}

export function clearHeartRateSession(uid: string, sessionId: string): void {
  const storageKey = key(uid, sessionId);
  if (storageKey) sampleBuffers.delete(storageKey);
  if (storageKey) sampleIds.delete(storageKey);
  if (storageKey) remove(storageKey);
  if (sessionId) void clearHeartRateSensorSessions(sessionId);
}

export function clearHeartRateSessionsForUser(uid: string): void {
  if (!uid) return;
  const prefix = `${PREFIX}${encodeURIComponent(uid)}:`;
  for (const storageKey of sampleBuffers.keys()) {
    if (storageKey.startsWith(prefix)) sampleBuffers.delete(storageKey);
  }
  for (const storageKey of sampleIds.keys()) {
    if (storageKey.startsWith(prefix)) sampleIds.delete(storageKey);
  }
  for (const storageKey of keysWithPrefix(prefix)) remove(storageKey);
  // The sensor's kept readings are named by run, not account: an account
  // change drops them all.
  void clearHeartRateSensorSessions();
}
