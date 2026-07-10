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

/** Key PREFIX. The actual key is `<prefix>:<uid>`. */
const STORAGE_KEY_PREFIX = "tropos_workout_draft";

/** Legacy un-scoped key from before uid scoping — dropped on first read. */
const LEGACY_STORAGE_KEY = "tropos_workout_draft";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function storageKey(uid: string): string {
  return `${STORAGE_KEY_PREFIX}:${uid}`;
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

/**
 * Best-effort removal of the legacy un-scoped key. The legacy key has
 * no `:uid` suffix so it can never collide with a scoped key — this
 * only removes the pre-scoping global entry.
 */
function dropLegacyKey(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

/**
 * Non-hook clear of every workout draft for a uid. Used by the
 * sign-out path (belt-and-braces on top of uid scoping) to wipe the
 * outgoing user's in-flight draft before the next account signs in.
 * Best-effort; never throws.
 */
export function clearWorkoutDraft(uid: string): void {
  if (!uid) return;
  try {
    localStorage.removeItem(storageKey(uid));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function readRaw(uid: string): WorkoutDraft | null {
  // Drop the legacy global draft on first read so a pre-scoping draft
  // can never surface under the wrong account.
  dropLegacyKey();
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutDraft;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(uid));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useWorkoutDraft(
  uid: string | undefined,
  dayIndex: number,
  identity: string
) {
  const load = useCallback((): WorkoutDraft | null => {
    if (!uid) return null;
    const draft = readRaw(uid);
    if (!draft) return null;
    if (!draft.identity) {
      // Legacy pre-identity draft: layout provenance unknown, so a
      // positional restore is never safe. Drop it outright.
      try {
        localStorage.removeItem(storageKey(uid));
      } catch {
        // Storage unavailable — nothing to clean up.
      }
      return null;
    }
    // An identified draft that doesn't match belongs to a different
    // session (another day / week / routine) — leave it in place for
    // that surface; just don't offer it here.
    if (draft.dayIndex !== dayIndex || draft.identity !== identity) return null;
    return draft;
  }, [uid, dayIndex, identity]);

  const save = useCallback(
    (draft: Omit<WorkoutDraft, "savedAt" | "identity">) => {
      if (!uid) return;
      try {
        const payload: WorkoutDraft = {
          ...draft,
          identity,
          savedAt: Date.now(),
        };
        localStorage.setItem(storageKey(uid), JSON.stringify(payload));
      } catch {
        // Quota exceeded or storage unavailable — draft protection is best-effort
      }
    },
    [uid, identity]
  );

  const clear = useCallback(() => {
    if (!uid) return;
    try {
      localStorage.removeItem(storageKey(uid));
    } catch {
      // Storage unavailable — nothing to clear
    }
  }, [uid]);

  return { load, save, clear };
}
