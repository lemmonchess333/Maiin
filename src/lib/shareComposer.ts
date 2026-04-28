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

import { toast } from "sonner";

export type ShareType = "workout" | "run";

/** Visibility options surfaced in the composer.
 *
 *  - `followers`: classic feed share. Goes to the user's followers'
 *    feeds. Does NOT surface on any crew page.
 *  - `crews`: same fan-out as `followers` (the underlying postActivity
 *    API only writes to followers' feeds), plus the activity is tagged
 *    with the user's primary crewId so it appears on that crew's page.
 *    Only offered when the user has a crewId.
 *  - `public`: discoverable via the Discover sub-tab and tagged with
 *    crewId so crew members see it too.
 *
 *  The "crews" value is composer-side only. socialApi.postActivity
 *  still takes the underlying `'public' | 'followers' | 'private'`
 *  union — callers map `'crews'` → `{ visibility: 'followers',
 *  crewId }` before calling postActivity. */
export type ShareVisibility = "followers" | "crews" | "public";

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
}

let state: SheetState = { open: false, type: null, preview: null };
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

function prefKey(type: ShareType): string {
  return `${PREF_KEY_PREFIX}.${type}`;
}

function readAlways(type: ShareType): AlwaysPref {
  try {
    const raw = localStorage.getItem(prefKey(type));
    if (raw === "followers" || raw === "crews" || raw === "public" || raw === "never") return raw;
  } catch {
    /* localStorage unavailable (private mode, etc.) */
  }
  return null;
}

function writeAlways(type: ShareType, value: AlwaysPref) {
  try {
    if (value === null) localStorage.removeItem(prefKey(type));
    else localStorage.setItem(prefKey(type), value);
  } catch {
    /* ignore */
  }
}

/** Used by Settings to let the user clear their saved default. */
export function clearShareDefault(type: ShareType): void {
  writeAlways(type, null);
}

export function getShareDefault(type: ShareType): AlwaysPref {
  return readAlways(type);
}

// ── compose / resolve ────────────────────────────────────────────

export function compose(preview: ActivityPreview): Promise<ShareDecision | null> {
  const pref = readAlways(preview.type);
  if (pref === "never") return Promise.resolve(null);
  if (pref === "followers" || pref === "crews" || pref === "public") {
    return Promise.resolve({ visibility: pref, caption: "" });
  }
  state = { open: true, type: preview.type, preview };
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
export function resolveCompose(decision: ShareDecision | null, remember: boolean): void {
  const type = state.type;
  if (resolveCb) {
    const cb = resolveCb;
    resolveCb = null;
    cb(decision);
  }
  if (remember && type) {
    writeAlways(type, decision === null ? "never" : decision.visibility);
  }
  state = { open: false, type: null, preview: null };
  emit();
}

// ── Offline queue ────────────────────────────────────────────────

const QUEUE_KEY = "tropos.share.queue";

export interface PendingShare {
  id: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

function readQueue(): PendingShare[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingShare[]) : [];
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

export function enqueueShare(payload: Record<string, unknown>): void {
  const items = readQueue();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({ id, payload, queuedAt: Date.now() });
  writeQueue(items);
}

export function getQueueLength(): number {
  return readQueue().length;
}

/** Replay queued shares. Caller supplies the post fn (typically
 *  `postActivity`). Items that throw stay in the queue for the next
 *  drain attempt. */
export async function drainQueue(
  post: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const items = readQueue();
  if (items.length === 0) return;
  const remaining: PendingShare[] = [];
  for (const item of items) {
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
