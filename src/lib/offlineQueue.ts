import { collection, addDoc, doc, setDoc, Firestore } from "firebase/firestore";
import { logger } from "@/lib/logger";
import { isAvailable, readJson, remove, writeJson } from "@/lib/localStore";
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
  const parsed = readJson<unknown>(QUEUE_KEY, null);
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
}

function saveQueue(queue: QueuedWrite[]) {
  if (writeJson(QUEUE_KEY, queue)) return;
  // A refused write with no storage at all is not a full store: there is
  // nothing to shed into, and every shed would be reported as a drop.
  if (!isAvailable()) return;
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
    // Still too big — shed the next-oldest and retry.
    if (writeJson(QUEUE_KEY, working)) return;
  }
  // Nothing fit even when empty — remove the key so a corrupt giant
  // value can't wedge every future write.
  remove(QUEUE_KEY);
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
 * Serialises flushes. `AppRoutes` calls `flushQueue` on BOTH the auth-user
 * change and the `online` event, and signing in while already online fires
 * the two within a tick of each other — so two flushes overlapping is the
 * ordinary case, not a corner one. Overlapped, they each replay the same
 * items (a wasted duplicate round trip, idempotent only because every
 * current caller mints a docId) and each finish by rewriting the queue.
 *
 * Chained, the second waits, re-reads, and finds the first's work already
 * retired. A rejected flush must not break the chain for every later one,
 * so both arms continue it.
 */
let flushChain: Promise<unknown> = Promise.resolve();

/**
 * Flush queued writes for `uid`. Items belonging to other uids are
 * left in the queue for the next time that user signs back in.
 * Returns the count successfully flushed.
 */
export function flushQueue(db: Firestore, uid: string): Promise<number> {
  const run = () => flushQueueOnce(db, uid);
  const result = flushChain.then(run, run);
  // Swallow only for the CHAIN's copy — the returned promise still
  // rejects for the caller.
  flushChain = result.catch(() => {});
  return result;
}

async function flushQueueOnce(db: Firestore, uid: string): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const landed = new Set<string>();

  for (const item of queue) {
    // Not our user's item — leave it for the next time that user signs in.
    if (item.uid !== uid) continue;
    try {
      const payload = { ...item.data, _offlineCreatedAt: item.timestamp };
      if (item.docId) {
        const docRef = doc(db, item.collectionPath, item.docId);
        await setDoc(docRef, payload, item.merge ? { merge: true } : {});
      } else {
        await addDoc(collection(db, item.collectionPath), payload);
      }
      landed.add(item.id);
      flushed++;
    } catch (e) {
      captureError(
        e instanceof Error ? e : new Error("OfflineQueue flush failed"),
        "network",
        { collectionPath: item.collectionPath, docId: item.docId }
      );
    }
  }

  // Re-read and SUBTRACT, rather than writing back the snapshot taken
  // before the loop.
  //
  // Every iteration above awaits a network round trip, and `queueWrite`
  // runs synchronously against localStorage — so a write queued while a
  // flush is in flight is already persisted by the time the loop ends.
  // Writing back a list derived from the pre-loop snapshot deleted it,
  // silently and permanently: the user came back online, opened the app,
  // logged a meal during the flush, and the meal was gone. The window is
  // as long as the queue takes to drain, which on a slow reconnect is
  // exactly when the user is most likely to be logging.
  //
  // Subtracting the ids that landed is right for the same reason it is
  // safe: items that FAILED, items belonging to another uid, and items
  // queued mid-flush were all never removed to begin with, so they need
  // no explicit preservation and cannot be resurrected by a stale copy.
  if (landed.size > 0) {
    saveQueue(getQueue().filter((item) => !landed.has(item.id)));
  }
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
