import { useState, useEffect } from "react";
import { useDailyLogs } from "@/hooks/useFirestore";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dumbbell,
  UtensilsCrossed,
  Trophy,
  Scale,
  NotebookPen,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function Log() {
  const { profile } = useAuth();
  const { logs, saveLog } = useDailyLogs();
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

  // Load existing log for selected date
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

      {/* Workout counter */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Workouts</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setWorkouts(n)}
                className={cn(
                  "w-10 h-10 rounded-lg font-medium text-sm transition-all",
                  workouts === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Target: {profile?.weeklyWorkoutsTarget || 4}/week
          </p>
        </div>
      </div>

      {/* Meals counter */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Protein Meals</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMeals(n)}
                className={cn(
                  "w-10 h-10 rounded-lg font-medium text-sm transition-all",
                  meals === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PR toggle */}
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
              hasPR ? "bg-primary justify-end" : "bg-muted justify-start"
            )}
          >
            <div className="w-5 h-5 bg-white rounded-full mx-1 shadow-sm" />
          </div>
        </button>
      </div>

      {/* Weight check-in */}
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
            setWeightKg(e.target.value ? Number(e.target.value) : undefined)
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

      {/* Save button */}
      <button
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
      </button>
    </div>
  );
}
