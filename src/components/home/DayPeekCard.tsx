import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, ClipboardList, X } from "lucide-react";
import { format } from "date-fns";
import type { ScheduleDay } from "@/lib/scheduleUtils";

export default function DayPeekCard({ dateKey, schedule, workouts, dailyTotals, onClose }: {
  dateKey: string;
  schedule: ScheduleDay[];
  workouts: { exercises?: { sets?: { weightKg?: number; reps?: number }[] }[] }[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number; mealCount: number };
  onClose: () => void;
}) {
  const dow = new Date(dateKey + "T00:00:00").getDay();
  const st = schedule.find(function(s) { return s.day === dow; })?.type || "rest";
  const dayLabel = format(new Date(dateKey + "T00:00:00"), "EEE d MMM");
  const typeLabel = st === "lift" ? "Lift day" : st === "run" ? "Run day" : st === "both" ? "Lift + Run day" : "Rest day";
  const typeColor = st === "lift" ? THEME.lifting : st === "run" ? THEME.running : st === "both" ? THEME.lifting : THEME.textMuted;
  let tonnage = 0;
  workouts.forEach(function(w) {
    (w.exercises || []).forEach(function(ex) {
      (ex.sets || []).forEach(function(s) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  const hasW = workouts.length > 0;
  const hasM = dailyTotals.mealCount > 0;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
      <div className="pt-3 pb-1 px-1">
        <div className="rounded-2xl bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{dayLabel}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: typeColor + "18", color: typeColor }}>{typeLabel}</span>
            </div>
            <button onClick={onClose} aria-label="Close day details" className="p-3 -m-1.5 rounded-lg hover:bg-muted transition-colors">
              <X aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {(hasW || hasM) ? (
            <div className="flex items-center gap-4 text-xs">
              {hasW && (
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5" style={{ color: THEME.lifting }} />
                  <span className="text-foreground">
                    {workouts.length} session{workouts.length !== 1 ? "s" : ""}
                    {tonnage > 0 && (
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {" \u00B7 "}{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + "k kg" : Math.round(tonnage) + "kg"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" style={{ color: THEME.success }} />
                  <span className="text-foreground font-mono tabular-nums">{dailyTotals.calories} cal {"\u00B7"} {dailyTotals.protein}g prot</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No activity logged</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
