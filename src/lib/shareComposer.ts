/**
 * Share composer — the one-off share sheet and the offline share queue.
 *
 * The saved default ("Share sessions automatically?", per type), which the
 * finish screens act on, lives in `shareDefaults.ts`.
 *
 * `compose(preview)` is the one-off path: it always opens the sheet and
 * resolves with the user's choice (visibility + caption), or null if they
 * declined. It never applies the saved default. The finish screen does,
 * so the default has one reader and Settings' "Shared automatically" is
 * true.
 *
 * Singleton + event-emitter shape (mirrors how `sonner` exposes toast)
 * so the API is callable from non-React code (the workout-save chain is
 * inside a hook function, not a component).
 *
 * Offline: when a share is attempted while offline, the postActivity
 * payload is queued in localStorage and replayed by `drainQueue()` once
 * the app is back online. Drain is wired up in ShareComposerSheet which
 * is mounted once at app root.
 */

import { readJson, writeJson } from "@/lib/localStore";
import type { ShareSource } from "@/lib/sessionDelete";

export type ShareType = "workout" | "run";

/** Visibility options surfaced in the composer.
 *
 *  - `followers`: classic feed share. Goes to the user's followers'
 *    feeds.
 *  - `public`: also discoverable via the Discover sub-tab.
 *
 *  (A third `crews` option existed until the crews retirement,
 *  2026-07-20 — it was the followers fan-out plus a crewId tag. A
 *  device's saved "crews" answer reads, and moves, as "followers".) */
export type ShareVisibility = "followers" | "public";

export interface ActivityPreview {
  type: ShareType;
  /** e.g. "Push Day" or "Morning run" */
  title: string;
  /** Short stat line, e.g. ["1h 12m", "12,840kg volume"] */
  meta: string[];
  /** Redacted coordinates, identical to the eventual post; never raw GPS. */
  routePreview?: import("./routeSegments").RouteCoordinate[];
  routePrivacyNote?: string;
}

export interface ShareDecision {
  visibility: ShareVisibility;
  caption: string;
}

interface SheetState {
  open: boolean;
  type: ShareType | null;
  preview: ActivityPreview | null;
  /** uid of the session that opened the composer. The sheet saves "Make
   *  this my default" only while that account is the one signed in. */
  uid: string | null;
}

let state: SheetState = {
  open: false,
  type: null,
  preview: null,
  uid: null,
};
let resolveCb: ((decision: ShareDecision | null) => void) | null = null;
const listeners = new Set<(s: SheetState) => void>();

function emit() {
  for (const l of listeners) l(state);
}

