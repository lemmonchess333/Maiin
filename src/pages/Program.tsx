import { useState } from "react";
import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import {
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Dumbbell,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Program() {
  const { features } = useSubscription();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    regenerateProgram,
  } = useProgram();

  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (!features.phaseModes) {
    return (
      <div className="p-6 text-center space-y-4">
        <Lock className="w-8 h-8 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Program Engine</h1>
        <p className="text-sm text-muted-foreground">
          Unlock the adaptive Program Engine with Pro to get weekly splits,
          exercise prescriptions, progression tracking, and deload logic.
        </p>
        <p className="text-xs font-semibold text-foreground">
          Upgrade to Pro in Settings
        </p>
      </div>
    );
  }

  if (loading || !programState || !prescription) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const completedCount = programState.workouts.filter((d) => d.completed).length;
  const totalDays = programState.workouts.length;

  const handleRegenerate = async () => {
    setRegenerating(true);
    await regenerateProgram();
    setRegenerating(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Program</h1>
          <p className="text-sm text-muted-foreground">
            Week {programState.weekNumber} · {programState.splitType === "ppl" ? "Push/Pull/Legs" : "Upper/Lower"}
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4 text-muted-foreground", regenerating && "animate-spin")} />
        </button>
      </div>

      {/* Goal + Phase badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium capitalize">
          {programState.goal}
        </span>
        <span className={cn(
          "px-3 py-1 rounded-lg text-xs font-medium",
          prescription.deload
            ? "bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
            : "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400",
        )}>
          {prescription.deload ? "Deload" : "Progression"}
        </span>
        <span className="px-3 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
          {completedCount}/{totalDays} done
        </span>
      </div>

      {/* Weekly Prescription compact */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card rounded-xl border border-border/50 p-3 text-center">
          <p className="text-lg font-bold text-foreground">{prescription.intensityMultiplier.toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground">Intensity</p>
        </div>
        <div className="bg-card rounded-xl border border-border/50 p-3 text-center">
          <p className="text-lg font-bold text-foreground">{prescription.volumeModifier.toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground">Volume</p>
        </div>
      </div>

      {/* Workout Day Cards */}
      <div className="space-y-3">
        {programState.workouts.map((day, dayIndex) => (
          <div
            key={dayIndex}
            className="bg-card rounded-xl border border-border/50 overflow-hidden"
          >
            {/* Day Header */}
            <button
              onClick={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                {day.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{day.dayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {day.exercises.length} exercises · {day.dayType}
                  </p>
                </div>
              </div>
              {expandedDay === dayIndex ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {/* Expanded Exercise List */}
            <AnimatePresence>
              {expandedDay === dayIndex && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    {day.exercises.map((ex, exIndex) => (
                      <div
                        key={exIndex}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {ex.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{ex.sets} x {ex.reps}</span>
                            <span>·</span>
                            <span>{ex.weight > 0 ? `${ex.weight}kg` : "BW"}</span>
                            {ex.progressionType === "double" && (
                              <>
                                <span>·</span>
                                <span className="text-primary">2x prog</span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Progression indicator */}
                        {ex.lastPerformance && (
                          <div className="shrink-0">
                            {ex.lastPerformance.completed ? (
                              <TrendingUp className="w-4 h-4 text-green-500" />
                            ) : ex.plateauCount >= 2 ? (
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            ) : (
                              <Minus className="w-4 h-4 text-yellow-500" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Complete Day button */}
                    {!day.completed && (
                      <button
                        onClick={() => completeWorkoutDay(dayIndex)}
                        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
