import { useCallback } from "react";

/**
 * In-progress workout draft persistence (weights / reps / notes /
 * elapsed). Keyed per uid (one draft per user; dayIndex is checked at
 * read time, not part of the key) so account B on a shared device never
 * inherits account A's in-flight workout — a cross-account
 * leak the pre-scoping global key allowed. The legacy un-scoped key is
 * dropped on first read (mirrors offlineQueue.ts PR #820: there's no
 * safe way to attribute a pre-scoping draft to a uid retroactively, so
 * better to discard than to risk surfacing it under the wrong account).
 *
 * LIFT-01 (session identity): a draft additionally carries a
 * deterministic identity string derived from the workout's scope
 * (programme vs a specific saved routine), epoch (programme week
 * number), day metadata, and the executable exercise layout. `load()`
 * only offers a draft whose identity matches the session being opened.
 * Pre-identity `setLogs`/`exerciseNotes` are POSITIONAL over
 * `day.exercises`, so a draft restored onto a rebuilt/customised
 * programme day, a new programme week, or a different saved routine
 * (they all shared synthetic dayIndex -1) silently landed old
 * weights/reps/notes on the wrong exercises. Identified drafts that
 * don't match are left in place (they belong to their own surface,
 * e.g. another day's in-flight session); legacy drafts with no
 * identity are dropped on read — their layout provenance is unknown,
 * so restoring them is never safe.
 */

// Packet 15b — V2 per-session keys. V1 was a single `tropos_workout_draft:<uid>`
// slot, so starting a second session (a different `identity`) overwrote the
// first session's recovery record. V2 keys each (uid, identity) pair, so Push
// and Pull drafts coexist. V1 is still read for a one-time migration.
const V1_STORAGE_KEY_PREFIX = "tropos_workout_draft";
const V2_STORAGE_KEY_PREFIX = "tropos_workout_draft:v2";
/** Legacy un-scoped key from before uid scoping — dropped on first read. */
const LEGACY_STORAGE_KEY = "tropos_workout_draft";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS_PER_USER = 12;

function v1StorageKey(uid: string): string {
  return `${V1_STORAGE_KEY_PREFIX}:${uid}`;
}
function v2UserKeyPrefix(uid: string): string {
  return `${V2_STORAGE_KEY_PREFIX}:${encodeURIComponent(uid)}:`;
}
function v2StorageKey(uid: string, identity: string): string {
  return v2UserKeyPrefix(uid) + encodeURIComponent(identity);
}

type SetType = "working" | "warmup" | "dropset" | "failure";

interface DraftSetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

export interface WorkoutDraft {
  dayIndex: number;
  dayName: string;
  setLogs: DraftSetLog[][];
  exerciseNotes: Record<number, string>;
  elapsedSeconds: number;
  currentExIndex: number;
  savedAt: number;
  /** LIFT-01 session identity — see `computeDraftIdentity`. Drafts
   *  written before identity existed lack this field and are dropped
   *  on read. */
  identity: string;
  /** Stable idempotency key for this session's completion (packet 15).
   *  Drives the deterministic workout doc id so a retried/resumed Finish
   *  targets the SAME workout instead of appending a duplicate. Repaired
   *  once (and persisted) if a pre-packet-15 draft is resumed. */
  completionId: string;
}

/**
 * Mint a session-stable workout completion id. Used when a fresh session
 * starts (or a legacy draft without one is resumed). crypto.randomUUID
 * where available, with a timestamp+random fallback for older WebViews.
 */
export function createWorkoutCompletionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return (
    "fallback-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

export interface DraftIdentityParts {
  /** `"programme"` for scheduled programme days; `"routine:<id>"` for
   *  a saved-routine session — isolates each routine's draft instead
   *  of all routines sharing the synthetic dayIndex -1 slot. */
  scope: string;
  /** Invalidation epoch within a scope: the programme `weekNumber`
   *  for programme days (a stale draft can't claim the next week's
   *  session), 0 for routines (layout drift covers routine edits). */
  epoch: string | number;
  dayIndex: number;
  dayName: string;
  /** Executable exercise layout, in order: id (or name fallback) +
   *  planned set count. `setLogs`/`exerciseNotes` are positional over
   *  this layout, so any reorder/swap/resize must invalidate. */
  layout: Array<{ id: string; sets: number }>;
}

/**
 * Deterministic identity for the session a draft belongs to. Plain
 * readable string (not a hash) — trivially small for ≤~15 exercises
 * and debuggable straight out of localStorage.
 */
export function computeDraftIdentity(parts: DraftIdentityParts): string {
  return [
    "v1",
    parts.scope,
    `e${parts.epoch}`,
    `d${parts.dayIndex}`,
    parts.dayName,
    parts.layout.map((l) => `${l.id}x${l.sets}`).join(","),
  ].join("|");
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — draft protection is best effort.
  }
}

