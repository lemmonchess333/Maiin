import { motion } from "framer-motion";
import { CheckCircle2, Play, Ban, Pause } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { WorkoutDay } from "@/features/program/programTypes";
import { getBestSetSummary, getExercisePrescription } from "@/lib/getBestSetSummary";
import CompactExerciseRow from "./CompactExerciseRow";

interface WeekContentCardProps {
  day?: WorkoutDay;
  dayIndex: number;
  status: "current" | "completed" | "future" | "skipped" | "rest";
  direction: 1 | -1;
  muscleGroups?: string;
  estimatedMinutes?: number;
  onStartWorkout?: () => void;
  onSkipSession?: () => void;
  onExerciseTap?: (exerciseName: string) => void;
  onDoRetroactiveWorkout?: () => void;
  onSetAsNextWorkout?: () => void;
  nextWorkoutLabel?: string;
  isViewingHistory?: boolean;
  sessionActive?: boolean;
  editMode?: boolean;
  editContent?: React.ReactNode;
  onAddExercise?: () => void;
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
  muscleGroups = "",
  estimatedMinutes = 0,
  onStartWorkout,
  onSkipSession,
  onExerciseTap,
  onDoRetroactiveWorkout,
  onSetAsNextWorkout,
  nextWorkoutLabel,
  isViewingHistory = false,
  sessionActive = false,
  editMode = false,
  editContent,
  onAddExercise,
}: WeekContentCardProps) {
  const isFuture = status === "future";
  const isCompleted = status === "completed";
  const isCurrent = status === "current";
  const isSkipped = status === "skipped";
  const isRest = status === "rest";

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
      {/* ═══ REST DAY CONTENT ═══ */}
      {isRest && (
        <div className="px-4 py-6 text-center space-y-2">
          <Pause className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-semibold text-foreground">Rest Day</p>
          <p className="text-xs text-muted-foreground">
            {nextWorkoutLabel
              ? `No session scheduled. Your next workout is ${nextWorkoutLabel}.`
              : "No session scheduled. Rest helps your muscles grow stronger."
            }
          </p>
        </div>
      )}

      {/* ═══ WORKOUT DAY CONTENT ═══ */}
      {!isRest && day && (
        <>
          {/* Header */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              {/* Status icon */}
              <div className="shrink-0 mt-0.5">
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : isSkipped ? (
                  <Ban className="w-6 h-6 text-muted-foreground" />
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
                  {isSkipped && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                      Skipped
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

          {/* Exercise list — edit mode uses externally provided DnD content */}
          {editMode && editContent ? (
            <div className="py-1">
              {editContent}
            </div>
          ) : (
            <div className="divide-y divide-border/20 py-1">
              {day.exercises.map((ex, i) => (
                <CompactExerciseRow
                  key={i}
                  name={ex.name}
                  summary={isCompleted ? getBestSetSummary(ex) : getExercisePrescription(ex)}
                  onTap={() => onExerciseTap?.(ex.name)}
                  opacity={isFuture ? 0.75 : isSkipped ? 0.6 : 1}
                />
              ))}
            </div>
          )}

          {/* + Add Exercise in edit mode */}
          {editMode && onAddExercise && (
            <div className="px-4 pb-3">
              <button
                onClick={onAddExercise}
                className="w-full py-2.5 text-center text-sm font-medium text-primary active:scale-[0.97] transition-transform"
              >
                + Add Exercise
              </button>
            </div>
          )}

          {/* Action area — current day only (hidden in edit mode) */}
          {isCurrent && !isViewingHistory && !editMode && (
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

          {/* Action area — future day: set as next workout */}
          {isFuture && !editMode && !isViewingHistory && onSetAsNextWorkout && (
            <div className="px-4 pt-1 pb-4">
              <button
                onClick={onSetAsNextWorkout}
                className="w-full text-center text-sm font-medium py-2 active:scale-[0.97] transition-transform"
                style={{ color: "#7C6BF0" }}
              >
                Set as Next Workout &rarr;
              </button>
            </div>
          )}

          {/* Action area — skipped day: offer retroactive workout */}
          {isSkipped && !isViewingHistory && !editMode && onDoRetroactiveWorkout && (
            <div className="px-4 pt-1 pb-4">
              <button
                onClick={onDoRetroactiveWorkout}
                className="w-full text-center text-sm font-medium py-2 active:scale-[0.97] transition-transform"
                style={{ color: THEME.lifting }}
              >
                Do This Workout
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
