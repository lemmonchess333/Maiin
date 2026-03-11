import { useState } from "react";
import { Drawer } from "vaul";
import { DndContext, closestCenter, TouchSensor, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import ExercisePicker from "./ExercisePicker";
import type { ProgramExercise } from "@/features/program/programTypes";
import { normalizeExercise } from "@/features/program/programTypes";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Dumbbell, Save } from "lucide-react";
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

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[100]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl max-h-[90vh] overflow-y-auto bg-background safe-area-pb">
          <div className="max-w-md mx-auto p-5 space-y-4">
            <div className="w-10 h-1 rounded-full bg-border mx-auto" />

            <div className="flex items-center justify-between">
              <div>
                <Drawer.Title className="text-base font-semibold text-foreground">
                  Edit {dayName}
                </Drawer.Title>
                <p className="text-xs text-muted-foreground">
                  {exercises.length} exercises · drag to reorder
                </p>
              </div>
            </div>

            {/* Exercise List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map((_, i) => `custom-ex-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {exercises.map((ex, i) => (
                    <SortableExerciseRow key={`custom-ex-${i}`} id={`custom-ex-${i}`} justDropped={justDroppedId === `custom-ex-${i}`}>
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border/50">
                        <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <label className="text-[10px] text-muted-foreground">Sets</label>
                            <input
                              type="number"
                              value={ex.sets}
                              onChange={(e) => updateField(i, "sets", Math.max(1, Number(e.target.value) || 1))}
                              className="w-12 px-1.5 py-0.5 rounded bg-muted border border-border/50 text-xs text-foreground text-center"
                            />
                            <label className="text-[10px] text-muted-foreground">Reps</label>
                            <input
                              type="number"
                              value={ex.reps}
                              onChange={(e) => updateField(i, "reps", Math.max(1, Number(e.target.value) || 1))}
                              className="w-12 px-1.5 py-0.5 rounded bg-muted border border-border/50 text-xs text-foreground text-center"
                            />
                            <label className="text-[10px] text-muted-foreground">kg</label>
                            <input
                              type="number"
                              value={ex.weight || ""}
                              placeholder="BW"
                              onChange={(e) => updateField(i, "weight", Math.max(0, Number(e.target.value) || 0))}
                              className="w-14 px-1.5 py-0.5 rounded bg-muted border border-border/50 text-xs text-foreground text-center placeholder:text-muted-foreground"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeExercise(i)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </SortableExerciseRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Exercise */}
            {showPicker ? (
              <ExercisePicker
                onSelect={addExercise}
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
              {saving ? "Saving..." : "Save Custom Day"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
