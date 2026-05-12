/**
 * Active-run draft recovery.
 *
 * PR H2 (audit P1 #8): active-run state is purely in-memory in Run.tsx.
 * Accidental app close, OS-kill on memory pressure, or a mid-run
 * crash currently loses the entire session — a major trust hit for
 * long sessions. This hook persists enough of the run state to
 * localStorage every few seconds while active, then offers a
 * recovery prompt on the next Run.tsx mount.
 *
 * Pattern mirrors `useWorkoutDraft` (the lifting equivalent that
 * already exists). Key differences:
 *   - Run state includes GPS points (variable size); we cap the
 *     persisted array at 500 to stay well under typical
 *     localStorage quotas (~5MB).
 *   - Drafts are scoped to a single in-flight run (not keyed by
 *     dayIndex like workouts) — at most one active run at a time.
 *   - Max age is 12h. A run from yesterday is almost always stale
 *     (overnight = phone slept, draft is dead) so we don't offer
 *     recovery for it.
 *
 * Returns a stable `{ load, save, clear }` triple matching
 * useWorkoutDraft so call sites read the same way.
 */
import { useCallback } from "react";
import type { GPSPoint } from "@/lib/gps";

const STORAGE_KEY = "tropos_run_draft";
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_POINTS_PERSISTED = 500;

/**
 * Shape persisted to localStorage. Matches the minimum data needed
 * for Run.tsx to resurrect an interrupted session:
 *
 *   - runConfig captures the user's setup choices (activity type,
 *     target, intervals, etc.) so we don't have to re-show the
 *     setup modal on recovery.
 *   - elapsedSeconds restores the timer's clock so distance/pace
 *     math stays correct across restart.
 *   - points is the captured GPS trace, capped at the most-recent
 *     500 fixes. Pre-cap traces can blow the 5MB localStorage
 *     quota on long runs; we keep the tail so the recovered route
 *     starts where the user left off.
 *   - treadmillDistance preserves manual-distance input from
 *     TreadmillMode flows that don't use GPS at all.
 *   - backgroundGapMs is the accumulator from Run.tsx's
 *     visibility tracking. Preserving it keeps the route-quality
 *     score honest after recovery.
 */
export interface ActiveRunDraft {
  // Stored as JSON-safe shape; consumers cast to the strict types.
  runConfig: unknown;
  elapsedSeconds: number;
  points: GPSPoint[];
  treadmillDistance: number;
  backgroundGapMs: number;
  savedAt: number;
}

function readRaw(): ActiveRunDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRunDraft;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      // Stale — overnight pause is the canonical case. Clean up and
      // pretend no draft existed so the caller can show a fresh
      // setup flow.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useActiveRunDraft() {
  const load = useCallback((): ActiveRunDraft | null => readRaw(), []);

  const save = useCallback(
    (draft: Omit<ActiveRunDraft, "savedAt">) => {
      try {
        // Tail-trim the GPS points to MAX_POINTS_PERSISTED so a long
        // run doesn't push the localStorage budget. We keep the most
        // recent points because that's what the resumed session needs
        // to compute "current pace" + the most useful route segment.
        const trimmedPoints = draft.points.length > MAX_POINTS_PERSISTED
          ? draft.points.slice(-MAX_POINTS_PERSISTED)
          : draft.points;
        const payload: ActiveRunDraft = {
          ...draft,
          points: trimmedPoints,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Quota exceeded or storage unavailable — draft protection
        // is best-effort. Swallow the error; the in-memory run
        // continues normally.
      }
    },
    [],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — nothing to clear.
    }
  }, []);

  return { load, save, clear };
}
