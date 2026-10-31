/**
 * Server receipt for an Apple Health write. The receipt is created before
 * calling HealthKit. If this phone is removed while HealthKit read access is
 * opaque, an old attempt can never be mistaken for proof that no workout was
 * saved. A deleted run leaves a server tombstone for the exporting phone.
 */
import {
  collection,
  doc,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type HealthWorkoutLedgerState =
  "attempted" | "exported" | "pending-delete";

export interface HealthWorkoutReservation {
  state: "fresh" | "existing" | "pending-delete" | "missing" | "no-consent";
  priorState?: HealthWorkoutLedgerState;
}

function currentUser(uid: string): boolean {
  return !!uid && auth.currentUser?.uid === uid;
}

function ledgerRef(uid: string, runId: string) {
  return doc(db, "users", uid, "healthWorkoutExports", runId);
}

function millis(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { toMillis?: () => number };
  const at = candidate.toMillis?.();
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/** Atomically reserve one native attempt while the run and consent exist. */
export async function reserveHealthWorkoutExport(
  uid: string,
  runId: string,
  options: {
    revision: string;
    purpose: "new" | "correction";
    preparedAtMs?: number;
    consentId?: string;
  }
): Promise<HealthWorkoutReservation> {
  if (!currentUser(uid) || !runId) throw new Error("Account changed");
  const result = await runTransaction(db, async (tx) => {
    const run = await tx.get(doc(db, "users", uid, "runs", runId));
    const prefs = await tx.get(
      doc(db, "users", uid, "settings", "connectedTraining")
    );
    const ref = ledgerRef(uid, runId);
    const receipt = await tx.get(ref);
    if (!run.exists()) return { state: "missing" as const };
    if (
      !prefs.exists() ||
      prefs.data().saveWorkoutsToHealth !== true ||
      (options.purpose === "new" &&
        (options.consentId
          ? options.consentId !== prefs.data().workoutExportConsentId
          : options.preparedAtMs == null ||
            millis(prefs.data().workoutExportEnabledAt) == null ||
            millis(prefs.data().workoutExportEnabledAt)! >
              options.preparedAtMs))
    )
      return { state: "no-consent" as const };
    if (receipt.exists()) {
      const state = receipt.data().state as HealthWorkoutLedgerState;
      if (state === "pending-delete")
        return { state: "pending-delete" as const };
      if (state !== "attempted" && state !== "exported")
        throw new Error("Invalid Apple Health receipt");
      return { state: "existing" as const, priorState: state };
    }
    tx.set(ref, {
      runId,
      state: "attempted",
      revision: options.revision,
      workoutId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { state: "fresh" as const };
  });
  if (!currentUser(uid)) throw new Error("Account changed");
  return result;
}

/** Never overwrite a deletion tombstone after a late HealthKit callback. */
export async function confirmHealthWorkoutExport(
  uid: string,
  runId: string,
  revision: string,
  workoutId: string
): Promise<"exported" | "pending-delete"> {
  if (!currentUser(uid)) throw new Error("Account changed");
  const result = await runTransaction(db, async (tx) => {
    const run = await tx.get(doc(db, "users", uid, "runs", runId));
    const ref = ledgerRef(uid, runId);
    const receipt = await tx.get(ref);
    if (!receipt.exists()) throw new Error("Missing Apple Health receipt");
    if (!run.exists() || receipt.data().state === "pending-delete") {
      tx.update(ref, { state: "pending-delete", updatedAt: serverTimestamp() });
      return "pending-delete" as const;
    }
    tx.update(ref, {
      state: "exported",
      revision,
      workoutId,
      updatedAt: serverTimestamp(),
    });
    return "exported" as const;
  });
  if (!currentUser(uid)) throw new Error("Account changed");
  return result;
}

/** Mark a deleted run's receipt before native cleanup. No receipt is legacy. */
export async function markHealthWorkoutDeletion(
  uid: string,
  runId: string
): Promise<boolean> {
  if (!currentUser(uid)) throw new Error("Account changed");
  return runTransaction(db, async (tx) => {
    const run = await tx.get(doc(db, "users", uid, "runs", runId));
    const ref = ledgerRef(uid, runId);
    const receipt = await tx.get(ref);
    if (run.exists()) throw new Error("Run deletion is not confirmed");
    if (!receipt.exists()) return false;
    if (receipt.data().state !== "pending-delete")
      tx.update(ref, { state: "pending-delete", updatedAt: serverTimestamp() });
    return true;
  });
}

/** A local native-deleted receipt is required before clearing this marker. */
export async function confirmHealthWorkoutDeletion(
  uid: string,
  runId: string
): Promise<void> {
  if (!currentUser(uid)) throw new Error("Account changed");
  await runTransaction(db, async (tx) => {
    const run = await tx.get(doc(db, "users", uid, "runs", runId));
    const ref = ledgerRef(uid, runId);
    const receipt = await tx.get(ref);
    if (run.exists()) throw new Error("Run deletion is not confirmed");
    if (receipt.exists()) tx.delete(ref);
  });
}

/** Read one bounded page. The caller advances the cursor on each retry. */
export async function readHealthWorkoutDeletionPage(
  uid: string,
  afterRunId: string | null,
  pageSize = 50
): Promise<{ runIds: string[]; lastRunId: string | null }> {
  if (!currentUser(uid)) throw new Error("Account changed");
  const ref = collection(db, "users", uid, "healthWorkoutExports");
  const snapshot = await getDocsFromServer(
    query(
      ref,
      where("state", "==", "pending-delete"),
      orderBy(documentId()),
      ...(afterRunId ? [startAfter(afterRunId)] : []),
      limit(pageSize)
    )
  );
  if (!currentUser(uid)) throw new Error("Account changed");
  const runIds = snapshot.docs.map((item) => item.id);
  return { runIds, lastRunId: runIds.at(-1) ?? null };
}
