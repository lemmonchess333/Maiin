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
  const [focusedWeightIdx, setFocusedWeightIdx] = useState<number | null>(null);

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
    const newEx = normalizeExercise({
      name: exercise.name,
      exerciseId: exercise.id,
      movementCategory: "horizontal_push",
      sets: 3,
      reps: 10,
      weight: 0,
    });
    setExercises((prev) => [...prev, newEx]);
    setShowPicker(false);
  };

  const addMultipleExercises = (exerciseList: Exercise[]) => {
    const newExercises = exerciseList.map((exercise) =>
      normalizeExercise({
        name: exercise.name,
        exerciseId: exercise.id,
        movementCategory: "horizontal_push",
        sets: 3,
        reps: 10,
        weight: 0,
      })
    );
    setExercises((prev) => [...prev, ...newExercises]);
    setShowPicker(false);
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: "sets" | "reps" | "weight", value: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
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

  const getWeightPlaceholder = (ex: ProgramExercise): string => {
    const isBodyweight = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
    return isBodyweight ? "BW" : "—";
  };

  const inputClass = "h-[32px] rounded-lg border border-[#E5E5EA] bg-[#F8F8FA] text-center text-[15px] font-bold font-mono tabular-nums text-foreground focus:outline-none focus:border-primary focus:bg-primary/5 transition-colors";

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl max-h-[90vh] overflow-y-auto bg-background safe-area-pb">
          <div className="max-w-md mx-auto p-5 space-y-4">
            <div className="w-10 h-1 rounded-full bg-border mx-auto" />

            <div className="flex items-center justify-between">
              <div>
                <Drawer.Title className="text-base font-semibold text-foreground">
                  Edit {dayName}
                </Drawer.Title>
                <p className="text-xs text-muted-foreground">
                  {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · drag to reorder · swipe to delete
                </p>
              </div>
            </div>

            {/* Exercise List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map((_, i) => `custom-ex-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2.5">
                  {exercises.map((ex, i) => {
                    const weightVal = getWeightDisplay(ex);
                    const placeholder = getWeightPlaceholder(ex);
                    const isWeightFocused = focusedWeightIdx === i;
                    const showPlaceholder = !isWeightFocused && weightVal === 0;

                    return (
                      <SortableExerciseRow
                        key={`custom-ex-${i}`}
                        id={`custom-ex-${i}`}
                        justDropped={justDroppedId === `custom-ex-${i}`}
                        onDelete={() => removeExercise(i)}
                      >
                        <div
                          className="rounded-[14px] border border-[#E5E5EA] bg-card"
                          style={{ padding: "14px 12px" }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Dumbbell className="w-4 h-4 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground truncate flex-1">{ex.name}</p>
                          </div>

                          {/* Compact inline: Sets [4] × Reps [6] @ [50] kg */}
                          <div className="flex items-center gap-1.5 mt-2.5 ml-[46px]">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sets</span>
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
                            <span className="text-xs" style={{ color: "#E5E5EA" }}>×</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Reps</span>
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
                            <span className="text-xs" style={{ color: "#E5E5EA" }}>@</span>

                            {/* Weight field with placeholder overlay */}
                            <div className="relative">
                              <input
                                id={`custom-weight-${i}`}
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.]*"
                                value={weightVal || ""}
                                onFocus={() => setFocusedWeightIdx(i)}
                                onBlur={() => setFocusedWeightIdx(null)}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  updateField(i, "weight", isNaN(v) ? 0 : Math.max(0, v));
                                }}
                                className={cn(inputClass, "w-[52px]")}
                              />
                              {showPlaceholder && (
                                <span
                                  className="absolute inset-0 flex items-center justify-center text-[15px] font-bold font-mono pointer-events-none"
                                  style={{ color: "#8E8E93", opacity: 0.5 }}
                                >
                                  {placeholder}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">kg</span>
                          </div>
                        </div>
                      </SortableExerciseRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Exercise */}
            {showPicker ? (
              <ExercisePicker
                onSelect={addExercise}
                onMultiSelect={addMultipleExercises}
                onClose={() => setShowPicker(false)}
              />
            ) : (
              <button
                onClick={() => setShowPicker(true)}
                className="w-full py-3 rounded-xl bg-primary/5 border border-primary/20 text-primary font-medium text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Exercise
              </button>
            )}

            {/* Save */}
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
