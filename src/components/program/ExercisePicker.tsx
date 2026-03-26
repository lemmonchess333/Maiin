import { useState, useMemo } from "react";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Search, X, Info, Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
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
  onSelect: (exercise: Exercise) => void;
  onMultiSelect?: (exercises: Exercise[]) => void;
  onClose: () => void;
}

export default function ExercisePicker({ onSelect, onMultiSelect, onClose }: Props) {
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

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Select Exercise</p>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted active:scale-95 transition-transform">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted text-foreground text-sm placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {!searchQuery && (
        <div className="flex overflow-x-auto gap-1 p-2 border-b border-border/50">
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
        <div className="px-4 pt-3 pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {selectedCategory} · {filteredExercises.length} exercises
        </div>
      )}

      <div
        className="max-h-80 overflow-y-auto"
        style={selectedIds.size > 0 ? { paddingBottom: 8 } : undefined}
      >
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

      {selectedIds.size > 0 && (
        <div className="p-3">
          <motion.button
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleAddSelected}
            className="w-full py-3 text-white font-medium text-sm flex items-center justify-center gap-2"
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
    </div>
  );
}
