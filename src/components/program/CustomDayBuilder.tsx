import { useState } from "react";
import { Drawer } from "vaul";
import { DndContext, closestCenter, TouchSensor, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import ExercisePicker from "./ExercisePicker";
import type { ProgramExercise } from "@/features/program/programTypes";
import { normalizeExercise } from "@/features/program/programTypes";
import type { Exercise } from "@/lib/exercises";
import { getExerciseById } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Plus, Dumbbell, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  dayIndex: number;
  dayName: string;
  exercises: ProgramExercise[];
  onSave: (dayIndex: number, exercises: ProgramExercise[], isCustom: boolean) => Promise<void>;
}

export default function CustomDayBuilder({ open, onClose, dayIndex, dayName, exercises: initialExercises, onSave }: Props) {
  const [exercises, setExercises] = useState<ProgramExercise[]>(initialExercises);
  const [showPicker, setShowPicker] = useState(false);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = exercises.findIndex((_, i) => `custom-ex-${i}` === active.id);
    const newIdx = exercises.findIndex((_, i) => `custom-ex-${i}` === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setExercises(arrayMove(exercises, oldIdx, newIdx));
    setJustDroppedId(`custom-ex-${newIdx}`);
    setTimeout(() => setJustDroppedId(null), 300);
  };

  const addExercise = (exercise: Exercise) => {
    setExercises((prev) => [...prev, normalizeExercise({
      name: exercise.name, exerciseId: exercise.id, movementCategory: "horizontal_push", sets: 3, reps: 10, weight: 0,
    })]);
    setShowPicker(false);
  };

  const addMultipleExercises = (exerciseList: Exercise[]) => {
    setExercises((prev) => [...prev, ...exerciseList.map((exercise) =>
      normalizeExercise({ name: exercise.name, exerciseId: exercise.id, movementCategory: "horizontal_push", sets: 3, reps: 10, weight: 0 })
    )]);
    setShowPicker(false);
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: "sets" | "reps" | "weight", value: number) => {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(dayIndex, exercises, true);
      toast.success("Day customised — this day is now yours");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getWeightDisplay = (ex: ProgramExercise): number => {
    if (ex.weight > 0) return ex.weight;
    if (ex.lastAttemptedWeight > 0) return ex.lastAttemptedWeight;
    if (ex.lastSuccessfulWeight > 0) return ex.lastSuccessfulWeight;
    return 0;
  };

  const isBodyweight = (ex: ProgramExercise): boolean => {
    return getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
  };

  const inputClass = "h-[30px] rounded-lg bg-muted text-center text-[14px] font-bold font-mono tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-primary/5 transition-colors";

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl max-h-[90vh] flex flex-col bg-background safe-area-pb">
          {/* Header */}
          <div className="px-5 pt-5 pb-2">
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
            <Drawer.Title className="text-base font-semibold text-foreground">
              Edit {dayName}
            </Drawer.Title>
            <p className="text-xs text-muted-foreground">
              {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · drag to reorder · swipe to delete
            </p>
          </div>

          {/* Column headers */}
          {exercises.length > 0 && (
            <div className="flex items-center px-5 pb-1">
              {/* Offset for drag handle + icon */}
              <div className="ml-[100px] flex items-center gap-1.5">
                <span className="w-[38px] text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">S</span>
                <span className="w-[38px] text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">R</span>
                <span className="w-[52px] text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">W</span>
              </div>
            </div>
          )}

          {/* Scrollable exercise list + picker */}
          <div className="flex-1 overflow-y-auto min-h-0 px-5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map((_, i) => `custom-ex-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {exercises.map((ex, i) => {
                    const weightVal = getWeightDisplay(ex);
                    const isBW = isBodyweight(ex);
                    const prev = ex.lastPerformance;

                    return (
                      <SortableExerciseRow
                        key={`custom-ex-${i}`}
                        id={`custom-ex-${i}`}
                        justDropped={justDroppedId === `custom-ex-${i}`}
                        onDelete={() => removeExercise(i)}
                      >
                        <div className="rounded-xl bg-muted px-2.5 py-2">
                          {/* Name row + prev data */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Dumbbell className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <p className="text-[13px] font-medium text-foreground truncate flex-1">{ex.name}</p>
                            {prev && (
                              <span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0 opacity-60">
                                prev {prev.sets}×{prev.reps}{prev.weight > 0 ? ` @ ${prev.weight}` : ""}
                              </span>
                            )}
                          </div>

                          {/* S / R / W inputs */}
                          <div className="flex items-center gap-1.5 mt-1.5 ml-10">
                            <input
                              id={`custom-sets-${i}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={ex.sets}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v)) updateField(i, "sets", Math.max(1, Math.min(20, v)));
                              }}
                              className={cn(inputClass, "w-[38px]")}
                            />
                            <input
                              id={`custom-reps-${i}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={ex.reps}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v)) updateField(i, "reps", Math.max(1, Math.min(100, v)));
                              }}
                              className={cn(inputClass, "w-[38px]")}
                            />
                            <div className="flex items-center gap-1">
                              <input
                                id={`custom-weight-${i}`}
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.]*"
                                value={weightVal || ""}
                                placeholder={isBW ? "BW" : "0"}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  updateField(i, "weight", isNaN(v) ? 0 : Math.max(0, v));
                                }}
                                className={cn(inputClass, "w-[52px] placeholder:text-muted-foreground/50")}
                              />
                              <span className="text-[11px] text-muted-foreground">kg</span>
                            </div>
                          </div>
                        </div>
                      </SortableExerciseRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {showPicker && (
              <div className="mt-3">
                <ExercisePicker
                  onSelect={addExercise}
                  onMultiSelect={addMultipleExercises}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Footer — always visible */}
          <div className="px-5 pt-3 pb-5 space-y-3 border-t border-border/50">
            {!showPicker && (
              <button
                onClick={() => setShowPicker(true)}
                className="w-full py-3 rounded-xl bg-primary/5 border border-primary/20 text-primary font-medium text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Exercise
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || exercises.length === 0}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                saving ? "opacity-50 cursor-not-allowed" : "",
                "bg-primary text-primary-foreground"
              )}
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
