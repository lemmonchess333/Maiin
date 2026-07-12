import { collection, addDoc, doc, setDoc, Firestore } from "firebase/firestore";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";
import { stripUndefined } from "@/lib/firestoreGuards";

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
      // CORE-01: quota exceeded. Drop the OLDEST item only and retry,
      // shedding one at a time until it fits — the previous code lopped
      // off the whole oldest HALF in one go and, on a second failure,
      // cleared the queue ENTIRELY (silent bulk data loss). Every drop
      // is reported so an exhausted/blocked sync is diagnosable rather
      // than vanishing. Newest writes are kept (most likely still
      // relevant); a dropped queued create can't duplicate because the
      // creates are now idempotent by stable id (see queueWrite).
      const working = [...queue];
      while (working.length > 0) {
        const dropped = working.shift();
        captureError(
          new Error("OfflineQueue: quota exceeded, dropped one queued write"),
          "network",
          {
            collectionPath: dropped?.collectionPath,
            docId: dropped?.docId,
            remaining: working.length,
          }
        );
        try {
          localStorage.setItem(QUEUE_KEY, JSON.stringify(working));
          return;
        } catch {
          // still too big — shed the next-oldest and retry
        }
      }
      // Nothing fit even when empty — remove the key so a corrupt giant
      // value can't wedge every future write.
      try {
        localStorage.removeItem(QUEUE_KEY);
      } catch {
        /* best-effort */
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
  // Strip undefined up front so the SAME clean payload is used whether
  // the write goes online now or is queued for later. Without this an
  // optional-field payload threw "Unsupported field value: undefined"
  // online, fell into the catch, queued, then threw again on every
  // flush — stuck in the queue forever.
  const clean = stripUndefined(data);
  // CORE-01: mint a stable document id CLIENT-side and setDoc it, rather
  // than addDoc (which asks the server for a fresh random id on every
  // attempt). An ambiguous online failure — request sent, response
  // lost — then queues the SAME id; the flush re-sets that id, so the
  // retry is idempotent instead of creating a duplicate record. The id
  // rides through the queue as `docId`, so an online-then-queued round
  // trip reuses one identity end to end.
  const docId = doc(collection(db, collectionPath)).id;
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, collectionPath, docId), clean);
      return;
    } catch (e) {
      logger.error("[OfflineQueue] safeSave failed, queuing offline", e);
    }
  }
  queueWrite(uid, collectionPath, clean, docId);
}

export async function safeMerge(
  db: Firestore,
  uid: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  const clean = stripUndefined(data);
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, collectionPath, docId), clean, { merge: true });
      return;
    } catch (e) {
      logger.error("[OfflineQueue] safeMerge failed, queuing offline", e);
    }
  }
  queueWrite(uid, collectionPath, clean, docId, true);
}

// Module-load `online` auto-flush removed — `AppRoutes` in App.tsx
// runs `flushQueue(db, user.uid)` whenever the auth user changes
// AND on the `online` event, with the proper uid in scope. Keeping
// the module-level listener as well would race the AppRoutes effect
// and (worse) flush with no uid — defeating the partitioning above.
