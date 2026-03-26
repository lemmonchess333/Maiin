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
import { Plus, Save } from "lucide-react";
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

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl max-h-[90vh] flex flex-col safe-area-pb"
          style={{ backgroundColor: "#F2F2F7" }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-2">
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: "#C7C7CC" }} />
            <Drawer.Title style={{ fontSize: 17, fontWeight: 600, color: "#1C1C1E" }}>
              Edit {dayName}
            </Drawer.Title>
            <p style={{ fontSize: 13, color: "#8E8E93", marginTop: 2 }}>
              {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · drag to reorder · swipe to delete
            </p>
          </div>

          {/* S / R / W column headers — single row at sheet level */}
          {exercises.length > 0 && (
            <div className="flex items-center px-4 pb-1.5" style={{ paddingLeft: 40 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                <span style={{ width: 64, textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#8E8E93" }}>S</span>
                <span style={{ width: 64, textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#8E8E93" }}>R</span>
                <span style={{ width: 64, textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#8E8E93" }}>W</span>
              </div>
            </div>
          )}

          {/* Scrollable exercise list + picker */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map((_, i) => `custom-ex-${i}`)} strategy={verticalListSortingStrategy}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                        <div style={{ backgroundColor: "#FFFFFF", borderRadius: 10, padding: "10px 12px" }}>
                          {/* Exercise name + prev data */}
                          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                            <p className="truncate flex-1" style={{ fontSize: 16, fontWeight: 700, color: "#1C1C1E", lineHeight: 1.2 }}>{ex.name}</p>
                            {prev && (
                              <span className="font-mono tabular-nums shrink-0" style={{ fontSize: 10, color: "#AEAEB2" }}>
                                prev {prev.sets}×{prev.reps}{prev.weight > 0 ? ` @ ${prev.weight}` : ""}
                              </span>
                            )}
                          </div>

                          {/* Input row — compact fixed-width fields */}
                          <div className="flex items-center" style={{ gap: 6 }}>
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
                              className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                              style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: "#1C1C1E" }}
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
                              className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                              style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: "#1C1C1E" }}
                            />
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
                              className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                              style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: weightVal ? "#1C1C1E" : "#C7C7CC" }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#AEAEB2", width: 20, textAlign: "center", flexShrink: 0 }}>kg</span>
                          </div>
                        </div>
                      </SortableExerciseRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Footer — always visible */}
          <div className="px-4 pt-3 pb-5 space-y-3" style={{ backgroundColor: "#F2F2F7" }}>
            <button
              onClick={() => setShowPicker(true)}
              className="w-full py-3 text-center active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: "#FFFFFF", borderRadius: 10, border: "none", color: "#7C6BF0", fontWeight: 500, fontSize: 15 }}
            >
              <Plus className="w-4 h-4" /> Add Exercise
            </button>
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
        <ExercisePicker
          open={showPicker}
          onSelect={addExercise}
          onMultiSelect={addMultipleExercises}
          onClose={() => setShowPicker(false)}
        />
      </Drawer.Portal>
    </Drawer.Root>
  );
}
