/**
 * Durable intent for opt-in Apple Health workout export. A local run receipt is
 * not server confirmation: every export re-reads the canonical run from the
 * server and the current consent before touching HealthKit. The native writer
 * owns the final idempotent runId/revision lookup in HealthKit.
 */
import { App } from "@capacitor/app";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  getNativeWorkoutCleanupPlugin,
  isWorkoutWriteAvailable,
} from "./healthKit";
import {
  pendingDocumentWrites,
  subscribeSyncedRunWrites,
} from "./offlineQueue";
import { readStoredRun } from "./runResumeStorage";
import { isNativePlatform } from "./platform";
import { requiresManualDistance } from "./runGuards";
import {
  isWorkoutExportLocallyDisabled,
  readWorkoutExportLocalConsent,
} from "./connectedTrainingPrefs";
import { CONNECTED_TRAINING_RELEASED } from "./connectedTrainingRelease";
import { readJson, readString, writeString } from "./localStore";
import {
  confirmHealthWorkoutDeletion,
  confirmHealthWorkoutExport,
  markHealthWorkoutDeletion,
  readHealthWorkoutDeletionPage,
  reserveHealthWorkoutExport,
} from "./healthWorkoutLedger";

const STORAGE_PREFIX = "tropos:health-workout-export:v1:";
const MAX_RECORDS = 2_000;
const ORPHAN_GRACE_MS = 5 * 60 * 1000;

type ExportState =
  "pending" | "exported" | "pending-delete" | "native-deleted" | "blocked";
