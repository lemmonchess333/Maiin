import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useWorkouts, type WorkoutExercise } from "@/hooks/useWorkouts";
import { EXERCISE_CATEGORIES, getExercisesByCategory, getExerciseById } from "@/lib/exercises";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import {
  Dumbbell,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  Flame,
  X,
  Search,
  Timer,
  Info,
} from "lucide-react";
import ExerciseDemoCard from "./ExerciseDemoCard";

interface Props {
  date: string;
  onSaved?: () => void;
}

export default function WorkoutLogger({ date, onSaved }: Props) {
  const { profile } = useAuth();
  const { saveWorkout, calculateExerciseCalories } = useWorkouts();
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("Chest");
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [demoExercise, setDemoExercise] = useState<string | null>(null);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());

  const userWeight = profile?.weightKg || 70;

  const isCardio = (category: string) => category === "Cardio";

  const addMultipleExercises = (ids: string[]) => {
    const newExercises: WorkoutExercise[] = [];
    for (const exerciseId of ids) {
      const exercise = getExerciseById(exerciseId);
      if (!exercise) continue;
      const cardio = isCardio(exercise.category);
      newExercises.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        category: exercise.category,
        sets: cardio ? [] : [{ setNumber: 1, reps: 10, weightKg: 0 }],
        caloriesBurned: 0,
        ...(cardio ? { durationMinutes: 20, distanceKm: 0 } : {}),
      });
    }
    if (newExercises.length === 0) return;
    setExercises((prev) => [...prev, ...newExercises]);
    setExpandedExercise(exercises.length);
    setShowPicker(false);
    setSearchQuery("");
    setSelectedExerciseIds(new Set());
  };

  const toggleExerciseSelection = (id: string) => {
    setSelectedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setExpandedExercise(null);
  };

  const addSet = (exerciseIndex: number) => {
    setExercises((prev) => {
      const updated = [...prev];
      const lastSet = updated[exerciseIndex].sets[updated[exerciseIndex].sets.length - 1];
      updated[exerciseIndex].sets.push({
        setNumber: updated[exerciseIndex].sets.length + 1,
        reps: lastSet?.reps || 10,
        weightKg: lastSet?.weightKg || 0,
      });
      return updated;
    });
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[exerciseIndex].sets = updated[exerciseIndex].sets
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, setNumber: i + 1 }));
      return updated;
    });
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: "reps" | "weightKg",
    value: number
  ) => {
    setExercises((prev) => {
      const updated = [...prev];
      const clamped = Math.max(0, Math.min(field === "reps" ? 100 : 999, value));
      updated[exerciseIndex].sets[setIndex][field] = clamped;
      updated[exerciseIndex].caloriesBurned = calculateExerciseCalories(
        updated[exerciseIndex].exerciseId,
        updated[exerciseIndex].sets,
        userWeight
      );
      return updated;
    });
  };

  const updateCardioField = (
    exerciseIndex: number,
    field: "durationMinutes" | "distanceKm",
    value: number
  ) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[exerciseIndex] = { ...updated[exerciseIndex], [field]: value };
      const ex = getExerciseById(updated[exerciseIndex].exerciseId);
      const duration = updated[exerciseIndex].durationMinutes || 0;
      updated[exerciseIndex].caloriesBurned = Math.round(
        (ex?.caloriesPerMinute || 8) * duration * (1 + (userWeight / 100) * 0.3)
      );
      return updated;
    });
  };

  const totalCalories = exercises.reduce((sum, e) => sum + e.caloriesBurned, 0);

  const handleSave = async () => {
    if (exercises.length === 0) return;

    // Validate cardio exercises have duration
    const invalidCardio = exercises.filter(e => isCardio(e.category) && !e.durationMinutes);
    if (invalidCardio.length > 0) {
      const { toast } = await import("sonner");
      toast.error("Enter a duration for cardio exercises");
      return;
    }

    // Filter out strength exercises with no sets
    const validExercises = exercises.filter(e => isCardio(e.category) || e.sets.length > 0);
    if (validExercises.length === 0) return;
    if (validExercises.length < exercises.length) {
      const { toast } = await import("sonner");
      toast.warning("Removed exercises with no sets");
    }

    setSaving(true);

    const durationEstimate = validExercises.reduce((sum, e) => {
      if (isCardio(e.category)) return sum + (e.durationMinutes || 0);
      return sum + e.sets.length * 2.5;
    }, 0);

    try {
      await saveWorkout({
        date,
        exercises: validExercises,
        totalCalories,
        durationMinutes: Math.round(durationEstimate),
        notes,
      });

      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setExercises([]);
        setNotes("");
        onSaved?.();
      }, 1500);
    } catch {
      setSaving(false);
      const { toast } = await import("sonner");
      toast.error("Failed to save workout. Please try again.");
    }
  };

  const filteredExercises = useMemo(() =>
    searchQuery
      ? getExercisesByCategory(selectedCategory).filter((e) =>
          e.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : getExercisesByCategory(selectedCategory),
    [searchQuery, selectedCategory]
  );

  const allFiltered = useMemo(() =>
    searchQuery
      ? (() => {
          const q = searchQuery.toLowerCase();
          return EXERCISE_CATEGORIES.flatMap((cat) =>
            getExercisesByCategory(cat).filter((e) =>
              e.name.toLowerCase().includes(q)
            )
          );
        })()
      : null,
    [searchQuery]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Workout Tracker</h2>
        </div>
        {totalCalories > 0 && (
          <div className="flex items-center gap-1 text-sm text-orange-500 font-medium">
            <Flame className="w-4 h-4" />
            {totalCalories} cal
          </div>
        )}
      </div>

      {/* Empty state */}
      {exercises.length === 0 && !showPicker && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
            <Dumbbell className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground/60 text-center">Your workout is empty — tap + Add Exercise below to get started.</p>
        </div>
      )}

      {/* Exercise List */}
      {exercises.map((exercise, exIndex) => (
        <div
          key={exIndex}
          className={`bg-card rounded-2xl overflow-hidden${expandedExercise === exIndex ? ' accent-edge' : ''}`}
          style={expandedExercise === exIndex ? { '--accent-edge-color': THEME.lifting } as React.CSSProperties : undefined}
        >
          <button
            onClick={() =>
              setExpandedExercise(expandedExercise === exIndex ? null : exIndex)
            }
            className="w-full flex items-center justify-between p-4"
          >
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-foreground">
                {exercise.exerciseName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCardio(exercise.category)
                  ? `${exercise.durationMinutes || 0} min${exercise.distanceKm ? ` · ${exercise.distanceKm}km` : ""}`
                  : `${exercise.sets.length} ${exercise.sets.length === 1 ? "set" : "sets"}`}
                {exercise.caloriesBurned > 0 && ` · ${exercise.caloriesBurned} cal`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeExercise(exIndex);
                }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {expandedExercise === exIndex ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {expandedExercise === exIndex && (
            <div className="px-4 pb-4 space-y-3">
              {isCardio(exercise.category) ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor={`cardio-duration-${exIndex}`} className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="w-3 h-3" /> Duration (min)
                      </label>
                      <input
                        id={`cardio-duration-${exIndex}`}
                        type="number"
                        value={exercise.durationMinutes || ""}
                        onChange={(e) =>
                          updateCardioField(exIndex, "durationMinutes", Number(e.target.value) || 0)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cardio-distance-${exIndex}`} className="text-xs text-muted-foreground">Distance (km)</label>
                      <input
                        id={`cardio-distance-${exIndex}`}
                        type="number"
                        step="0.1"
                        value={exercise.distanceKm || ""}
                        onChange={(e) =>
                          updateCardioField(exIndex, "distanceKm", Number(e.target.value) || 0)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Intensity (optional)</span>
                    <div className="flex gap-2">
                      {(["low", "moderate", "high"] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => {
                            setExercises((prev) => {
                              const updated = [...prev];
                              updated[exIndex] = {
                                ...updated[exIndex],
                                intensity: updated[exIndex].intensity === level ? undefined : level,
                              };
                              return updated;
                            });
                          }}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            exercise.intensity === level
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border/50 hover:text-foreground"
                          )}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                    <div className="col-span-2">Set</div>
                    <div className="col-span-4">Reps</div>
                    <div className="col-span-4">Weight (kg)</div>
                    <div className="col-span-2"></div>
                  </div>

                  {exercise.sets.map((set, setIndex) => (
                    <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 text-sm font-medium text-center text-muted-foreground">
                        {set.setNumber}
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) =>
                            updateSet(exIndex, setIndex, "reps", Number(e.target.value))
                          }
                          className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          value={set.weightKg}
                          onChange={(e) =>
                            updateSet(exIndex, setIndex, "weightKg", Number(e.target.value))
                          }
                          className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        {exercise.sets.length > 1 && (
                          <button
                            onClick={() => removeSet(exIndex, setIndex)}
                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(exIndex)}
                    className="w-full py-2 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Set
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add Exercise Button */}
      {!showPicker && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowPicker(true)}
          className="w-full py-3 rounded-xl bg-primary/5 border border-primary/20 text-primary font-medium text-sm transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Exercise
        </motion.button>
      )}

      {/* Exercise Picker */}
      {showPicker && (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="p-3 border-b border-border/50 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Select Exercise</p>
            <button
              onClick={() => {
                setShowPicker(false);
                setSearchQuery("");
                setSelectedExerciseIds(new Set());
              }}
              className="p-1 rounded-lg hover:bg-muted"
            >
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
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {!searchQuery && (
            <div className="flex overflow-x-auto gap-1 p-2 border-b border-border/50">
              {EXERCISE_CATEGORIES.map((cat) => (
                <motion.button
                  key={cat}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    selectedCategory === cat
                      ? "text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  style={selectedCategory === cat ? { backgroundColor: THEME.lifting } : undefined}
                >
                  {cat}
                </motion.button>
              ))}
            </div>
          )}

          {!searchQuery && (
            <div
              style={{
                padding: '12px 20px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: '#9ca3af',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              {selectedCategory} · {filteredExercises.length} exercises
            </div>
          )}

          <div
            className="max-h-64 overflow-y-auto"
            style={selectedExerciseIds.size > 0 ? { paddingBottom: 8 } : undefined}
          >
            {(allFiltered || filteredExercises).map((exercise) => (
              <div
                key={exercise.id}
                className="flex items-center border-b border-border/30 last:border-0 px-4 py-2.5 transition-colors duration-150"
                style={
                  selectedExerciseIds.has(exercise.id)
                    ? { backgroundColor: 'rgba(124,58,237,0.04)' }
                    : undefined
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exercise.muscleGroup} · {exercise.equipment}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    onClick={() => setDemoExercise(exercise.name)}
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: 'rgba(0,0,0,0.03)',
                    }}
                  >
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => toggleExerciseSelection(exercise.id)}
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: selectedExerciseIds.has(exercise.id)
                        ? '#6358D4'
                        : 'rgba(124,58,237,0.08)',
                    }}
                  >
                    {selectedExerciseIds.has(exercise.id) ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Plus className="w-4 h-4" style={{ color: '#6358D4' }} />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {(allFiltered || filteredExercises).length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No exercises found
              </p>
            )}
          </div>

          {selectedExerciseIds.size > 0 && (
            <div className="p-3">
              <motion.button
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => addMultipleExercises(Array.from(selectedExerciseIds))}
                className="w-full py-3 text-white font-medium text-sm flex items-center justify-center gap-2"
                style={{
                  backgroundColor: '#7B72E9',
                  borderRadius: 16,
                }}
              >
                {selectedExerciseIds.size} exercise{selectedExerciseIds.size !== 1 ? 's' : ''} selected — Add to workout
              </motion.button>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {exercises.length > 0 && (
        <div className="bg-card rounded-2xl p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Workout Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the workout feel?"
            rows={2}
            className="w-full px-4 py-2 rounded-xl bg-muted text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>
      )}

      {/* Exercise Demo */}
      <ExerciseDemoCard
        exerciseName={demoExercise ?? ""}
        open={!!demoExercise}
        onClose={() => setDemoExercise(null)}
      />

      {/* Save Button */}
      {exercises.length > 0 && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
            saved
              ? "bg-green-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" /> Workout Saved!
            </>
          ) : saving ? (
            "Saving..."
          ) : (
            <>
              Save Workout · {totalCalories} cal burned
            </>
          )}
        </motion.button>
      )}
    </div>
  );
}
