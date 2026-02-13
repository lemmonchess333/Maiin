import { useState, useEffect } from "react";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import WorkoutLogger from "@/components/WorkoutLogger";
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
  const { profile } = useAuth();
  const { logs, saveLog } = useDailyLogs();
  const { getWorkoutsForDate, deleteWorkout } = useWorkouts();
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [workouts, setWorkouts] = useState(0);
  const [meals, setMeals] = useState(0);
  const [hasPR, setHasPR] = useState(false);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "workout">("workout");

  const todaysWorkouts = getWorkoutsForDate(selectedDate);

  useEffect(() => {
    const existing = logs.find((l) => l.date === selectedDate);
    if (existing) {
      setWorkouts(existing.workouts);
      setMeals(existing.meals);
      setHasPR(existing.hasPR);
      setWeightKg(existing.weightKg);
      setNotes(existing.notes || "");
    } else {
      setWorkouts(0);
      setMeals(0);
      setHasPR(false);
      setWeightKg(undefined);
      setNotes("");
    }
    setSaved(false);
  }, [selectedDate, logs]);

  const handleSave = async () => {
    setSaving(true);
    await saveLog({
      date: selectedDate,
      workouts,
      meals,
      hasPR,
      weightKg,
      notes,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

      {/* Date picker */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border/50 p-3">
        <button
          onClick={() => changeDate(-1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isToday ? "Today" : format(new Date(selectedDate), "EEE, MMM d")}
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
            isToday
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-muted"
          )}
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Tab Switcher */}
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
          onClick={() => setActiveTab("quick")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
            activeTab === "quick"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          <NotebookPen className="w-4 h-4" /> Quick Log
        </button>
      </div>

      {/* Workout Tab */}
      {activeTab === "workout" && (
        <div className="space-y-4">
          {/* Previous Workouts for this date */}
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
                        {w.exercises.length} exercise{w.exercises.length !== 1 && "s"}
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
                      <p key={i} className="text-xs text-muted-foreground">
