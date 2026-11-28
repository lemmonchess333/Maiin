import { isBodyweightExerciseId } from "@/lib/exercises";
import type { LiftUnit } from "@/lib/liftLoad";
import { automaticStepUp, formatKitLoad, loadGridFor } from "./loadSteps";
import type { ProgramExercise } from "./programTypes";

export interface ProgressionPreviewSetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type?: string;
  rpe?: number;
}

export interface ProgressionPreviewItem {
  exerciseId: string;
  name: string;
  detail: string;
}

/**
 * Lightweight post-workout preview of exercises ready to progress on the next
 * session. Uses `loadGridFor` + `automaticStepUp` directly without importing
 * `programEngine.ts` so `SessionCompleteScreen`'s chunk stays small.
 */
export function buildProgressionPreview(
  exercises: readonly ProgramExercise[],
  setLogs: readonly (readonly ProgressionPreviewSetLog[])[],
  unit: LiftUnit,
  smallPlates = false
): ProgressionPreviewItem[] {
  const items: ProgressionPreviewItem[] = [];

  for (let i = 0; i < exercises.length; i += 1) {
    const ex = exercises[i];
    if (ex.repUnit === "seconds") continue;

    const workingSets = (setLogs[i] ?? []).filter(
      (s) => s.completed && s.type !== "warmup"
    );
    if (workingSets.length === 0 || workingSets.length < ex.sets) continue;

    const targetReps = ex.repRangeMax ?? ex.reps;
    if (targetReps <= 0) continue;

    const minReps = Math.min(...workingSets.map((s) => s.reps));
    if (minReps < targetReps) continue;

    const maxRpe = workingSets.reduce(
      (max, s) =>
        typeof s.rpe === "number" && Number.isFinite(s.rpe)
          ? Math.max(max, s.rpe)
          : max,
      0
    );
    if (maxRpe >= 9.5) continue;

    const topWeight = Math.max(...workingSets.map((s) => s.weight));
    if (topWeight > 0) {
      const grid = loadGridFor(ex.exerciseId, smallPlates, unit);
      const nextWeight = automaticStepUp(grid, topWeight);
      const detail =
        nextWeight !== null
          ? `${formatKitLoad(nextWeight, unit, ex.exerciseId)} next time`
          : "Holding weight, adding reps next time";
      items.push({ exerciseId: ex.exerciseId, name: ex.name, detail });
    } else if (topWeight === 0 && isBodyweightExerciseId(ex.exerciseId)) {
      items.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        detail: "Ready to add load next time",
      });
    }
  }

  return items;
}
