import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, ClipboardList, Footprints, X, Check } from "lucide-react";
import {
  getScheduledRunStatus,
  isScheduledRunCompleted,
} from "@/lib/scheduledRunStatus";
import { format } from "date-fns";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import { IconButton } from "@/components/ui/IconButton";

export default function DayPeekCard({ dateKey, schedule, runDays, workouts, dailyTotals, onClose }: {
  dateKey: string;
  schedule: ScheduleDay[];
  /** P1-4: programState.runDays for the current week. The peek
   *  surfaces planned-run status (planned / completed / skipped)
   *  alongside the existing workout + meal lines so users see the
   *  full activity picture for the day, not just lift volume. */
  runDays?: ScheduledRunDay[];
  workouts: { exercises?: { sets?: { weightKg?: number; reps?: number }[] }[]; durationMinutes?: number }[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number; mealCount: number };
  onClose: () => void;
}) {
  const dow = new Date(dateKey + "T00:00:00").getDay();
  const st = schedule.find(function(s) { return s.day === dow; })?.type || "rest";
  const runDay = runDays?.find(function(r) { return r.dayIndex === dow; });
  const dayLabel = format(new Date(dateKey + "T00:00:00"), "EEE d MMM");
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
          {(hasW || hasM || runDay) ? (
            <div className="space-y-1 text-xs">
              {hasW && (
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.lifting }} />
                  <span className="text-foreground font-mono tabular-nums">
                    {workouts.length} session{workouts.length !== 1 ? "s" : ""}
                    {totalMinutes > 0 && (
                      <span className="text-muted-foreground">
                        {" \u00B7 "}{totalMinutes} min
                      </span>
                    )}
                    {tonnage > 0 && (
                      <span className="text-muted-foreground">
                        {" \u00B7 "}{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + "k kg" : Math.round(tonnage) + " kg"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.success }} />
                  <span className="text-foreground font-mono tabular-nums">{dailyTotals.calories.toLocaleString()} cal {"\u00B7"} {Math.round(dailyTotals.protein)}g protein</span>
                </div>
              )}
              {/* P1-4 + PR-0b-iii: run-day status row, branched
                  by the central helper. Covers all states with
                  appropriate copy:
                    - completed_*: "Run completed" + Check
                    - skipped: "Run skipped" (muted)
                    - race_no_show: "Race day passed" (muted)
                    - race_completed_unlinked: "Race completed separately" (muted)
                    - planned: "Run scheduled" */}
              {runDay && (() => {
                const status = getScheduledRunStatus(runDay);
                return (
                  <div className="flex items-center gap-1.5">
                    <Footprints className="w-3.5 h-3.5 shrink-0" style={{ color: THEME.running }} />
                    <span className="text-foreground">
                      {isScheduledRunCompleted(status) ? (
                        <span className="inline-flex items-center gap-1">
                          Run completed
                          <Check className="w-3 h-3" style={{ color: THEME.success }} />
                        </span>
                      ) : status === "skipped" ? (
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>Run skipped</span>
                      ) : status === "race_no_show" ? (
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>Race day passed</span>
                      ) : status === "race_completed_unlinked" ? (
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>Race completed separately</span>
                      ) : (
                        <span>Run scheduled</span>
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No activity logged</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