function writeDraftAt(key: string, draft: WorkoutDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota exhausted or storage unavailable.
  }
}

/**
 * Read + validate a draft at an exact key. Drops it if malformed, identity-
 * less (positional provenance unknown → never safe to restore), or expired.
 * Repairs a pre-packet-15 draft missing `completionId` once (mint + persist)
 * so a resumed session keeps a stable idempotency key across remounts.
 */
function readDraftAt(key: string): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkoutDraft>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      typeof parsed.dayIndex !== "number" ||
      typeof parsed.identity !== "string" ||
      parsed.identity.length === 0
    ) {
      removeKey(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      removeKey(key);
      return null;
    }
    if (
      typeof parsed.completionId === "string" &&
      parsed.completionId.length > 0
    ) {
      return parsed as WorkoutDraft;
    }
    const repaired: WorkoutDraft = {
      ...(parsed as WorkoutDraft),
      completionId: createWorkoutCompletionId(),
    };
    writeDraftAt(key, repaired);
    return repaired;
  } catch {
    return null;
  }
}

/** Keep only the MAX_DRAFTS_PER_USER newest V2 drafts for a uid. */
function pruneUserDrafts(uid: string): void {
  try {
    const prefix = v2UserKeyPrefix(uid);
    const drafts: Array<{ key: string; savedAt: number }> = [];
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const draft = readDraftAt(key);
      if (draft) drafts.push({ key, savedAt: draft.savedAt });
    }
    drafts
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(MAX_DRAFTS_PER_USER)
      .forEach((d) => removeKey(d.key));
  } catch {
    // localStorage enumeration unavailable.
  }
}

/**
 * Non-hook clear of every workout draft for a uid. Used by the sign-out path
 * to wipe the outgoing user's in-flight drafts before the next account signs
 * in. Sweeps all V2 keys for the uid plus the legacy V1 / un-scoped keys.
 * Best-effort; never throws.
 */
export function clearWorkoutDraft(uid: string): void {
  if (!uid) return;
  try {
    const prefix = v2UserKeyPrefix(uid);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
    localStorage.removeItem(v1StorageKey(uid));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

export function useWorkoutDraft(
  uid: string | undefined,
  dayIndex: number,
  identity: string
) {
  const key = uid ? v2StorageKey(uid, identity) : null;

  const load = useCallback((): WorkoutDraft | null => {
    if (!uid || !key) return null;
    // Drop the pre-scoping global draft on first read.
    removeKey(LEGACY_STORAGE_KEY);

    const v2 = readDraftAt(key);
    if (v2) {
      // The key already encodes (uid, identity); a defensive re-check.
      if (v2.dayIndex === dayIndex && v2.identity === identity) return v2;
      removeKey(key);
      return null;
    }

    // No V2 record yet — migrate a matching V1 single-slot draft exactly once.
    // A V1 record for a DIFFERENT surface stays put (its surface migrates it);
    // an identity-less V1 is dropped by readDraftAt (positional provenance
    // unknown → never safe to restore).
    const oldKey = v1StorageKey(uid);
    const v1 = readDraftAt(oldKey);
    if (!v1 || v1.identity !== identity || v1.dayIndex !== dayIndex) {
      return null;
    }
    writeDraftAt(key, v1);
    removeKey(oldKey);
    pruneUserDrafts(uid);
    return v1;
  }, [uid, key, dayIndex, identity]);

  const save = useCallback(
    (draft: Omit<WorkoutDraft, "savedAt" | "identity">) => {
      if (!uid || !key) return;
      writeDraftAt(key, { ...draft, identity, savedAt: Date.now() });
      pruneUserDrafts(uid);
    },
    [uid, key, identity]
  );

  const clear = useCallback(() => {
    if (!uid || !key) return;
    removeKey(key);
    // Also clear a matching V1 key so a not-yet-migrated slot can't resurface.
    const oldKey = v1StorageKey(uid);
    const v1 = readDraftAt(oldKey);
    if (v1 && v1.identity === identity && v1.dayIndex === dayIndex) {
      removeKey(oldKey);
    }
  }, [uid, key, dayIndex, identity]);

  return { load, save, clear };
}
