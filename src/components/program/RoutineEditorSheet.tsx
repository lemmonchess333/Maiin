import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import ExercisePicker from "@/components/program/ExercisePicker";
import type { Exercise } from "@/lib/exercises";
import {
  saveRoutine,
  updateSavedRoutine,
  type SavedRoutine,
  type SavedRoutineExercise,
} from "@/lib/savedRoutines";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { loadIn, loadToKg, liftUnitLabel } from "@/lib/liftLoad";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

interface DraftRow {
  key: string;
  name: string;
  exerciseId?: string;
  setCount: number;
  targetReps: number;
  /** Displayed in the lifter's preferred weight unit (empty string = bodyweight/unset). */
  weightInput: string;
}

interface RoutineEditorSheetProps {
  open: boolean;
  uid: string;
  authorName: string;
  /** Existing routine when editing, or null when creating a new routine. */
  routine: SavedRoutine | null;
  onClose: () => void;
  onSaved: (saved: SavedRoutine) => void;
}

function buildRows(
  routine: SavedRoutine | null,
  unit: "kg" | "lbs"
): DraftRow[] {
  if (!routine) return [];
  return routine.exercises.map((ex, i) => ({
    key: `${ex.exerciseId ?? ex.name}-${i}`,
    name: ex.name,
    exerciseId: ex.exerciseId,
    setCount: Math.max(1, ex.setCount || 3),
    targetReps: Math.max(1, ex.targetReps || 8),
    weightInput:
      ex.targetWeightKg > 0 ? String(loadIn(ex.targetWeightKg, unit)) : "",
  }));
}

function summaryForRow(row: DraftRow, weightKg: number): string {
  const base = `${row.setCount}×${row.targetReps}`;
  return weightKg > 0 ? `${base}×${loadIn(weightKg, "kg")}kg` : base;
}

export default function RoutineEditorSheet({
  open,
  uid,
  authorName,
  routine,
  onClose,
  onSaved,
}: RoutineEditorSheetProps) {
  const liftUnit = useLiftUnit();
  const nameId = useId();
  const [name, setName] = useState(() => routine?.name ?? "");
  const [rows, setRows] = useState<DraftRow[]>(() =>
    buildRows(routine, liftUnit)
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const addExercises = (picked: Exercise[]) => {
    setRows((prev) => [
      ...prev,
      ...picked.map((ex, idx) => ({
        key: `${ex.id}-${Date.now()}-${idx}`,
        name: ex.name,
        exerciseId: ex.id,
        setCount: 3,
        targetReps: 10,
        weightInput: "",
      })),
    ]);
    setPickerOpen(false);
  };

  const moveRow = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    haptic("light");
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeRow = (index: number) => {
    haptic("light");
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Add a name for this routine.");
      return;
    }
    if (rows.length === 0) {
      toast.error("Add at least one exercise.");
      return;
    }
    setSaving(true);
    try {
      const exercises: SavedRoutineExercise[] = rows.map((row) => {
        const parsed = Number.parseFloat(row.weightInput);
        const weightKg =
          Number.isFinite(parsed) && parsed > 0
            ? loadToKg(parsed, liftUnit)
            : 0;
        const setCount = Math.max(1, Math.min(20, Math.round(row.setCount)));
        const targetReps = Math.max(
          1,
          Math.min(200, Math.round(row.targetReps))
        );
        return {
          name: row.name,
          ...(row.exerciseId ? { exerciseId: row.exerciseId } : {}),
          summary: summaryForRow({ ...row, setCount, targetReps }, weightKg),
          setCount,
          targetReps,
          targetWeightKg: weightKg,
        };
      });

      if (routine) {
        await updateSavedRoutine(uid, routine.id, {
          name: trimmed,
          exercises,
        });
        haptic("light");
        toast.success("Routine updated");
        onSaved({
          ...routine,
          name: trimmed,
          sourceAuthorId: uid,
          sourceAuthorName: authorName || routine.sourceAuthorName,
          exercises,
        });
      } else {
        const id = await saveRoutine(uid, {
          name: trimmed,
          sourceAuthorId: uid,
          sourceAuthorName: authorName || "You",
          exercises,
        });
        haptic("light");
        toast.success("Routine saved");
        onSaved({
          id,
          name: trimmed,
          sourceAuthorId: uid,
          sourceAuthorName: authorName || "You",
          exercises,
        });
      }
      onClose();
    } catch (err) {
      logger.error("[RoutineEditorSheet] save failed", err);
      toast.error("Couldn’t save routine. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !saving) onClose();
        }}
        title={routine ? "Edit routine" : "New routine"}
        description="Build a reusable lifting template with your own sets and targets."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor={nameId}
              className="text-xs font-medium text-muted-foreground"
            >
              Routine name
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Upper Push, Hotel Dumbbells"
              className="ds-input w-full"
            />
          </div>

          <div className="space-y-2">
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                No exercises yet. Add your first lift below.
              </p>
            ) : (
              rows.map((row, idx) => (
                <div
                  key={row.key}
                  className="space-y-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {row.name}
                    </p>
                    <div className="flex shrink-0 items-center">
                      <IconButton
                        variant="ghost"
                        aria-label={`Move ${row.name} up`}
                        disabled={idx === 0}
                        icon={<ArrowUp className="size-4" aria-hidden="true" />}
                        onClick={() => moveRow(idx, -1)}
                      />
                      <IconButton
                        variant="ghost"
                        aria-label={`Move ${row.name} down`}
                        disabled={idx === rows.length - 1}
                        icon={
                          <ArrowDown className="size-4" aria-hidden="true" />
                        }
                        onClick={() => moveRow(idx, 1)}
                      />
                      <IconButton
                        variant="ghost"
                        aria-label={`Remove ${row.name}`}
                        icon={<Trash2 className="size-4" aria-hidden="true" />}
                        onClick={() => removeRow(idx)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Sets</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        value={row.setCount}
                        onChange={(e) =>
                          updateRow(idx, {
                            setCount: Math.max(
                              1,
                              Number.parseInt(e.target.value, 10) || 1
                            ),
                          })
                        }
                        className="ds-input w-full font-mono tabular-nums"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Reps</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={200}
                        value={row.targetReps}
                        onChange={(e) =>
                          updateRow(idx, {
                            targetReps: Math.max(
                              1,
                              Number.parseInt(e.target.value, 10) || 1
                            ),
                          })
                        }
                        className="ds-input w-full font-mono tabular-nums"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span>Load ({liftUnitLabel(liftUnit)})</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.5"
                        value={row.weightInput}
                        placeholder="0"
                        onChange={(e) =>
                          updateRow(idx, { weightInput: e.target.value })
                        }
                        className="ds-input w-full font-mono tabular-nums"
                      />
                    </label>
                  </div>
                </div>
              ))
            )}

            <Button
              variant="outline"
              fullWidth
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setPickerOpen(true)}
            >
              Add exercise
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={saving}
              onClick={() => void handleSave()}
            >
              Save routine
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ExercisePicker
        open={pickerOpen}
        headerTitle="Add to routine"
        existingExerciseIds={rows
          .map((r) => r.exerciseId)
          .filter((id): id is string => Boolean(id))}
        onSelect={(ex) => addExercises([ex])}
        onMultiSelect={(exs) => addExercises(exs)}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
