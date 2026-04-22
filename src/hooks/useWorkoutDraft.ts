import { useCallback } from "react";

const STORAGE_KEY = "tropos_workout_draft";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

function readRaw(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutDraft;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useWorkoutDraft(dayIndex: number) {
  const load = useCallback((): WorkoutDraft | null => {
    const draft = readRaw();
    if (!draft || draft.dayIndex !== dayIndex) return null;
    return draft;
  }, [dayIndex]);

  const save = useCallback(
    (draft: Omit<WorkoutDraft, "savedAt">) => {
      try {
        const payload: WorkoutDraft = { ...draft, savedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Quota exceeded or storage unavailable — draft protection is best-effort
      }
    },
    [],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — nothing to clear
    }
  }, []);

  return { load, save, clear };
}
