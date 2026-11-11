/**
 * Phone moving intervals plus an in-memory copy of Watch readings. The native
 * WatchRun coordinator is the durable raw-HR store, with iOS file protection;
 * WebView localStorage holds only interval timestamps. Raw readings never go
 * to Firestore or analytics. Callers clear both stores on save or discard.
 */
import {
  MAX_HEART_RATE_SAMPLE_AGE_MS,
  type ActiveRunInterval,
  type HeartRateSample,
} from "./hrZones";
import { getPendingWatchHeartRateSamples } from "./watchRunBridge";
import { keysWithPrefix, readJson, remove, writeJson } from "./localStore";

const PREFIX = "tropos:watch-heart-rate:v1:";
const MAX_SAMPLES = 12_000;
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
    sample.source !== "apple-watch"
  )
    return;
  const session = load(uid, sessionId);
  const storageKey = key(uid, sessionId);
  if (!storageKey) return;
  const buffer = sampleBuffers.get(storageKey) ?? [];
  if (sample.id && buffer.some((saved) => saved.id === sample.id)) return;
  buffer.push(sample);
  if (buffer.length > MAX_SAMPLES)
    buffer.splice(0, buffer.length - MAX_SAMPLES);
  sampleBuffers.set(storageKey, buffer);
  if (session.activeSince != null)
    session.lastObservedAt = Math.max(
      session.lastObservedAt ?? sample.at,
      sample.at
    );
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

/** Merge protected native backlog after a WebView restart or disconnect. */
export async function getRecoveredHeartRateSession(
  uid: string,
  sessionId: string
): Promise<HeartRateSessionSnapshot> {
  const local = getHeartRateSession(uid, sessionId);
  const pending = await getPendingWatchHeartRateSamples();
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
  return local;
}

export function clearHeartRateSession(uid: string, sessionId: string): void {
  const storageKey = key(uid, sessionId);
  if (storageKey) sampleBuffers.delete(storageKey);
  if (storageKey) remove(storageKey);
}

export function clearHeartRateSessionsForUser(uid: string): void {
  if (!uid) return;
  const prefix = `${PREFIX}${encodeURIComponent(uid)}:`;
  for (const storageKey of sampleBuffers.keys()) {
    if (storageKey.startsWith(prefix)) sampleBuffers.delete(storageKey);
  }
  for (const storageKey of keysWithPrefix(prefix)) remove(storageKey);
}
