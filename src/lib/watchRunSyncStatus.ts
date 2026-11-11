/**
 * The Watch's post-save state is separate from the phone's local queue. A
 * durable receipt lets a relaunch show "syncing" until the same canonical run
 * is confirmed on the server. A new run retires the previous Watch display.
 */
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "./firebase";
import { readJson, remove, scopedKey, writeJson } from "./localStore";
import {
  pendingDocumentWrites,
  subscribeSyncedRunWrites,
} from "./offlineQueue";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";
import { publishWatchRunSaveStatus } from "./watchRunBridge";
import { readStoredRunSummary } from "./runResumeStorage";
import type { DistanceUnit } from "./distanceUnits";

const KEY = "tropos:watch-run-sync:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Starting another run retires an older receipt even while a server read is
// still in flight. The persisted finished-run snapshot is checked again too.
const retiredEpochs = new Map<string, number>();

export interface WatchRunSyncReceipt {
  uid: string;
  runId: string;
  sessionId: string;
  revision: number;
  elapsedSeconds: number;
  distanceMeters: number;
  paceSecondsPerKm?: number | null;
  recordedAtMs: number;
  saveStatus: "queued" | "synced";
  /** The runner's unit, for the Watch's labels. Absent on a receipt
   *  restored after a crash, which the Watch shows in its last unit. */
  unit?: DistanceUnit;
}

function key(uid: string) {
  return scopedKey(KEY, uid);
}

function readReceipt(uid: string): WatchRunSyncReceipt | null {
  if (!uid) return null;
  const value = readJson<unknown>(key(uid), null);
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<WatchRunSyncReceipt>;
  if (
    receipt.uid !== uid ||
    typeof receipt.runId !== "string" ||
    !receipt.runId ||
    typeof receipt.sessionId !== "string" ||
    !receipt.sessionId ||
    receipt.runId !== receipt.sessionId ||
    !Number.isSafeInteger(receipt.revision) ||
    typeof receipt.elapsedSeconds !== "number" ||
    !Number.isFinite(receipt.elapsedSeconds) ||
    typeof receipt.distanceMeters !== "number" ||
    !Number.isFinite(receipt.distanceMeters) ||
    typeof receipt.recordedAtMs !== "number" ||
    !Number.isFinite(receipt.recordedAtMs) ||
    (receipt.saveStatus !== "queued" && receipt.saveStatus !== "synced")
  )
    return null;
  if (Date.now() - receipt.recordedAtMs > MAX_AGE_MS) {
    remove(key(uid));
    return null;
  }
  return receipt as WatchRunSyncReceipt;
}

const publishChains = new Map<string, Promise<void>>();
function publish(receipt: WatchRunSyncReceipt): void {
  const previous = publishChains.get(receipt.uid) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      if (auth.currentUser?.uid !== receipt.uid) return;
      const current = readReceipt(receipt.uid);
      if (
        !current ||
        current.runId !== receipt.runId ||
        current.revision > receipt.revision
      )
        return;
      await publishWatchRunSaveStatus({
        sessionId: receipt.sessionId,
        revision: receipt.revision,
        elapsedSeconds: receipt.elapsedSeconds,
        distanceMeters: receipt.distanceMeters,
        paceSecondsPerKm: receipt.paceSecondsPerKm,
        recordedAtMs: receipt.recordedAtMs,
        saveStatus: receipt.saveStatus,
        ...(receipt.unit === "km" || receipt.unit === "mi"
          ? { unit: receipt.unit }
          : {}),
      });
    });
  publishChains.set(receipt.uid, next);
  void next.finally(() => {
    if (publishChains.get(receipt.uid) === next)
      publishChains.delete(receipt.uid);
  });
}

/** Call only after the phone's durable run queue accepted the save. */
export function queueWatchRunSyncStatus(
  receipt: Omit<WatchRunSyncReceipt, "saveStatus">
): boolean {
  if (
    !CONNECTED_TRAINING_RELEASED ||
    !receipt.uid ||
    !receipt.runId ||
    receipt.runId !== receipt.sessionId ||
    auth.currentUser?.uid !== receipt.uid
  )
    return false;
  const previous = readReceipt(receipt.uid);
  if (previous?.runId === receipt.runId && previous.saveStatus === "synced")
    return true;
  const queued: WatchRunSyncReceipt = { ...receipt, saveStatus: "queued" };
  if (!writeJson(key(receipt.uid), queued)) return false;
  publish(queued);
  void reconcileWatchRunSyncStatus(receipt.uid);
  return true;
}

function markSynced(uid: string, runId: string): void {
  const receipt = readReceipt(uid);
  if (
    !receipt ||
    receipt.runId !== runId ||
    receipt.saveStatus === "synced" ||
    auth.currentUser?.uid !== uid
  )
    return;
  const synced: WatchRunSyncReceipt = {
    ...receipt,
    revision: receipt.revision + 1,
    saveStatus: "synced",
  };
  if (!writeJson(key(uid), synced)) return;
  publish(synced);
}

/** Save may be interrupted after its durable queue write and before its
 * separate Watch receipt write. The finished phone snapshot supplies the
 * Watch revision, but is never proof that Save happened by itself. */
