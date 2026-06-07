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

export function useWorkoutDraft(uid: string | undefined, dayIndex: number) {
  const load = useCallback((): WorkoutDraft | null => {
    if (!uid) return null;
    const draft = readRaw(uid);
    if (!draft || draft.dayIndex !== dayIndex) return null;
    return draft;
  }, [uid, dayIndex]);

  const save = useCallback(
    (draft: Omit<WorkoutDraft, "savedAt">) => {
      if (!uid) return;
      try {
        const payload: WorkoutDraft = { ...draft, savedAt: Date.now() };
        localStorage.setItem(storageKey(uid), JSON.stringify(payload));
      } catch {
        // Quota exceeded or storage unavailable — draft protection is best-effort
      }
    },
    [uid]
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
