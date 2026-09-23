/**
 * Share composer — the saved sharing default, the one-off share sheet, and
 * the offline share queue.
 *
 * The saved default ("Share sessions automatically?", per type) is what the
 * finish screens read: `finishShareStart` turns it into what happens to a
 * session the moment it is saved — ask once, post without a sheet, or hold.
 * It is asked for once (`answerShareQuestion`) and edited in Settings →
 * Privacy.
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

import {
  readJson,
  readString,
  remove,
  writeJson,
  writeString,
} from "@/lib/localStore";
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
 *  stored "crews" always-pref migrates to "followers" on read.) */
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
  /** uid of the session that opened the composer — scopes the "always" pref
   *  so resolveCompose persists it under the same account compose() read. */
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

// ── Per-type "Always do this" preference ─────────────────────────

export type AlwaysPref = ShareVisibility | "never" | null;

const SHARE_TYPES: readonly ShareType[] = ["run", "workout"];
const PREF_KEY_PREFIX = "tropos.share.always";

function prefKey(uid: string, type: ShareType): string {
  // uid-scoped (money-path audit F9): a global key bled across account
  // switches on a shared device — user A's "always share publicly" would
  // auto-post user B's next workout under B's account.
  return `${PREF_KEY_PREFIX}.${uid}.${type}`;
}

function readAlways(uid: string, type: ShareType): AlwaysPref {
  // Purge the pre-uid-scoping global key. Never migrated: a global pref
  // can't be safely attributed to one account (that IS the leak), so the
  // user re-picks once after upgrade.
  remove(`${PREF_KEY_PREFIX}.${type}`);
  const raw = readString(prefKey(uid, type));
  if (raw === "followers" || raw === "public" || raw === "never") return raw;
  // Crews retirement migration: the retired audience falls back to
  // its underlying fan-out rather than silently clearing the pref.
  if (raw === "crews") return "followers";
  return null;
}

function writeAlways(uid: string, type: ShareType, value: AlwaysPref) {
  if (value === null) remove(prefKey(uid, type));
  else writeString(prefKey(uid, type), value);
}

/** Used by Settings (ShareDefaultsRow) to let the user clear their saved
 *  default. Without this the default is a one-way door: once saved, the
 *  finish screen never asks again. */
export function clearShareDefault(uid: string, type: ShareType): void {
  writeAlways(uid, type, null);
}

/** Sets the saved default WITHOUT going through the composer sheet.
 *
 *  The sheet was the only writer until 2026-08-04, which made the setting
 *  reachable in exactly one direction: you could arrive at a default by
 *  finishing a session and ticking a box, and Settings could only take it
 *  away again. A user who wanted "never share my workouts" had to finish a
 *  workout to say so. Settings owns both directions now. */
export function setShareDefault(
  uid: string,
  type: ShareType,
  value: ShareVisibility | "never"
): void {
  writeAlways(uid, type, value);
}

/** Reads the saved "Always do this" preference, or null if the user has
 *  never ticked it for this type. Settings renders it so the choice is
 *  visible and reversible. */
export function getShareDefault(uid: string, type: ShareType): AlwaysPref {
  return readAlways(uid, type);
}

/**
 * Saves the answer to the finish screen's one question ("Share sessions
 * automatically?") for every session type that has no default yet, and
 * returns the types it set. `asking` is always among them: the question
 * only appears while that type has no default.
 *
 * A type that already has one keeps it. The user chose it on purpose, in
 * Settings or with the share sheet's "Make this my default", and answering
 * the question after a workout must not overwrite a "never" they picked
 * for runs.
 */
export function answerShareQuestion(
  uid: string,
  asking: ShareType,
  value: ShareVisibility | "never"
): ShareType[] {
  const unset = SHARE_TYPES.filter(
    (type) => type === asking || readAlways(uid, type) === null
  );
  for (const type of unset) writeAlways(uid, type, value);
  return unset;
}

/** What a finish screen does with a session the moment it is saved. */
export type FinishShareStart =
  /** No default yet: ask the one question. */
  | { kind: "ask" }
  /** Post it now, with no sheet. */
  | { kind: "post"; visibility: ShareVisibility }
  /** Post nothing; offer the one-off share button. */
  | { kind: "hold"; reason: "never" | "verify" };

export function finishShareStart(
  pref: AlwaysPref,
  needsEmailVerification: boolean
): FinishShareStart {
  if (pref === null) return { kind: "ask" };
  if (pref === "never") return { kind: "hold", reason: "never" };
  // An unverified email/password account cannot post publicly (the rules'
  // isEmailVerified). A post the rules will refuse must never be attempted
  // on the strength of a remembered choice: hold it, and let the one-off
  // sheet, where the verification notice lives, do the posting.
  if (needsEmailVerification) return { kind: "hold", reason: "verify" };
  return { kind: "post", visibility: pref };
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
 * means "Don't share this one". When `remember` is true, the choice is
 * persisted as the always-pref for this type.
 */
export function resolveCompose(
  decision: ShareDecision | null,
  remember: boolean
): void {
  const type = state.type;
  const uid = state.uid;
  if (resolveCb) {
    const cb = resolveCb;
    resolveCb = null;
    cb(decision);
  }
  if (remember && type && uid) {
    writeAlways(uid, type, decision === null ? "never" : decision.visibility);
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
 *  False when there was none, e.g. the queue drained first. */
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

/** Replay queued shares for `uid`. Caller supplies the post fn
 *  (typically `postActivity`). Items belonging to other uids are
 *  left in the queue for that user's next sign-in. Items that throw
 *  stay in the queue for the next drain attempt.
 *
 *  The queue is re-read around every post, not snapshotted once: an item
 *  cancelled while the drain is running must not be posted, and one
 *  queued meanwhile must not be erased by writing the snapshot back. */
export async function drainQueue(
  uid: string,
  post: (
    payload: Record<string, unknown>,
    source?: ShareSource
  ) => Promise<unknown>
): Promise<void> {
  const mine = readQueue().filter((item) => item.uid === uid);
  if (mine.length === 0) return;
  const posted = new Set<string>();
  for (const item of mine) {
    if (!readQueue().some((q) => q.id === item.id)) continue;
    try {
      await post(item.payload, item.source);
      posted.add(item.id);
    } catch {
      // stays queued for the next drain
    }
  }
  if (posted.size > 0) {
    writeQueue(readQueue().filter((item) => !posted.has(item.id)));
  }
}
