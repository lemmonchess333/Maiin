import { useState, useEffect } from "react";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import WorkoutLogger from "@/components/WorkoutLogger";
import { ManualFoodLogger } from "@/components/ManualFoodLogger";
import { useMeals } from "@/hooks/useMeals";
import FoodAnalyzer from "@/components/FoodAnalyzer";
import {
  Dumbbell,
  UtensilsCrossed,
  Trophy,
  Scale,
  NotebookPen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Trash2,
} from "lucide-react";

export default function Log() {
  const { profile, updateProfile } = useAuth();
  const { logs, saveLog } = useDailyLogs();
  const { getWorkoutsForDate, deleteWorkout } = useWorkouts();

  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [workoutCount, setWorkoutCount] = useState(0);
  const [meals, setMeals] = useState(0);
  const [hasPR, setHasPR] = useState(false);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"workout" | "food" | "quick">("workout");

  const todaysWorkouts = getWorkoutsForDate(selectedDate);

  const { getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const dailyTotals = getDailyTotals(selectedDate);

  useEffect(() => {
    const existing = logs.find((l) => l.date === selectedDate);

    if (existing) {
      setWorkoutCount(existing.workouts);
      setMeals(existing.meals);
      setHasPR(existing.hasPR);
      setWeightKg(existing.weightKg);
      setNotes(existing.notes || "");
    } else {
      setWorkoutCount(0);
      setMeals(0);
      setHasPR(false);
      setWeightKg(undefined);
      setNotes("");
    }

    setSaved(false);
  }, [selectedDate, logs]);

  // Update streak helper
  const updateStreak = async () => {
    if (!profile) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
    let newStreak = profile.currentStreak || 0;

    if (selectedDate === today) {
      if (profile.lastLogDate === yesterday || profile.lastLogDate === today) {
        if (profile.lastLogDate !== today) {
          newStreak += 1;
        }
      } else {
        newStreak = 1;
      }
      await updateProfile({
        currentStreak: newStreak,
        lastLogDate: today,
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);

    await saveLog({
      date: selectedDate,
      workouts: workoutCount,
      meals,
      hasPR,
      weightKg,
      notes,
    });

    await updateStreak();

    setSaving(false);
    setSaved(true);
    toast.success("Log saved!");

    // Confetti on PR
    if (hasPR) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f59e0b"],
      });
    }

    setTimeout(() => setSaved(false), 2000);
  };

  // Called when WorkoutLogger saves a workout
  const handleWorkoutSaved = async () => {
    await updateStreak();
    toast.success("Workout logged!");
  };

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(format(d, "yyyy-MM-dd"));
  };

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Log Activity</h1>
        <p className="text-sm text-muted-foreground">
          Record your daily progress
        </p>
      </div>

      {/* Date Switcher */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border/50 p-3">
        <button
          onClick={() => changeDate(-1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>

        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isToday
              ? "Today"
              : format(new Date(selectedDate), "EEE, MMM d")}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(selectedDate), "MMMM d, yyyy")}
          </p>
        </div>

        <button
          onClick={() => changeDate(1)}
          disabled={isToday}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isToday ? "opacity-30 cursor-not-allowed" : "hover:bg-muted"
          )}
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-muted rounded-xl p-1">
        <button
          onClick={() => setActiveTab("workout")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === "workout"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <Dumbbell className="w-4 h-4" /> Workout
        </button>

        <button
          onClick={() => setActiveTab("food")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === "food"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <UtensilsCrossed className="w-4 h-4" /> Food
        </button>

        <button
          onClick={() => setActiveTab("quick")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === "quick"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <NotebookPen className="w-4 h-4" /> Quick
        </button>
      </div>

      {/* Workout Tab */}
      {activeTab === "workout" && (
        <div className="space-y-4">
          {todaysWorkouts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Saved Workouts
              </p>

              {todaysWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="bg-card rounded-xl border border-border/50 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium text-foreground">
                        {w.exercises.length} exercise
                        {w.exercises.length !== 1 && "s"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                        <Flame className="w-3.5 h-3.5" />
                        {w.totalCalories} cal
                      </div>

                      <button
                        onClick={() => deleteWorkout(w.id)}
                        className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {w.exercises.map((ex, i) => (
                      <p
                        key={i}
                        className="text-xs text-muted-foreground"
                      >
                        {ex.exerciseName} — {ex.sets.length} sets ·{" "}
                        {ex.caloriesBurned} cal
                      </p>
                    ))}
                  </div>

                  {w.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {w.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <WorkoutLogger date={selectedDate} onSaved={handleWorkoutSaved} />
        </div>
      )}

      {/* Food Tab */}
      {activeTab === "food" && (
        <div className="space-y-4">
          {todaysMeals.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Daily Totals</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2">
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{dailyTotals.calories}</p>
                  <p className="text-xs text-orange-500">cal</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{dailyTotals.protein}g</p>
                  <p className="text-xs text-blue-500">protein</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{dailyTotals.carbs}g</p>
                  <p className="text-xs text-amber-500">carbs</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2">
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{dailyTotals.fat}g</p>
                  <p className="text-xs text-purple-500">fat</p>
                </div>
              </div>
            </div>
          )}
          {todaysMeals.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Saved Meals</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="bg-card rounded-xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{m.foodName}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-orange-500 font-medium">{m.totalCalories} cal</p>
                      <button onClick={() => deleteMeal(m.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>P: {m.totalProtein}g</span>
                    <span>C: {m.totalCarbs}g</span>
                    <span>F: {m.totalFat}g</span>
                  </div>
                  {m.items.length > 1 && (
                    <div className="mt-2 space-y-1">
                      {m.items.map((item, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{item.name} ({item.portionSize}) - {item.calories} cal</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Manual Food Logger — always available (Free feature) */}
          <ManualFoodLogger />

          {/* AI Food Analyzer */}
          <FoodAnalyzer date={selectedDate} />
        </div>
      )}

      {/* Quick Log Tab */}
      {activeTab === "quick" && (
        <div className="space-y-6">
          {/* Workouts */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Workouts
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setWorkoutCount(n)}
                    className={cn(
                      "w-10 h-10 rounded-lg font-medium text-sm transition-all",
                      workoutCount === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {n}
                  </motion.button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Target: {profile?.weeklyWorkoutsTarget || 4}/week
              </p>
            </div>
          </div>

          {/* Protein Meals */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Protein Meals
              </p>
            </div>

            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMeals(n)}
                  className={cn(
                    "w-10 h-10 rounded-lg font-medium text-sm transition-all",
                    meals === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {n}
                </motion.button>
              ))}
            </div>
          </div>

          {/* PR Toggle */}
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <button
              onClick={() => setHasPR(!hasPR)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Trophy
                  className={cn(
                    "w-4 h-4",
                    hasPR ? "text-yellow-500" : "text-muted-foreground"
                  )}
                />
                <p className="text-sm font-medium text-foreground">
                  New Personal Record?
                </p>
              </div>

              <div
                className={cn(
                  "w-12 h-7 rounded-full transition-all flex items-center",
                  hasPR
                    ? "bg-primary justify-end"
                    : "bg-muted justify-start"
                )}
              >
                <div className="w-5 h-5 bg-white rounded-full mx-1 shadow-sm" />
              </div>
            </button>
          </div>

          {/* Weight */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Weight Check-in (optional)
              </p>
            </div>

            <input
              type="number"
              value={weightKg ?? ""}
              onChange={(e) =>
                setWeightKg(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              placeholder={`${profile?.weightKg || 70} kg`}
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Notes */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Notes</p>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it go today?"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Save Button */}
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
                <Check className="w-4 h-4" /> Saved!
              </>
            ) : saving ? (
              "Saving..."
            ) : (
              "Save Log"
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}
