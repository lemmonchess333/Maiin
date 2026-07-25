/**
 * Share composer — imperative API.
 *
 * Save flows (workout completion in useProgram, run completion in
 * RunSummary) call `compose(preview)` which returns a Promise<ShareDecision
 * | null>. The promise resolves with the user's choice (visibility +
 * caption) or null if they declined to share.
 *
 * If the user has previously picked "Always do this for {workouts/runs}"
 * the promise short-circuits with the stored preference and the sheet
 * never opens. Stored per-type so workouts and runs can have different
 * defaults.
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

import { toast } from "@/lib/toast";

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

type AlwaysPref = ShareVisibility | "never" | null;
const PREF_KEY_PREFIX = "tropos.share.always";

function prefKey(uid: string, type: ShareType): string {
  // uid-scoped (money-path audit F9): a global key bled across account
  // switches on a shared device — user A's "always share publicly" would
  // auto-post user B's next workout under B's account.
  return `${PREF_KEY_PREFIX}.${uid}.${type}`;
}

function readAlways(uid: string, type: ShareType): AlwaysPref {
  try {
    // Purge the pre-uid-scoping global key. Never migrated: a global pref
    // can't be safely attributed to one account (that IS the leak), so the
    // user re-picks once after upgrade.
    localStorage.removeItem(`${PREF_KEY_PREFIX}.${type}`);
    const raw = localStorage.getItem(prefKey(uid, type));
    if (raw === "followers" || raw === "public" || raw === "never") return raw;
    // Crews retirement migration: the retired audience falls back to
    // its underlying fan-out rather than silently clearing the pref.
    if (raw === "crews") return "followers";
  } catch {
    /* localStorage unavailable (private mode, etc.) */
  }
  return null;
}

function writeAlways(uid: string, type: ShareType, value: AlwaysPref) {
  try {
    if (value === null) localStorage.removeItem(prefKey(uid, type));
    else localStorage.setItem(prefKey(uid, type), value);
  } catch {
    /* ignore */
  }
}

/** Used by Settings (ShareDefaultsRow) to let the user clear their saved
 *  default. Without this the "Always do this" tick is a one-way door —
 *  `compose()` short-circuits from then on and the sheet never reopens. */
export function clearShareDefault(uid: string, type: ShareType): void {
  writeAlways(uid, type, null);
}

/** Reads the saved "Always do this" preference, or null if the user has
 *  never ticked it for this type. Settings renders it so the choice is
 *  visible and reversible. */
export function getShareDefault(uid: string, type: ShareType): AlwaysPref {
  return readAlways(uid, type);
}

/** Test-only: seed a saved default without driving the whole sheet flow.
 *  Exists so tests don't hard-code the localStorage key format, which is
 *  private to this module (and uid-scoped — see `prefKey`). */
export function __setShareDefault(
  uid: string,
  type: ShareType,
  value: AlwaysPref
): void {
  writeAlways(uid, type, value);
}

// ── compose / resolve ────────────────────────────────────────────

export function compose(
  uid: string,
  preview: ActivityPreview
): Promise<ShareDecision | null> {
  const pref = readAlways(uid, preview.type);
  if (pref === "never") return Promise.resolve(null);
  if (pref === "followers" || pref === "public") {
    return Promise.resolve({ visibility: pref, caption: "" });
  }
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
}

function readQueue(): PendingShare[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingShare =>
        item != null &&
        typeof item === "object" &&
        typeof (item as { uid?: unknown }).uid === "string"
    );
  } catch {
    return [];
  }
}

function writeQueue(items: PendingShare[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function enqueueShare(
  uid: string,
  payload: Record<string, unknown>
): void {
  const items = readQueue();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({ id, uid, payload, queuedAt: Date.now() });
  writeQueue(items);
}

export function getQueueLength(uid?: string): number {
  const items = readQueue();
  return uid ? items.filter((q) => q.uid === uid).length : items.length;
}

/** Replay queued shares for `uid`. Caller supplies the post fn
 *  (typically `postActivity`). Items belonging to other uids are
 *  left in the queue for that user's next sign-in. Items that throw
 *  stay in the queue for the next drain attempt. */
export async function drainQueue(
  uid: string,
  post: (payload: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const items = readQueue();
  if (items.length === 0) return;
  const remaining: PendingShare[] = [];
  for (const item of items) {
    if (item.uid !== uid) {
      remaining.push(item);
      continue;
    }
    try {
      await post(item.payload);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

/** Toast surfaced after enqueueing an offline share. Lives here (not
 *  in ShareComposerSheet) so the sheet file only exports its component
 *  — react-refresh/only-export-components doesn't allow mixed exports. */
export function showQueuedToast(): void {
  toast.success("Post queued — will share when you're back online.", {
    id: "share-queued",
    duration: 3000,
  });
}
