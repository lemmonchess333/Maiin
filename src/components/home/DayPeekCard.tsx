import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, ClipboardList, Footprints, X, Check } from "lucide-react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { IconButton } from "@/components/ui/IconButton";

export default function DayPeekCard({ dateKey, profile, programState, workouts, dailyTotals, onClose }: {
  dateKey: string;
  /** P1-4 / PR-0c: profile + programState replace the previous
   *  `schedule` + `runDays` props. The peek calls the shared
   *  training resolver which enforces date/weekKey-aware runDay
   *  matching — so tapping next Monday on the strip can no longer
   *  inherit this Monday's runDay status (the old
   *  `runDays.find(r => r.dayIndex === dow)` bug). */
  profile: UserProfile | null;
  programState: ProgramState | null;
  workouts: { exercises?: { sets?: { weightKg?: number; reps?: number }[] }[]; durationMinutes?: number }[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number; mealCount: number };
  onClose: () => void;
}) {
  const resolved = resolveTrainingDayForDate({
    dateKey,
    profile,
    programState,
    currentWeekKey: localWeekKey(new Date()),
  });
  const st = resolved.scheduleType;
  const dayLabel = format(parseLocalDate(dateKey), "EEE d MMM");
  const typeLabel = st === "lift" ? "Lift day" : st === "run" ? "Run day" : st === "both" ? "Lift + Run day" : "Rest day";
  const typeColor = st === "lift" ? THEME.lifting : st === "run" ? THEME.running : st === "both" ? THEME.lifting : THEME.textMuted;
  let tonnage = 0;
  let totalMinutes = 0;
  workouts.forEach(function(w) {
    totalMinutes += w.durationMinutes || 0;
    (w.exercises || []).forEach(function(ex) {
      (ex.sets || []).forEach(function(s) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  const hasW = workouts.length > 0;
  const hasM = dailyTotals.mealCount > 0;
  const hasRun = resolved.run.runDay !== null;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
      <div className="pt-1 pb-0.5 px-1">
        <div className="rounded-2xl bg-card px-3 py-1.5 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{dayLabel}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: typeColor + "18", color: typeColor }}>{typeLabel}</span>
            </div>
            <IconButton
              onClick={onClose}
              aria-label="Close day details"
              size="sm"
              className="-m-1 text-muted-foreground"
              icon={<X />}
            />
          </div>
          {(hasW || hasM || hasRun) ? (
            <div className="space-y-1 text-xs">
              {hasW && (
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.lifting }} />
                  <span className="text-foreground font-mono tabular-nums">
                    {workouts.length} session{workouts.length !== 1 ? "s" : ""}
                    {totalMinutes > 0 && (
                      <span className="text-muted-foreground">
                        {" · "}{totalMinutes} min
                      </span>
                    )}
                    {tonnage > 0 && (
                      <span className="text-muted-foreground">
                        {" · "}{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + "k kg" : Math.round(tonnage) + " kg"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.success }} />
                  <span className="text-foreground font-mono tabular-nums">{dailyTotals.calories.toLocaleString()} cal {"·"} {Math.round(dailyTotals.protein)}g protein</span>
                </div>
              )}
              {/* PR-0c: run-day status row. Resolver delivers a
                  status-aware view — when no runDay matches this
                  date (freeform user, future strip day, etc.) we
                  skip the row entirely rather than render a fake
                  "Run scheduled" line for an inherited slot. */}
              {hasRun && (
                <div className="flex items-center gap-1.5">
                  <Footprints className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.running }} />
                  <span className="text-foreground">
                    {resolved.run.isCompleted ? (
                      <span className="inline-flex items-center gap-1">
                        Run completed
                        <Check className="w-3 h-3" style={{ color: THEME.success }} />
                      </span>
                    ) : resolved.run.status === "skipped" ? (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>Run skipped</span>
                    ) : resolved.run.status === "race_no_show" ? (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>Race day passed</span>
                    ) : resolved.run.isReconciliation ? (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>Race completed separately</span>
                    ) : (
                      <span>Run scheduled</span>
                    )}
                  </span>
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
