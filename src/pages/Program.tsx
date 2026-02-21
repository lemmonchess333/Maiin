import { useState } from "react";
import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { getProgressionLabel, getProgressionDirection } from "@/features/program/programEngine";
import type { ProgramExercise, Goal } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import {
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Dumbbell,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Settings2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function DirectionIcon({ ex }: { ex: ProgramExercise }) {
  const dir = getProgressionDirection(ex);
  if (dir === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (dir === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function Program() {
  const { features } = useSubscription();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    logExercise,
    updateExercise,
    updateSettings,
    regenerateProgram,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  } = useProgram();

  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Exercise drawer state
  const [drawerExercise, setDrawerExercise] = useState<{
    dayIndex: number;
    exIndex: number;
    exercise: ProgramExercise;
  } | null>(null);
  const [logReps, setLogReps] = useState("");
  const [logWeight, setLogWeight] = useState("");

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

  const isViewingHistory = viewingHistoryIndex !== null;
  const displayWorkouts = isViewingHistory ? (viewedWorkouts ?? []) : programState.workouts;
  const displayWeekNumber = isViewingHistory ? (viewedWeekNumber ?? 1) : programState.weekNumber;
  const completedCount = displayWorkouts.filter((d) => d.completed).length;
  const totalDays = displayWorkouts.length;
  const settings = programState.settings ?? { autoProgression: true, microloading: true };
  const history = programState.weekHistory ?? [];

  const handleRegenerate = async () => {
    setRegenerating(true);
    await regenerateProgram();
    setRegenerating(false);
  };

  const openDrawer = (dayIndex: number, exIndex: number, exercise: ProgramExercise) => {
    setDrawerExercise({ dayIndex, exIndex, exercise });
    setLogReps(exercise.reps.toString());
    setLogWeight(exercise.weight.toString());
  };

  const closeDrawer = () => {
    setDrawerExercise(null);
    setLogReps("");
    setLogWeight("");
  };

  const handleLogExercise = async () => {
    if (!drawerExercise) return;
    await logExercise(
      drawerExercise.dayIndex,
      drawerExercise.exIndex,
      Number(logReps) || 0,
      Number(logWeight) || 0,
    );
    closeDrawer();
  };

  const handleWeightOverride = async (newWeight: number) => {
    if (!drawerExercise) return;
    await updateExercise(drawerExercise.dayIndex, drawerExercise.exIndex, { weight: newWeight });
    closeDrawer();
  };

  // Week navigation
  const canGoBack = history.length > 0;
  const canGoForward = isViewingHistory;

  const goBack = () => {
    if (isViewingHistory) {
      const newIdx = viewingHistoryIndex - 1;
      viewWeek(newIdx >= 0 ? newIdx : null);
    } else if (history.length > 0) {
      viewWeek(history.length - 1);
    }
  };

  const goForward = () => {
    if (!isViewingHistory) return;
    if (viewingHistoryIndex < history.length - 1) {
      viewWeek(viewingHistoryIndex + 1);
    } else {
      viewWeek(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Program</h1>
          <p className="text-xs text-muted-foreground">
            {programState.splitType === "ppl" ? "Push / Pull / Legs" : "Upper / Lower"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Settings2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", regenerating && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border/50 px-4 py-2.5">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className={cn("p-1 rounded transition-colors", canGoBack ? "hover:bg-muted" : "opacity-30")}
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            Week {displayWeekNumber}
            {isViewingHistory && <span className="text-muted-foreground font-normal"> (past)</span>}
          </p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium capitalize">
              {programState.goal}
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium",
              prescription.deload
                ? "bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                : "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400",
            )}>
              {prescription.deload ? "Deload" : "Progression"}
            </span>
            {!isViewingHistory && (
              <span className="text-[10px] text-muted-foreground">{completedCount}/{totalDays}</span>
            )}
          </div>
        </div>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className={cn("p-1 rounded transition-colors", canGoForward ? "hover:bg-muted" : "opacity-30")}
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Workout Day Cards */}
      <div className="space-y-2">
        {displayWorkouts.map((day, dayIndex) => (
          <div
            key={dayIndex}
            className="bg-card rounded-xl border border-border/50 overflow-hidden"
          >
            {/* Day Header */}
            <button
              onClick={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
              className="w-full flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-3">
                {day.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{day.dayName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {day.exercises.length} exercises
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
                  <div className="px-3 pb-3 space-y-1.5">
                    {day.exercises.map((ex, exIndex) => (
                      <button
                        key={exIndex}
                        onClick={() => !isViewingHistory && openDrawer(dayIndex, exIndex, ex)}
                        disabled={isViewingHistory}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 text-left",
                          !isViewingHistory && "hover:bg-muted transition-colors",
                        )}
                      >
                        <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {ex.name}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{ex.sets}&times;{ex.reps}</span>
                            <span className="text-[10px]">&middot;</span>
                            <span className="font-medium text-foreground">
                              {getProgressionLabel(ex)}
                            </span>
                          </div>
                        </div>
                        {ex.lastPerformance && (
                          <DirectionIcon ex={ex} />
                        )}
                      </button>
                    ))}

                    {/* Complete Day button */}
                    {!day.completed && !isViewingHistory && (
                      <button
                        onClick={() => completeWorkoutDay(dayIndex)}
                        className="w-full py-2.5 mt-1 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
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

      {/* Exercise Detail Drawer */}
      <AnimatePresence>
        {drawerExercise && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t border-border/50 max-h-[80vh] overflow-y-auto safe-area-pb"
            >
              <div className="max-w-md mx-auto p-5 space-y-4">
                {/* Handle */}
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-foreground">{drawerExercise.exercise.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {drawerExercise.exercise.movementCategory.replace(/_/g, " ")}
                    </p>
                  </div>
                  <button onClick={closeDrawer} className="p-1 rounded hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Current prescription */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold text-foreground">{drawerExercise.exercise.sets}</p>
                    <p className="text-[10px] text-muted-foreground">Sets</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold text-foreground">{drawerExercise.exercise.reps}</p>
                    <p className="text-[10px] text-muted-foreground">Reps</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold text-foreground">
                      {drawerExercise.exercise.weight > 0 ? drawerExercise.exercise.weight : "BW"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">kg</p>
                  </div>
                </div>

                {/* Last 3 performances */}
                {drawerExercise.exercise.performanceHistory.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
                    <div className="space-y-1">
                      {drawerExercise.exercise.performanceHistory.slice(-3).reverse().map((rec, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50 text-xs">
                          <span className="text-muted-foreground">{rec.date}</span>
                          <span className="text-foreground font-medium">
                            {rec.weight > 0 ? `${rec.weight}kg` : "BW"} &times; {rec.repsCompleted}/{rec.repsTarget}
                          </span>
                          <span className={rec.repsCompleted >= rec.repsTarget ? "text-green-500" : "text-red-400"}>
                            {rec.repsCompleted >= rec.repsTarget ? "Pass" : "Miss"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Log form */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Log Performance</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Weight (kg)</label>
                      <input
                        type="number"
                        value={logWeight}
                        onChange={(e) => setLogWeight(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Reps</label>
                      <input
                        type="number"
                        value={logReps}
                        onChange={(e) => setLogReps(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLogExercise}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Save Performance
                </button>

                {/* Manual weight override */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleWeightOverride(Math.max(0, drawerExercise.exercise.weight - 2.5))}
                    className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                  >
                    -2.5kg
                  </button>
                  <button
                    onClick={() => handleWeightOverride(drawerExercise.exercise.weight + 2.5)}
                    className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                  >
                    +2.5kg
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t border-border/50 safe-area-pb"
            >
              <div className="max-w-md mx-auto p-5 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />

                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-foreground">Program Settings</p>
                  <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Goal selector */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Goal</p>
                  <div className="flex gap-1">
                    {(["cut", "recomp", "lean bulk"] as Goal[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => regenerateProgram(g)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                          programState.goal === g
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Split selector */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Split</p>
                  <div className="flex gap-1">
                    {([
                      { value: 4, label: "Upper / Lower", split: "upper_lower" as const },
                      { value: 5, label: "Push / Pull / Legs", split: "ppl" as const },
                    ]).map((s) => (
                      <button
                        key={s.value}
                        onClick={() => regenerateProgram(undefined, s.value)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          s.split === programState.splitType
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Auto Progression</p>
                      <p className="text-[10px] text-muted-foreground">Adjust weights after logging</p>
                    </div>
                    <button
                      onClick={() => updateSettings({ autoProgression: !settings.autoProgression })}
                      className={cn(
                        "w-10 h-6 rounded-full transition-colors relative",
                        settings.autoProgression ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                        settings.autoProgression ? "translate-x-5" : "translate-x-1",
                      )} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Microloading</p>
                      <p className="text-[10px] text-muted-foreground">+1kg steps for isolations</p>
                    </div>
                    <button
                      onClick={() => updateSettings({ microloading: !settings.microloading })}
                      className={cn(
                        "w-10 h-6 rounded-full transition-colors relative",
                        settings.microloading ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                        settings.microloading ? "translate-x-5" : "translate-x-1",
                      )} />
                    </button>
                  </div>
                </div>

                {/* Reset mesocycle */}
                <button
                  onClick={handleRegenerate}
                  className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors"
                >
                  Reset Mesocycle
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