export function subscribeShareComposer(listener: (s: SheetState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

// ── compose / resolve ────────────────────────────────────────────

/** Opens the share sheet for one session and resolves with the user's
 *  choice, or null if they declined. It always opens: the saved default is
 *  applied by the finish screen (`finishShareStart`), never here. */
export function compose(
  uid: string,
  preview: ActivityPreview
): Promise<ShareDecision | null> {
  state = { open: true, type: preview.type, preview, uid };
  emit();
  return new Promise((resolve) => {
    resolveCb = resolve;
  });
}

/**
 * Called by the sheet UI when the user picks an action. `decision === null`
 * means "Don't share this one". Saving the choice as the default ("Make
 * this my default") is the sheet's to do: the default lives on the
 * account, which only React code can write.
 */
export function resolveCompose(decision: ShareDecision | null): void {
  if (resolveCb) {
    const cb = resolveCb;
    resolveCb = null;
    cb(decision);
  }
  state = { open: false, type: null, preview: null, uid: null };
  emit();
}

// ── Offline queue ────────────────────────────────────────────────
//
// Each pending share carries the originating uid so a queued post
// can never replay under a different user's session. Pre-uid-scoping,
// a share queued by user A would replay under user B's auth on the
// next online → drainQueue tick (`postActivity` throws "Identity
// mismatch" on user B but the item stayed queued; once user A
// signed back in the stale post — long since forgotten — landed as
// a fresh activity with the original authorId).

const QUEUE_KEY = "tropos.share.queue";

export interface PendingShare {
  id: string;
  /** Owner of this pending share — the only user whose session can
   *  drain it. Items missing this field are legacy pre-scoping
   *  writes and are dropped on next read. */
  uid: string;
  payload: Record<string, unknown>;
  queuedAt: number;
  /** The session this post is ABOUT, so the drain can record
   *  `sharedActivityId` back onto it after posting — the link
   *  `deleteLoggedSession` needs to clear the post if the session is
   *  later deleted. Optional: items queued before it existed drain
   *  fine and simply leave no link, same as the pre-fix behaviour. */
  source?: ShareSource;
}

function readQueue(): PendingShare[] {
  const parsed = readJson<unknown>(QUEUE_KEY, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is PendingShare =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { uid?: unknown }).uid === "string"
  );
}

function writeQueue(items: PendingShare[]) {
  writeJson(QUEUE_KEY, items);
}

function isFor(item: PendingShare, uid: string, source: ShareSource): boolean {
  return (
    item.uid === uid &&
    item.source?.kind === source.kind &&
    item.source.id === source.id
  );
}

function sessionKey(uid: string, source: ShareSource): string {
  return `${uid}:${source.kind}:${source.id}`;
}

/** Posts the drain has taken out of the queue and is sending, by session.
 *  Each resolves to the posted activity's id, or null when the post failed
 *  and went back in the queue. */
const sending = new Map<string, Promise<string | null>>();
/** Posts the drain has sent in this app session, by session: the id it was
 *  passed back, so an Undo after the drain can delete the post by id. */
const sent = new Map<string, string>();

export function enqueueShare(
  uid: string,
  payload: Record<string, unknown>,
  source?: ShareSource
): void {
  // One pending post per session. A save that is retried re-runs its
  // finish screen, and with sharing automatic that would queue the same
  // session again and post it twice when the queue drains.
  const items = source
    ? readQueue().filter((item) => !isFor(item, uid, source))
    : readQueue();
  // A new post for the session: one the drain sent earlier is not the one
  // an Undo of this queued post means.
  if (source) sent.delete(sessionKey(uid, source));
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({
    id,
    uid,
    payload,
    queuedAt: Date.now(),
    ...(source ? { source } : {}),
  });
  writeQueue(items);
}

/** Drops a session's pending post (the finish screen's Undo while offline).
 *  False when there was none: the queue drained first, or the drain is
 *  sending it now (see `withdrawQueuedShare`). */
export function cancelQueuedShare(uid: string, source: ShareSource): boolean {
  const items = readQueue();
  const kept = items.filter((item) => !isFor(item, uid, source));
  if (kept.length === items.length) return false;
  writeQueue(kept);
  return true;
}

export function getQueueLength(uid?: string): number {
  const items = readQueue();
  return uid ? items.filter((q) => q.uid === uid).length : items.length;
}

export type QueuedShareWithdrawal =
  /** It was still waiting, and now never posts. */
  | { status: "cancelled" }
  /** The drain posted it: this is the post, for the caller to delete. */
  | { status: "posted"; activityId: string }
  /** Not queued, and not sent by a drain in this app session. */
  | { status: "unknown" };

/**
 * Takes back a session's queued post (the finish screen's Undo). A post the
 * drain is sending cannot be cancelled any more, so this waits for it and
 * returns its id, for the caller to delete once it exists. While the
 * connection is down that wait lasts until it returns: the post cannot be
 * deleted before it has an id.
 */
export async function withdrawQueuedShare(
  uid: string,
  source: ShareSource
): Promise<QueuedShareWithdrawal> {
  const key = sessionKey(uid, source);
  for (let onItsWay = sending.get(key); onItsWay; onItsWay = sending.get(key)) {
    const activityId = await onItsWay;
    if (activityId) return { status: "posted", activityId };
    // It failed and went back in the queue, where it can be cancelled.
  }
  if (cancelQueuedShare(uid, source)) return { status: "cancelled" };
  const activityId = sent.get(key);
  return activityId ? { status: "posted", activityId } : { status: "unknown" };
}

/**
 * An account's drains run one at a time. The sheet starts one on every
 * return to online, and a connection that drops and returns while a post is
 * on its way starts a second one alongside the first. Chained, the second
 * waits, re-reads the queue, and finds the first's work already done.
 *
 * Chained per account, because a post can wait on a write that is only sent
 * once its own account signs back in, and that must not hold up the drains
 * of the account using the phone now.
 */
const drainChains = new Map<string, Promise<unknown>>();

/** Replay queued shares for `uid`. Caller supplies the post fn, which
 *  resolves with the posted activity's id. Items belonging to other uids
 *  are left in the queue for that user's next sign-in. Items that throw go
 *  back in the queue for the next drain attempt.
 *
 *  The queue is re-read around every post, not snapshotted once: an item
 *  cancelled while the drain is running must not be posted, and one
 *  queued meanwhile must not be erased by writing the snapshot back. */
export function drainQueue(
  uid: string,
  post: (
    payload: Record<string, unknown>,
    source?: ShareSource
  ) => Promise<string | void>
): Promise<void> {
  const run = () => drainOnce(uid, post);
  const result = (drainChains.get(uid) ?? Promise.resolve()).then(run, run);
  // A rejected drain must not break the chain for every later one.
  drainChains.set(
    uid,
    result.catch(() => {})
  );
  return result;
}

async function drainOnce(
  uid: string,
  post: (
    payload: Record<string, unknown>,
    source?: ShareSource
  ) => Promise<string | void>
): Promise<void> {
  const mine = readQueue().filter((item) => item.uid === uid);
  for (const item of mine) {
    const queue = readQueue();
    if (!queue.some((q) => q.id === item.id)) continue;
    // Out of the queue before the request goes, so an Undo while the post
    // is on its way cannot find it there and report it cancelled, and an
    // app closed mid-request cannot send it a second time from the queue.
    writeQueue(queue.filter((q) => q.id !== item.id));
    const key = item.source ? sessionKey(uid, item.source) : null;
    let settle: (activityId: string | null) => void = () => {};
    if (key) {
      sending.set(
        key,
        new Promise((resolve) => {
          settle = resolve;
        })
      );
    }
    let activityId: string | null = null;
    try {
      const posted = await post(item.payload, item.source);
      activityId = typeof posted === "string" ? posted : null;
      if (key && activityId) sent.set(key, activityId);
    } catch {
      // Back in the queue for the next drain, unless the session has been
      // queued again meanwhile (one pending post per session).
      const current = readQueue();
      const source = item.source;
      if (!source || !current.some((q) => isFor(q, uid, source))) {
        writeQueue([...current, item]);
      }
    }
    if (key) sending.delete(key);
    settle(activityId);
  }
}
