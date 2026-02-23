import { useState, useEffect, useRef } from "react";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import WorkoutLogger from "@/components/WorkoutLogger";
import { ManualFoodLogger } from "@/components/ManualFoodLogger";
import FoodSearch from "@/components/FoodSearch";
import { useMeals } from "@/hooks/useMeals";
import FoodAnalyzer from "@/components/FoodAnalyzer";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Dumbbell,
  UtensilsCrossed,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Flame,
  Trash2,
  CalendarDays,
  Search,
  Beef,
  Wheat,
  Cookie,
} from "lucide-react";

export default function Log() {
  const { user, profile, updateProfile } = useAuth();
  const { logs, saveLog } = useDailyLogs();
  const { getWorkoutsForDate, deleteWorkout } = useWorkouts();

  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [hasPR, setHasPR] = useState(false);
  const [activeTab, setActiveTab] = useState<"workout" | "food">("workout");
  const [showFoodSearch, setShowFoodSearch] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const todaysWorkouts = getWorkoutsForDate(selectedDate);

  const { getMealsForDate, getDailyTotals, deleteMeal } = useMeals();
  const todaysMeals = getMealsForDate(selectedDate);
  const dailyTotals = getDailyTotals(selectedDate);

  const safeNum = (value: any): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? 0 : num;
  };

  // Light pastel macro style (exact match to Today's Intake on Home)
  const macroColors = {
    calories: "#f97316",
    protein: "#3b82f6",
    carbs: "#f59e0b",
    fat: "#a855f6",
  };

  const tint = (hex: string, factor: number = 0.85): string => {
    if (!hex || !hex.startsWith("#")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
    const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
    const newB = Math.min(255, Math.floor(b + (255 - b) * factor));

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  };

  // Load existing PR state for selected date
  useEffect(() => {
    const existing = logs.find((l) => l.date === selectedDate);
    setHasPR(existing?.hasPR ?? false);
  }, [selectedDate, logs]);

  // Auto-save daily log when workouts or meals change
  useEffect(() => {
    const workoutCount = todaysWorkouts.length;
    const mealCount = todaysMeals.length;
    if (workoutCount === 0 && mealCount === 0) return;

    saveLog({
      date: selectedDate,
      workouts: workoutCount,
      meals: mealCount,
      hasPR,
      notes: "",
    });
  }, [todaysWorkouts.length, todaysMeals.length, hasPR, selectedDate, saveLog]);

  // Update streak helper
  const updateStreak = async () => {
    if (!profile) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
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

  const handleWorkoutSaved = async () => {
    await updateStreak();
    toast.success("Workout logged!");
  };

  // Date navigation using date-fns addDays (prevents 2-day skip bug)
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    setSelectedDate(format(addDays(d, delta), "yyyy-MM-dd"));
  };

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  // Toggle PR and fire confetti
  const togglePR = () => {
    const next = !hasPR;
    setHasPR(next);
    if (next) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f59e0b"],
      });
      toast.success("New PR! 🏆");
    }
  };

  const handleFoodSearchSelect = async (food: { name: string; calories: number; protein: number; carbs: number; fat: number; servingSize: string }) => {
    if (!user) return;
    await addDoc(collection(db, "users", user.uid, "meals"), {
      date: selectedDate,
      foodName: food.name,
      items: [{ name: food.name, portionSize: food.servingSize, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat }],
      totalCalories: food.calories,
      totalProtein: food.protein,
      totalCarbs: food.carbs,
      totalFat: food.fat,
      confidence: "database",
      createdAt: Timestamp.now(),
    });
    setShowFoodSearch(false);
    toast.success(`${food.name} added!`);
  };

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

        <button
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="text-center flex items-center gap-2"
        >
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {isToday
                ? "Today"
                : format(new Date(selectedDate + "T12:00:00"), "EEE, MMM d")}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(selectedDate + "T12:00:00"), "MMMM d, yyyy")}
            </p>
          </div>
        </button>

        {/* Hidden native date picker */}
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="sr-only"
        />

        <button
          onClick={() => changeDate(1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Tabs — Workout / Food only (Quick removed) */}
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
      </div>

      {/* Workout Tab */}
      {activeTab === "workout" && (
        <div className="space-y-4">
          {/* PR Toggle */}
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <button
              onClick={togglePR}
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

          {/* Saved Workouts */}
          {todaysWorkouts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Saved Workouts
              </p>

              {todaysWorkouts.map((w, idx) => (
                <div
                  key={w.id}
                  className="bg-card rounded-xl border border-border/50 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium text-foreground">
                        Workout {idx + 1}
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
                        {ex.exerciseName} — {ex.category === "Cardio"
                          ? `${ex.durationMinutes || 0} min`
                          : `${ex.sets.length} sets`
                        } · {ex.caloriesBurned} cal
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
          {/* Daily Totals - now exact same look as Today's Intake on Home */}
          <div className="bg-card rounded-2xl border border-border/50 p-5">
            <p className="text-sm font-medium text-foreground mb-4">Daily Totals</p>
            <div className="grid grid-cols-4 gap-3 text-center">
              {/* Calories */}
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.calories),
                  color: macroColors.calories,
                }}
              >
                <Flame className="w-6 h-6 mx-auto mb-2" />
                <p className="text-2xl font-bold">
                  {safeNum(dailyTotals.calories)}
                </p>
                <p className="text-xs">cal</p>
              </div>

              {/* Protein */}
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.protein),
                  color: macroColors.protein,
                }}
              >
                <Beef className="w-6 h-6 mx-auto mb-2" />
                <p className="text-2xl font-bold">
                  {safeNum(dailyTotals.protein)}g
                </p>
                <p className="text-xs">protein</p>
              </div>

              {/* Carbs */}
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.carbs),
                  color: macroColors.carbs,
                }}
              >
                <Wheat className="w-6 h-6 mx-auto mb-2" />
                <p className="text-2xl font-bold">
                  {safeNum(dailyTotals.carbs)}g
                </p>
                <p className="text-xs">carbs</p>
              </div>

              {/* Fat */}
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{
                  backgroundColor: tint(macroColors.fat),
                  color: macroColors.fat,
                }}
              >
                <Cookie className="w-6 h-6 mx-auto mb-2" />
                <p className="text-2xl font-bold">
                  {safeNum(dailyTotals.fat)}g
                </p>
                <p className="text-xs">fat</p>
              </div>
            </div>
          </div>

          {/* Saved Meals */}
          {todaysMeals.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Meals</p>
              {todaysMeals.map((m) => (
                <div key={m.id} className="bg-card rounded-xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{m.foodName || "Meal"}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-orange-500 font-medium">
                        {safeNum(m.totalCalories)} cal
                      </p>
                      <button onClick={() => deleteMeal(m.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>P: {safeNum(m.totalProtein)}g</span>
                    <span>C: {safeNum(m.totalCarbs)}g</span>
                    <span>F: {safeNum(m.totalFat)}g</span>
                  </div>
                  {m.items && m.items.length > 1 && (
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

          {/* Food Search */}
          {showFoodSearch ? (
            <FoodSearch
              onSelect={handleFoodSearchSelect}
              onClose={() => setShowFoodSearch(false)}
            />
          ) : (
            <button
              onClick={() => setShowFoodSearch(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" /> Search Food Database
            </button>
          )}

          {/* Manual Food Logger */}
          <ManualFoodLogger date={selectedDate} />

          {/* AI Food Analyzer */}
          <FoodAnalyzer date={selectedDate} />
        </div>
      )}
    </div>
  );
}