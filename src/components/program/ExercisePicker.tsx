import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Search, X, Info, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptic";
import ExerciseDemoCard from "@/components/ExerciseDemoCard";

const CATEGORY_COLORS: Record<string, string> = {
  Chest: "#D4637A",
  Back: "#52A3BD",
  Shoulders: "#D9884E",
  Biceps: "#7B72E9",
  Triceps: "#7B72E9",
  Legs: "#4DB872",
  Core: "#D9884E",
  "Full Body": "#7B72E9",
  Cardio: "#D4637A",
};

interface Props {
  open: boolean;
  onSelect: (exercise: Exercise) => void;
  onMultiSelect?: (exercises: Exercise[]) => void;
  onClose: () => void;
  headerTitle?: string;
}

export default function ExercisePicker({ open, onSelect, onMultiSelect, onClose, headerTitle = "Select Exercise" }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(EXERCISE_CATEGORIES[0]);
  const [demoExercise, setDemoExercise] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredExercises = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return EXERCISE_CATEGORIES.flatMap((cat) =>
        getExercisesByCategory(cat).filter((e) => e.name.toLowerCase().includes(q))
      );
    }
    return getExercisesByCategory(selectedCategory);
  }, [searchQuery, selectedCategory]);

  const allExercises = useMemo(() => {
    return EXERCISE_CATEGORIES.flatMap((cat) => getExercisesByCategory(cat));
  }, []);

  const toggleSelection = (id: string) => {
    haptic("light");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    if (selectedIds.size === 0) { onClose(); return; }
    if (onMultiSelect) {
      onMultiSelect(allExercises.filter((e) => selectedIds.has(e.id)));
    } else {
      for (const id of selectedIds) {
        const ex = allExercises.find((e) => e.id === id);
        if (ex) onSelect(ex);
      }
    }
    setSelectedIds(new Set());
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ zIndex: 9998, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={onClose}
          />

          {/* Full-screen modal panel */}
          <motion.div
            key="picker-modal"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 flex flex-col"
            style={{ zIndex: 9999, backgroundColor: "#FFFFFF" }}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 safe-area-pt">
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
              <p style={{ fontSize: 17, fontWeight: 600, color: "#1C1C1E" }}>{headerTitle}</p>
              <button
                onClick={handleAddSelected}
                style={{ fontSize: 15, fontWeight: 600, color: "#7C6BF0" }}
              >
                Done
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exercises..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted text-foreground text-sm placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Category pills */}
            {!searchQuery && (
              <div className="flex overflow-x-auto gap-1.5 px-4 pb-2" style={{ scrollbarWidth: "none" }}>
                {EXERCISE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {!searchQuery && (
              <div className="px-4 pt-1 pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {selectedCategory} · {filteredExercises.length} exercises
              </div>
            )}

            {/* Exercise list — fills remaining space */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredExercises.map((exercise) => {
                const isSelected = selectedIds.has(exercise.id);
                const catColor = CATEGORY_COLORS[exercise.category] || "#9ca3af";

                return (
                  <div
                    key={exercise.id}
                    className="flex items-center border-b border-border/30 last:border-0 pr-3 transition-colors duration-150"
                    style={{
                      borderLeft: `3px solid ${catColor}`,
                      paddingLeft: 13,
                      paddingTop: 10,
                      paddingBottom: 10,
                      minHeight: 60,
                      ...(isSelected ? { backgroundColor: "rgba(124,58,237,0.04)" } : {}),
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-foreground leading-tight">{exercise.name}</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {exercise.muscleGroup} · {exercise.equipment}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => { haptic("light"); setDemoExercise(exercise.name); }}
                        className="w-11 h-11 flex items-center justify-center shrink-0 rounded-[10px] bg-muted active:scale-90 transition-transform"
                      >
                        <Info className="w-5 h-5 text-muted-foreground" />
                      </button>

                      <motion.button
                        onClick={() => toggleSelection(exercise.id)}
                        whileTap={{ scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className="w-11 h-11 flex items-center justify-center shrink-0 rounded-[10px] transition-colors duration-150"
                        style={{
                          backgroundColor: isSelected ? "#6358D4" : "rgba(124,58,237,0.08)",
                        }}
                      >
                        {isSelected ? (
                          <Check className="w-5 h-5 text-white" />
                        ) : (
                          <Plus className="w-5 h-5" style={{ color: "#6358D4" }} />
                        )}
                      </motion.button>
                    </div>
                  </div>
                );
              })}
              {filteredExercises.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                  No exercises found
                </p>
              )}
            </div>

            {/* Batch selection bar */}
            {selectedIds.size > 0 && (
              <div className="p-4 safe-area-pb" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <motion.button
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddSelected}
                  className="w-full py-3.5 text-white font-medium text-sm flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: "#6358D4",
                    borderRadius: 16,
                    boxShadow: "0 8px 32px rgba(124,58,237,0.3)",
                  }}
                >
                  {selectedIds.size} exercise{selectedIds.size !== 1 ? "s" : ""} selected — Add to workout
                </motion.button>
              </div>
            )}

            <ExerciseDemoCard
              exerciseName={demoExercise ?? ""}
              open={demoExercise !== null}
              onClose={() => setDemoExercise(null)}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