interface ExportRecord {
  runId: string;
  state: ExportState;
  purpose?: "new" | "correction";
  preparedAtMs?: number;
  consentId?: string;
  revision?: string;
  updatedAt: number;
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(uid)}`;
}

function readRecords(uid: string): ExportRecord[] {
  if (!uid) return [];
  const parsed = readJson<unknown>(storageKey(uid), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (record): record is ExportRecord =>
      record &&
      typeof record.runId === "string" &&
      record.runId.length > 0 &&
      [
        "pending",
        "exported",
        "pending-delete",
        "native-deleted",
        "blocked",
      ].includes(record.state)
  );
}

function writeRecords(uid: string, records: ExportRecord[]): boolean {
  if (!uid) return false;
  try {
    const retained = [...records];
    while (retained.length > MAX_RECORDS) {
      const oldestCompleted = retained.findIndex(
        (record) => record.state === "exported"
      );
      // Never evict an unfinished write or deletion to make room for a new one.
      if (oldestCompleted < 0) return false;
      retained.splice(oldestCompleted, 1);
    }
    const encoded = JSON.stringify(retained);
    return (
      writeString(storageKey(uid), encoded) &&
      readString(storageKey(uid)) === encoded
    );
  } catch {
    // Never start an export without a durable retry/correction record.
    return false;
  }
}

function updateRecord(
  uid: string,
  runId: string,
  update: (prior: ExportRecord | undefined) => ExportRecord | null
): boolean {
  const records = readRecords(uid).filter((record) => record.runId !== runId);
  const prior = readRecords(uid).find((record) => record.runId === runId);
  const next = update(prior);
  if (next) records.push(next);
  return writeRecords(uid, records);
}

function isCurrentUser(uid: string): boolean {
  return !!uid && auth.currentUser?.uid === uid;
}

/** Stage before the canonical run enters the durable queue. A provisional
 * intent covers a Save while Settings is still loading. Every new export
 * requires server proof that opt-in predated that Save. */
export function queueHealthWorkoutExport(
  uid: string,
  runId: string,
  optedIn: boolean,
  options: { provisional?: boolean; preparedAtMs?: number } = {}
): boolean {
  if (!CONNECTED_TRAINING_RELEASED || !isNativePlatform()) return true;
  if (!isCurrentUser(uid) || !runId) return false;
  if (isWorkoutExportLocallyDisabled(uid)) return true;
  if (!optedIn && !options.provisional) return true;
  const preparedAtMs = options.preparedAtMs ?? Date.now();
  if (!Number.isFinite(preparedAtMs) || preparedAtMs <= 0) return false;
  const localConsent = readWorkoutExportLocalConsent(uid);
  const durable = updateRecord(uid, runId, (prior) => ({
    ...(prior?.state === "pending-delete" ||
    prior?.state === "native-deleted" ||
    prior?.state === "exported"
      ? prior
      : {
          runId,
          state: "pending" as const,
          purpose: "new" as const,
          preparedAtMs,
          ...(localConsent && localConsent.enabledAtMs <= preparedAtMs
            ? { consentId: localConsent.id }
            : {}),
          revision: prior?.revision,
          updatedAt: Date.now(),
        }),
  }));
  if (durable) void reconcilePendingHealthExports(uid);
  return durable;
}

/** Queue an app-owned HealthKit deletion after the Tropos run is deleted. */
export function queueHealthWorkoutDeletion(
  uid: string,
  runId: string
): boolean {
  if (!isNativePlatform()) return true;
  if (!isCurrentUser(uid) || !runId) return false;
  const durable = updateRecord(uid, runId, (prior) =>
    prior?.state === "native-deleted"
      ? prior
      : {
          ...prior,
          runId,
          state: "pending-delete",
          updatedAt: Date.now(),
        }
  );
  if (durable) void reconcilePendingHealthExports(uid);
  return durable;
}

export function pendingHealthWorkoutExports(
  uid: string
): Array<{ runId: string; status: "pending" | "pending-delete" | "blocked" }> {
  return readRecords(uid)
    .filter(
      (record) =>
        record.state !== "exported" &&
        (CONNECTED_TRAINING_RELEASED ||
          record.state === "pending-delete" ||
          record.state === "native-deleted")
    )
    .map((record) => ({
      runId: record.runId,
      status:
        record.state === "native-deleted"
          ? ("pending-delete" as const)
          : (record.state as "pending" | "pending-delete" | "blocked"),
    }));
}

function millis(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { toMillis?: () => number };
  if (typeof candidate.toMillis !== "function") return null;
  const at = candidate.toMillis();
  return Number.isFinite(at) ? at : null;
}

function workoutFromRun(data: Record<string, unknown>) {
  // The run identity is allocated before GPS acquisition/countdown. Only the
  // actual recording start can mark the beginning of a Health workout.
  const startMs = millis(data.recordingStartedAt);
  const endMs = millis(data.recordingEndedAt);
  const durationSeconds = data.duration;
  const distanceMeters = data.distance;
  if (
    startMs == null ||
    endMs == null ||
    endMs <= startMs ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 604_800 ||
    // The phone timer excludes pauses. Allow only rounding jitter beyond
    // wall time; a corrupt duration must never reach HealthKit.
    durationSeconds > (endMs - startMs) / 1000 + 2 ||
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    data.isInvalid === true ||
    requiresManualDistance({
      place: typeof data.place === "string" ? data.place : null,
      activityType:
        typeof data.activityType === "string" ? data.activityType : null,
    })
  )
    return null;
  const energyKcal =
    typeof data.calories === "number" &&
    Number.isFinite(data.calories) &&
    data.calories >= 0
      ? data.calories
      : undefined;
  // Stable across clients and retries; native also compares the payload.
  const revision = JSON.stringify([
    startMs,
    endMs,
    durationSeconds,
    distanceMeters,
    energyKcal ?? null,
  ]);
  return {
    revision,
    startMs,
    endMs,
    durationSeconds,
    distanceMeters,
    energyKcal,
  };
}

const inFlight = new Map<string, Promise<void>>();
const rerunRequested = new Set<string>();
const remoteDeleteCursor = new Map<string, string>();

/** One bounded server page per pass; later foregrounds rotate through all
 * tombstones even when a revoked Health grant blocks the first page. */
async function stageRemoteDeletions(uid: string): Promise<void> {
  try {
    const page = await readHealthWorkoutDeletionPage(
      uid,
      remoteDeleteCursor.get(uid) ?? null
    );
    if (!isCurrentUser(uid)) return;
    if (page.runIds.length < 50) remoteDeleteCursor.delete(uid);
    else if (page.lastRunId) remoteDeleteCursor.set(uid, page.lastRunId);
    for (const runId of page.runIds) {
      if (
        readRecords(uid).some(
          (record) =>
            record.runId === runId &&
            (record.state === "pending-delete" ||
              record.state === "native-deleted")
        )
      )
        continue;
      // Stage this page without requesting another pass immediately. That
      // keeps one foreground/sync event to one bounded server page.
      updateRecord(uid, runId, (prior) => ({
        ...prior,
        runId,
        state: "pending-delete",
        updatedAt: Date.now(),
      }));
    }
  } catch {
    // A failed server page does not block already-staged local cleanup.
  }
}

/** Retry persisted intents after server sync, online, foreground or Settings. */
export function reconcilePendingHealthExports(uid: string): Promise<void> {
  if (!isNativePlatform() || !isCurrentUser(uid)) return Promise.resolve();
  const current = inFlight.get(uid);
  if (current) {
    // A new intent may arrive after reconcile() snapshots the queue. Return
    // the same promise, but include another pass before it resolves.
    rerunRequested.add(uid);
    return current;
  }
  const task = (async () => {
    do {
      rerunRequested.delete(uid);
      await reconcile(uid);
    } while (rerunRequested.has(uid) && isCurrentUser(uid));
  })().finally(() => {
    // A caller can arrive after the loop's last condition but before this
    // microtask. Preserve its request as a fresh pass rather than dropping it.
    const rerun = rerunRequested.delete(uid);
    if (inFlight.get(uid) === task) inFlight.delete(uid);
    if (rerun && isCurrentUser(uid)) void reconcilePendingHealthExports(uid);
  });
  inFlight.set(uid, task);
  return task;
}

async function reconcile(uid: string): Promise<void> {
  await stageRemoteDeletions(uid);
  const records = readRecords(uid).filter(
    (record) =>
      record.state === "pending-delete" ||
      record.state === "native-deleted" ||
      (CONNECTED_TRAINING_RELEASED && record.state !== "exported")
  );
  if (!records.length || !isCurrentUser(uid)) return;
  const plugin = await getNativeWorkoutCleanupPlugin();
  if (!plugin) return;

  // A server read is required. Firestore's ordinary getDoc can return a local
  // cache while offline and would let an unconfirmed preference authorize a
  // HealthKit write.
  let consentRead = false;
  let consent = false;
  let enabledAtMs: number | null = null;
  let serverConsentId: string | null = null;
  const canWriteNewWorkout =
    CONNECTED_TRAINING_RELEASED && (await isWorkoutWriteAvailable());
  if (
    canWriteNewWorkout &&
    records.some((record) => record.state !== "pending-delete")
  ) {
    try {
      const snapshot = await getDocFromServer(
        doc(db, "users", uid, "settings", "connectedTraining")
      );
      consentRead = true;
      consent =
        snapshot.exists() && snapshot.data().saveWorkoutsToHealth === true;
      enabledAtMs = snapshot.exists()
        ? millis(snapshot.data().workoutExportEnabledAt)
        : null;
      serverConsentId =
        snapshot.exists() &&
        typeof snapshot.data().workoutExportConsentId === "string"
          ? snapshot.data().workoutExportConsentId
          : null;
    } catch {
      // A failed consent read does not block cleanup of an old workout.
    }
  }
  if (!isCurrentUser(uid)) return;

  for (const record of records) {
    if (!isCurrentUser(uid)) return;
    const current = readRecords(uid).find(
      (item) => item.runId === record.runId
    );
    if (!current || current.state === "exported") continue;
    if (
      current.state === "pending-delete" ||
      current.state === "native-deleted"
    ) {
      try {
        // A deleted or revoked Tropos run must disappear from Health, even if
        // the user has since turned off future workout exports.
        const serverRun = await getDocFromServer(
          doc(db, "users", uid, "runs", record.runId)
        );
        if (!isCurrentUser(uid) || serverRun.exists()) continue;
        const hasLedger = await markHealthWorkoutDeletion(uid, record.runId);
        if (!isCurrentUser(uid)) return;
        if (current.state !== "native-deleted") {
          const result = await plugin.deleteWorkout({ runId: record.runId });
          // HealthKit read permission is opaque. With a server receipt, an
          // empty query after reinstall is not proof the sample is gone.
          if (hasLedger && result.status !== "deleted")
            throw new Error("Apple Health deletion cannot be verified");
          if (hasLedger)
            updateRecord(uid, record.runId, (prior) =>
              prior?.state === "pending-delete"
                ? { ...prior, state: "native-deleted", updatedAt: Date.now() }
                : (prior ?? null)
            );
        }
        if (hasLedger) await confirmHealthWorkoutDeletion(uid, record.runId);
        updateRecord(uid, record.runId, () => null);
      } catch {
        updateRecord(uid, record.runId, (prior) =>
          prior?.state === "pending-delete" || prior?.state === "native-deleted"
            ? { ...prior, updatedAt: Date.now() }
            : (prior ?? null)
        );
      }
      continue;
    }
    if (!canWriteNewWorkout || !consentRead) continue;
    if (
      current.purpose !== "correction" &&
      (current.consentId
        ? current.consentId !== serverConsentId
        : enabledAtMs == null ||
          current.preparedAtMs == null ||
          enabledAtMs > current.preparedAtMs)
    ) {
      // Same-device offline opt-in can sync after Save when its consent ID
      // still matches. A later off/on cycle changes that ID. An unknown
      // choice needs an earlier server timestamp, or fails closed.
      updateRecord(uid, record.runId, () => null);
      continue;
    }
    if (!consent || isWorkoutExportLocallyDisabled(uid)) {
      // Turning export off cancels an unfinished export intent. It does not
      // silently delete a workout that was already exported earlier.
      updateRecord(uid, record.runId, () => null);
      continue;
    }
    try {
      const serverRun = await getDocFromServer(
        doc(db, "users", uid, "runs", record.runId)
      );
      if (!isCurrentUser(uid)) return;
      if (!serverRun.exists()) {
        // A Save may still be in progress, or its durable run may be offline.
        // Once neither the queue nor a finished review can produce that run,
        // retire the intent from a failed/discarded Save after a grace period.
        if (
          current.preparedAtMs != null &&
          Date.now() - current.preparedAtMs > ORPHAN_GRACE_MS &&
          !pendingDocumentWrites(uid, `users/${uid}/runs`).some(
            (entry) => entry.id === record.runId
          )
        ) {
          const review = readStoredRun(uid);
          if (
            review?.phase !== "finished" ||
            review.identity?.runId !== record.runId
          )
            updateRecord(uid, record.runId, () => null);
        }
        continue;
      }
      const workout = workoutFromRun(serverRun.data());
      if (!workout) {
        updateRecord(uid, record.runId, () => null);
        continue;
      }
      const status = await plugin.getWorkoutExportStatus({
        runId: record.runId,
      });
      if (!isCurrentUser(uid)) return;
      if (status.status === "unverified") {
        throw new Error("Apple Health workout identity cannot be verified");
      }
      const reservation = await reserveHealthWorkoutExport(uid, record.runId, {
        revision: workout.revision,
        purpose: current.purpose ?? "new",
        preparedAtMs: current.preparedAtMs,
        consentId: current.consentId,
      });
      if (
        reservation.state === "missing" ||
        reservation.state === "no-consent"
      ) {
        updateRecord(uid, record.runId, () => null);
        continue;
      }
      if (reservation.state === "pending-delete") {
        queueHealthWorkoutDeletion(uid, record.runId);
        continue;
      }
      if (status.status === "absent" && reservation.state !== "fresh")
        throw new Error("Prior Apple Health export cannot be verified");
      if (status.status === "absent" && current.purpose === "correction")
        throw new Error("Prior Apple Health workout cannot be found");
      let workoutId = status.workoutId;
      if (status.status !== "present" || status.revision !== workout.revision) {
        if (!isCurrentUser(uid) || isWorkoutExportLocallyDisabled(uid)) return;
        const exported = await plugin.exportWorkout({
          runId: record.runId,
          ...workout,
        });
        if (exported.revision !== workout.revision)
          throw new Error("Apple Health did not confirm this run revision");
        workoutId = exported.workoutId;
      }
      if (!isCurrentUser(uid) || !workoutId) return;
      const confirmed = await confirmHealthWorkoutExport(
        uid,
        record.runId,
        workout.revision,
        workoutId
      );
      if (confirmed === "pending-delete") {
        queueHealthWorkoutDeletion(uid, record.runId);
        continue;
      }
      updateRecord(uid, record.runId, (prior) =>
        prior?.state === "pending-delete"
          ? prior
          : {
              runId: record.runId,
              state: "exported",
              revision: workout.revision,
              updatedAt: Date.now(),
            }
      );
    } catch {
      updateRecord(uid, record.runId, (prior) =>
        prior?.state === "pending-delete"
          ? prior
          : prior
            ? { ...prior, state: "blocked", updatedAt: Date.now() }
            : null
      );
    }
  }
}

/** Install per-account retry triggers; call its cleanup on sign-out. */
export function startHealthExportReconciler(uid: string): () => void {
  if (!isNativePlatform() || !uid) return () => {};
  let disposed = false;
  let removeAppListener: (() => void) | null = null;
  const retry = () => {
    if (!disposed) void reconcilePendingHealthExports(uid);
  };
  const unsubscribeSynced = subscribeSyncedRunWrites((receipt) => {
    if (receipt.uid === uid) retry();
  });
  window.addEventListener("online", retry);
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) retry();
  })
    .then((listener) => {
      if (disposed) void listener.remove();
      else removeAppListener = () => void listener.remove();
    })
    .catch(() => {});
  retry();
  return () => {
    disposed = true;
    remoteDeleteCursor.delete(uid);
    unsubscribeSynced();
    window.removeEventListener("online", retry);
    removeAppListener?.();
  };
}