function finishedWatchRun(uid: string) {
  const stored = readStoredRunSummary(uid);
  const identity = stored?.identity;
  const finish = stored?.finish;
  if (
    stored?.phase !== "finished" ||
    !identity ||
    identity.uid !== uid ||
    identity.runId !== identity.sessionId ||
    !finish?.watchCompanionUsed ||
    !Number.isSafeInteger(stored.watchRevision) ||
    (stored.watchRevision ?? -1) < 0 ||
    !Number.isFinite(finish.finishedAt) ||
    finish.finishedAt <= 0 ||
    finish.finishedAt > Date.now() + 60_000 ||
    Date.now() - finish.finishedAt > MAX_AGE_MS
  )
    return null;
  return {
    uid,
    runId: identity.runId,
    sessionId: identity.sessionId,
    revision: stored.watchRevision! + 1,
    recordedAtMs: finish.finishedAt,
  };
}

function savedMetrics(data: Record<string, unknown>, sessionId: string) {
  if (
    data.sessionId !== sessionId ||
    typeof data.duration !== "number" ||
    !Number.isFinite(data.duration) ||
    data.duration < 0 ||
    typeof data.distance !== "number" ||
    !Number.isFinite(data.distance) ||
    data.distance < 0
  )
    return null;
  return {
    elapsedSeconds: data.duration,
    distanceMeters: data.distance,
    paceSecondsPerKm:
      data.duration > 0 && data.distance > 0
        ? (data.duration / data.distance) * 1000
        : null,
  };
}

async function restoreMissingReceipt(uid: string): Promise<void> {
  const candidate = finishedWatchRun(uid);
  if (!candidate) return;
  const epoch = retiredEpochs.get(uid) ?? 0;
  const stillCurrent = () =>
    auth.currentUser?.uid === uid &&
    (retiredEpochs.get(uid) ?? 0) === epoch &&
    !readReceipt(uid) &&
    finishedWatchRun(uid)?.runId === candidate.runId;
  const queued = pendingDocumentWrites(uid, `users/${uid}/runs`).find(
    (entry) => entry.id === candidate.runId && !entry.merge
  );
  const queuedMetrics =
    queued && savedMetrics(queued.data, candidate.sessionId);
  if (queuedMetrics) {
    if (stillCurrent())
      queueWatchRunSyncStatus({ ...candidate, ...queuedMetrics });
    return;
  }
  // The queue may have drained before the crash. A server read is the only
  // other evidence that Save completed; Firestore's local cache is not.
  try {
    const snapshot = await getDocFromServer(
      doc(db, "users", uid, "runs", candidate.runId)
    );
    if (!snapshot.exists() || !stillCurrent()) return;
    const metrics = savedMetrics(snapshot.data(), candidate.sessionId);
    if (!metrics) return;
    if (queueWatchRunSyncStatus({ ...candidate, ...metrics }))
      markSynced(uid, candidate.runId);
  } catch {
    // Offline with no durable queue evidence: leave the Watch on review.
  }
}

/** Read the server, not the local Firestore cache, after app restart. */
export async function reconcileWatchRunSyncStatus(uid: string): Promise<void> {
  if (!CONNECTED_TRAINING_RELEASED || auth.currentUser?.uid !== uid) return;
  const receipt = readReceipt(uid);
  if (!receipt) {
    await restoreMissingReceipt(uid);
    return;
  }
  if (receipt.saveStatus === "synced") {
    publish(receipt);
    return;
  }
  // A crash may have happened after persisting the local receipt but before
  // the first native publish. Restore the safe queued state before checking
  // whether the server already has the canonical run.
  publish(receipt);
  try {
    const snapshot = await getDocFromServer(
      doc(db, "users", uid, "runs", receipt.runId)
    );
    if (auth.currentUser?.uid !== uid) return;
    if (snapshot.exists() && snapshot.data().sessionId === receipt.sessionId)
      markSynced(uid, receipt.runId);
  } catch {
    // Still local or temporarily offline: keep the Watch on syncing.
  }
}

/** Called on account sign-in; cleanup must run on sign-out or account change. */
export function startWatchRunSyncReconciler(uid: string): () => void {
  if (!CONNECTED_TRAINING_RELEASED || !uid) return () => {};
  let stopped = false;
  let appListener: PluginListenerHandle | null = null;
  const check = () => {
    if (!stopped) void reconcileWatchRunSyncStatus(uid);
  };
  const unsubscribe = subscribeSyncedRunWrites((event) => {
    if (!stopped && event.uid === uid) markSynced(uid, event.runId);
  });
  window.addEventListener("online", check);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) check();
  })
    .then((listener) => {
      if (stopped) void listener.remove();
      else appListener = listener;
    })
    .catch(() => {});
  check();
  return () => {
    stopped = true;
    unsubscribe();
    window.removeEventListener("online", check);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
    void appListener?.remove();
  };
}

/** Called when the phone starts another run; its display supersedes this one. */
export function clearWatchRunSyncStatus(uid: string): void {
  if (uid) {
    retiredEpochs.set(uid, (retiredEpochs.get(uid) ?? 0) + 1);
    remove(key(uid));
  }
}
