import { useState, useMemo } from "react";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Search, X, Info } from "lucide-react";
import ExerciseDemoCard from "@/components/ExerciseDemoCard";

interface Props {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export default function ExercisePicker({ onSelect, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(EXERCISE_CATEGORIES[0]);
  const [demoExercise, setDemoExercise] = useState<string | null>(null);

  const filteredExercises = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return EXERCISE_CATEGORIES.flatMap((cat) =>
        getExercisesByCategory(cat).filter((e) =>
          e.name.toLowerCase().includes(q)
        )
      );
    }
    return getExercisesByCategory(selectedCategory);
  }, [searchQuery, selectedCategory]);

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Select Exercise</p>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
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
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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

      <div className="max-h-64 overflow-y-auto">
        {filteredExercises.map((exercise) => (
          <div
            key={exercise.id}
            className="flex items-center border-b border-border/30 last:border-0"
          >
            <button
              onClick={() => onSelect(exercise)}
              className="flex-1 text-left px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <p className="text-sm font-medium text-foreground">{exercise.name}</p>
              <p className="text-xs text-muted-foreground">
                {exercise.muscleGroup} · {exercise.equipment}
              </p>
            </button>
            <button
              onClick={() => setDemoExercise(exercise.name)}
              className="p-3 text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        ))}
        {filteredExercises.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No exercises found
          </p>
        )}
      </div>

      <ExerciseDemoCard
        exerciseName={demoExercise}
        onClose={() => setDemoExercise(null)}
      />
    </div>
  );
}
