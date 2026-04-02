import { motion } from "framer-motion";
import { CheckCircle2, Play } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { WorkoutDay } from "@/features/program/programTypes";
import { getBestSetSummary, getExercisePrescription } from "@/lib/getBestSetSummary";
import CompactExerciseRow from "./CompactExerciseRow";

interface WeekContentCardProps {
  day: WorkoutDay;
  dayIndex: number;
  status: "current" | "completed" | "future";
  direction: 1 | -1;
  muscleGroups: string;
  estimatedMinutes: number;
  onStartWorkout: () => void;
  onSkipSession: () => void;
  onExerciseTap: (exerciseName: string) => void;
  isViewingHistory?: boolean;
  sessionActive?: boolean;
}

const variants = {
  enter: (d: number) => ({ x: d * 80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -80, opacity: 0 }),
};

export default function WeekContentCard({
  day,
  dayIndex,
  status,
  direction,
  muscleGroups,
  estimatedMinutes,
  onStartWorkout,
  onSkipSession,
  onExerciseTap,
  isViewingHistory = false,
  sessionActive = false,
}: WeekContentCardProps) {
  const isFuture = status === "future";
  const isCompleted = status === "completed";
  const isCurrent = status === "current";

  return (
    <motion.div
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-card rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            {isCompleted ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : isCurrent ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ border: `2.5px solid ${THEME.lifting}` }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: THEME.lifting }} />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/25" />
            )}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                Day {dayIndex + 1} · {day.dayName}
              </p>
              {isCompleted && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                  Done
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {day.exercises.length} exercises · ~{estimatedMinutes}min
              {muscleGroups ? ` · ${muscleGroups}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border/30 mx-4" />

      {/* Exercise list */}
      <div className="divide-y divide-border/20 py-1">
        {day.exercises.map((ex, i) => (
          <CompactExerciseRow
            key={i}
            name={ex.name}
            summary={isCompleted ? getBestSetSummary(ex) : getExercisePrescription(ex)}
            onTap={() => onExerciseTap(ex.name)}
            opacity={isFuture ? 0.75 : 1}
          />
        ))}
      </div>

      {/* Action area — current day only */}
      {isCurrent && !isViewingHistory && (
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={onStartWorkout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-primary text-primary bg-transparent text-sm font-semibold active:scale-[0.97] transition-transform"
          >
            <Play className="w-4 h-4" />
            {sessionActive ? "Resume Workout" : "Start Workout"}
          </button>
          <div className="flex items-center justify-center mt-2">
            <button
              onClick={onSkipSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip Session
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
