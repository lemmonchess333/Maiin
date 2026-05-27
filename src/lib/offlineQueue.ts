import { collection, addDoc, doc, setDoc, Firestore } from "firebase/firestore";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";

/**
 * Offline write queue — partitioned by uid so a write queued by user
 * A can never flush under user B's session.
 *
 * Pre-uid-scoping, `flushQueue` ran indiscriminately on `online`
 * events for whichever auth user was current. Items queued by user
 * A pre-sign-out would either hit `permission-denied` under user B
 * (then retry-loop forever) or — worse — succeed silently if the
 * queued path happened to be user-agnostic.
 *
 * Each queued item now carries the originating uid. `flushQueue`
 * takes the current uid and only flushes matching items, leaving
 * any other-user items in place for the next time that user signs
 * back in.
 */

interface QueuedWrite {
  id: string;
  uid: string;
  collectionPath: string;
  docId?: string;
  merge?: boolean;
  data: Record<string, unknown>;
  timestamp: number;
}

const QUEUE_KEY = "tropos_offline_queue";

function getQueue(): QueuedWrite[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Drop legacy items that pre-date uid scoping. They were written
    // by a previous build and we have no safe way to attribute them
    // to a uid retroactively — better to drop than to flush under
    // the wrong session.
    return parsed.filter(
      (item): item is QueuedWrite =>
        item != null &&
        typeof item === "object" &&
        typeof (item as { uid?: unknown }).uid === "string"
    );
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      // Drop oldest half and retry
      const trimmed = queue.slice(Math.floor(queue.length / 2));
      logger.warn(
        `[OfflineQueue] Quota exceeded, dropping ${queue.length - trimmed.length} oldest items`
      );
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
      } catch {
        // Last resort: clear the queue entirely
        captureError(
          new Error("OfflineQueue: quota exceeded, queue cleared entirely"),
          "network"
        );
        localStorage.removeItem(QUEUE_KEY);
      }
    }
  }
}

export function queueWrite(
  uid: string,
  collectionPath: string,
  data: Record<string, unknown>,
  docId?: string,
  merge?: boolean
) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    uid,
    collectionPath,
    docId,
    merge,
    data,
    timestamp: Date.now(),
  });
  saveQueue(queue);
}

export function getQueueLength(uid?: string): number {
  const queue = getQueue();
  return uid ? queue.filter((q) => q.uid === uid).length : queue.length;
}

/**
 * Flush queued writes for `uid`. Items belonging to other uids are
 * left in the queue for the next time that user signs back in.
 * Returns the count successfully flushed.
 */
export async function flushQueue(db: Firestore, uid: string): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedWrite[] = [];

  for (const item of queue) {
    if (item.uid !== uid) {
      // Not our user's item — preserve in queue for later.
      remaining.push(item);
      continue;
    }
    try {
      const payload = { ...item.data, _offlineCreatedAt: item.timestamp };
      if (item.docId) {
        const docRef = doc(db, item.collectionPath, item.docId);
        await setDoc(docRef, payload, item.merge ? { merge: true } : {});
      } else {
        await addDoc(collection(db, item.collectionPath), payload);
      }
      flushed++;
    } catch (e) {
      captureError(
        e instanceof Error ? e : new Error("OfflineQueue flush failed"),
        "network",
        { collectionPath: item.collectionPath, docId: item.docId }
      );
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  return flushed;
}

export async function safeSave(
  db: Firestore,
  uid: string,
  collectionPath: string,
  data: Record<string, unknown>
): Promise<void> {
  if (navigator.onLine) {
    try {
      await addDoc(collection(db, collectionPath), data);
      return;
    } catch (e) {
      logger.error("[OfflineQueue] safeSave failed, queuing offline", e);
    }
  }
  queueWrite(uid, collectionPath, data);
}

export async function safeMerge(
  db: Firestore,
  uid: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, collectionPath, docId), data, { merge: true });
      return;
    } catch (e) {
      logger.error("[OfflineQueue] safeMerge failed, queuing offline", e);
    }
  }
  queueWrite(uid, collectionPath, data, docId, true);
}

// Module-load `online` auto-flush removed — `AppRoutes` in App.tsx
// runs `flushQueue(db, user.uid)` whenever the auth user changes
// AND on the `online` event, with the proper uid in scope. Keeping
// the module-level listener as well would race the AppRoutes effect
// and (worse) flush with no uid — defeating the partitioning above.
