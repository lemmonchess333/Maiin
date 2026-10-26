import {
  collection,
  addDoc,
  doc,
  setDoc,
  Firestore,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { logger } from "@/lib/logger";
import { isAvailable, readJson, remove, writeJson } from "@/lib/localStore";
import { captureError } from "@/lib/errorReporting";
import { stripUndefined } from "@/lib/firestoreGuards";
import {
  commitWorkoutCompletion,
  type ProgrammeCompletionContext,
} from "./workoutCompletion";
export {
  workoutCompletionDayIdentity,
  type ProgrammeCompletionContext,
} from "./workoutCompletion";

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
  durable?: boolean;
  /** New best-effort entries use the same Timestamp codec as durable ones. */
  encoded?: boolean;
  workoutCompletion?: { programme?: ProgrammeCompletionContext };
  failed?: boolean;
  /** The last failure was one no retry can change (`refusedForGood`), so
   *  the person may discard it. */
  refused?: boolean;
}

const queueListeners = new Set<() => void>();
let queueVersion = 0;
export const subscribeQueuedWrites = (listener: () => void) => {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
};
export const queuedWritesVersion = () => queueVersion;
function notifyQueue() {
  queueVersion++;
  queueListeners.forEach((listener) => listener());
}
// Encode SDK timestamps explicitly; JSON alone loses their type. Other class
// instances retain JSON's own serialization (for example Date.toJSON).
function encode(value: unknown): unknown {
  if (value instanceof Timestamp)
    return { __queuedTimestamp: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (
    value &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, encode(child)])
    );
  return value;
}
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const stamp = (value as { __queuedTimestamp?: number[] }).__queuedTimestamp;
    if (stamp?.length === 2) return new Timestamp(stamp[0], stamp[1]);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, decode(child)])
    );
  }
  return value;
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
  if (writeJson(QUEUE_KEY, queue)) {
    notifyQueue();
    return;
  }
  // Never evict an accepted durable meal to make space for another write.
  if (queue.some((item) => item.durable))
    throw new Error(
      "Couldn't save on this phone. Free device storage and retry."
    );
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
    data: encode(data) as Record<string, unknown>,
    encoded: true,
    timestamp: Date.now(),
  });
  saveQueue(queue);
}

/** Accept locally before attempting sync. The caller can close immediately,
 * including when the browser says online but the server is unreachable. */
export function queueDurableWrite(
  uid: string,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
  merge = false
) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    uid,
    collectionPath,
    docId,
    merge,
    data: encode(stripUndefined(data)) as Record<string, unknown>,
    timestamp: Date.now(),
    durable: true,
  });
  // Strict persistence: no quota shedding and no success on unavailable storage.
  if (!writeJson(QUEUE_KEY, queue))
    throw new Error(
      "Couldn't save on this phone. Free device storage and retry."
    );
  notifyQueue();
}

export function pendingDocumentWrites(uid: string, collectionPath: string) {
  return getQueue()
    .filter(
      (item) =>
        item.uid === uid &&
        item.collectionPath === collectionPath &&
        item.durable
    )
    .map((item) => ({
      id: item.docId!,
      merge: item.merge,
      data: decode(item.data) as Record<string, unknown>,
    }));
}

export function hasQueuedWorkoutCompletion(
  uid: string,
  workoutId: string
): boolean {
  return getQueue().some(
    (item) =>
      item.uid === uid && item.docId === workoutId && item.workoutCompletion
  );
}

/** A finished programme session still on its way to the server. The week
 * rollover waits for one: rolled first, the replay finds a different week
 * and lands the workout without its progression or the day's tick. An
 * entry that failed doesn't count. It waits on the person's retry, and the
 * week must not freeze behind it. */
export function hasPendingProgrammeCompletion(uid: string): boolean {
  return getQueue().some(
    (item) =>
      item.uid === uid && !!item.workoutCompletion?.programme && !item.failed
  );
}

/** The complete, timestamp-encoded workout survives programme rollover and
 * view teardown. Replays never restore a stale whole programme document. */
export function queueWorkoutCompletion(
  db: Firestore,
  uid: string,
  workoutId: string,
  data: Record<string, unknown>,
  programme?: ProgrammeCompletionContext
): Promise<"synced" | "failed"> {
  const queue = getQueue();
  const existing = queue.find(
    (item) =>
      item.uid === uid && item.docId === workoutId && item.workoutCompletion
  );
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    existing.failed = false;
    existing.refused = false;
  } else
    queue.push({
      id,
      uid,
      collectionPath: `users/${uid}/workouts`,
      docId: workoutId,
      data: encode(stripUndefined(data)) as Record<string, unknown>,
      timestamp: Date.now(),
      durable: true,
      workoutCompletion: programme ? { programme } : {},
    });
  if (!writeJson(QUEUE_KEY, queue))
    throw new Error(
      "Couldn't save on this phone. Free device storage and retry."
    );
  notifyQueue();
  const settled = new Promise<"synced" | "failed">((resolve) => {
    const unsubscribe = subscribeQueuedWrites(() => {
      const pending = getQueue().find(
        (item) => item.uid === uid && item.id === id
      );
      if (!pending || pending.failed) {
        unsubscribe();
        resolve(pending ? "failed" : "synced");
      }
    });
  });
  if (navigator.onLine) void flushQueue(db, uid).catch(() => {});
  return settled;
}

export function getQueueLength(uid?: string): number {
  const queue = getQueue();
  return uid ? queue.filter((q) => q.uid === uid).length : queue.length;
}

export function getFailedWorkoutCompletionCount(uid: string): number {
  return getQueue().filter(
    (item) => item.uid === uid && item.workoutCompletion && item.failed
  ).length;
}

/** Failed runs share the existing account-scoped retry surface. */
export function getFailedRunSaveCount(uid: string): number {
  return new Set(
    getQueue()
      .filter(
        (item) =>
          item.uid === uid &&
          item.collectionPath === `users/${uid}/runs` &&
          item.durable &&
          item.failed
      )
      .map((item) => item.docId)
  ).size;
}

/** Count meals, even when more than one queued edit belongs to a meal. */
export function getFailedMealSaveCount(uid: string): number {
  return new Set(
    getQueue()
      .filter(
        (item) =>
          item.uid === uid &&
          item.collectionPath === `users/${uid}/meals` &&
          item.durable &&
          item.failed
      )
      .map((item) => item.docId)
  ).size;
}

/**
 * A refusal no retry can change: the rules turned the write down
 * (`permission-denied`), or Firestore cannot store what was sent
 * (`invalid-argument`). Anything else (offline, a timeout, a token being
 * refreshed, a contended transaction) can land on a later flush.
 */
function refusedForGood(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "permission-denied" || code === "invalid-argument";
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

/** The documents whose save this account's server refused for good. */
function refusedDocuments(queue: QueuedWrite[], uid: string): Set<string> {
  return new Set(
    queue
      .filter(
        (item) =>
          item.uid === uid && item.durable && item.failed && item.refused
      )
      .map((item) => `${item.collectionPath}/${item.docId}`)
  );
}

/** Sessions and meals that will not save however often they are retried:
 *  the ones the person can discard. */
export function getRefusedSaveCount(uid: string): number {
  return refusedDocuments(getQueue(), uid).size;
}

/**
 * Remove what was refused for good, with every change queued behind it to
 * the same document: applied on its own, a meal's Undo would create a meal
 * that is only a deletion stamp. A discarded workout also retires its
 * finished-session draft, which would otherwise wait for a save that
 * cannot come. Chained behind any flush in flight, so the two never see
 * different queues. Resolves to the number of records discarded.
 */
export function discardRefusedSaves(uid: string): Promise<number> {
  const run = async () => {
    const queue = getQueue();
    const refused = refusedDocuments(queue, uid);
    if (refused.size === 0) return 0;
    const discarded = queue.filter(
      (item) =>
        item.uid === uid && refused.has(`${item.collectionPath}/${item.docId}`)
    );
    if (
      !writeJson(
        QUEUE_KEY,
        queue.filter((item) => !discarded.includes(item))
      )
    )
      throw new Error("Couldn't update this phone. Try again.");
    notifyQueue();
    const completions = discarded
      .filter((item) => item.workoutCompletion)
      .map(
        (item) => (decode(item.data) as { completionId?: unknown }).completionId
      )
      .filter((id): id is string => typeof id === "string");
    if (completions.length > 0) {
      const { clearCompletedWorkoutDraft } =
        await import("@/hooks/useWorkoutDraft");
      for (const id of completions) clearCompletedWorkoutDraft(uid, id);
    }
    return refused.size;
  };
  const result = flushChain.then(run, run);
  flushChain = result.catch(() => {});
  return result;
}

async function flushQueueOnce(db: Firestore, uid: string): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const landed = new Set<string>();
  const dropped = new Set<string>();
  // Documents with a save the rules refused for good still queued against
  // them. A later write to the same document waits behind it (a meal's
  // Undo behind its create, a session's notes behind its save); a write to
  // any other document goes ahead. Stopping at the refusal, as every
  // failure once did, left everything queued behind it unsynced, on every
  // flush, for good.
  const refused = new Set<string>();
  const { auth } = await import("@/lib/firebase");

  for (const item of queue) {
    // Not our user's item — leave it for the next time that user signs in.
    if (item.uid !== uid) continue;
    const target = item.docId ? `${item.collectionPath}/${item.docId}` : null;
    if (target && refused.has(target)) continue;
    try {
      // A queued flush can start after sign-out, or resume after another
      // account signs in while an earlier write awaits acknowledgement.
      // Check the live identity for EVERY write, including legacy entries.
      if (auth.currentUser?.uid !== uid) break;
      if (item.durable && !navigator.onLine) break;
      const decoded =
        item.durable || item.encoded
          ? (decode(item.data) as Record<string, unknown>)
          : item.data;
      const payload = { ...decoded, _offlineCreatedAt: item.timestamp };
      if (item.docId) {
        const docRef = doc(db, item.collectionPath, item.docId);
        if (item.workoutCompletion) {
          await commitWorkoutCompletion(
            db,
            uid,
            item.docId,
            payload,
            item.workoutCompletion.programme
          );
        } else if (item.durable && !item.merge) {
          await runTransaction(db, async (transaction) => {
            const current = await transaction.get(docRef);
            if (auth.currentUser?.uid !== uid)
              throw new Error("Sign in again to sync your changes.");
            // An ambiguous acknowledgement must not overwrite later diary edits.
            if (current.exists()) return;
            transaction.set(docRef, payload);
          });
        } else {
          await setDoc(docRef, payload, item.merge ? { merge: true } : {});
        }
      } else {
        await addDoc(collection(db, item.collectionPath), payload);
      }
      if (
        item.workoutCompletion &&
        auth.currentUser?.uid === uid &&
        typeof decoded.completionId === "string"
      ) {
        const { clearCompletedWorkoutDraft } =
          await import("@/hooks/useWorkoutDraft");
        if (auth.currentUser?.uid === uid)
          clearCompletedWorkoutDraft(uid, decoded.completionId);
      }
      landed.add(item.id);
      flushed++;
    } catch (e) {
      captureError(
        e instanceof Error ? e : new Error("OfflineQueue flush failed"),
        "network",
        { collectionPath: item.collectionPath, docId: item.docId }
      );
      const forGood = refusedForGood(e);
      if (item.durable) {
        // Kept, and shown as needing attention: the person's record.
        const latest = getQueue().map((entry) =>
          entry.id === item.id
            ? { ...entry, failed: true, refused: forGood }
            : entry
        );
        if (writeJson(QUEUE_KEY, latest)) notifyQueue();
        // Preserve create → undo ordering across a failed reconnect: a
        // write that may land later holds back everything behind it.
        if (!forGood) break;
        if (target) refused.add(target);
      } else if (forGood) {
        // A best-effort write no flush can land, retried on every one.
        dropped.add(item.id);
      }
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
  if (landed.size > 0 || dropped.size > 0) {
    saveQueue(
      getQueue().filter((item) => !landed.has(item.id) && !dropped.has(item.id))
    );
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
      // Queued, a refusal would be retried on every flush and reported to
      // the caller as saved.
      if (refusedForGood(e)) throw e;
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
      // As in safeSave: the caller hears a refusal rather than "saved".
      if (refusedForGood(e)) throw e;
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
