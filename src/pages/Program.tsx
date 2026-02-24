import { useEffect, useMemo, useState } from "react";
import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { getProgressionLabel, getProgressionDirection } from "@/features/program/programEngine";
import type { ProgramExercise, Goal } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import WorkoutSession from "@/components/WorkoutSession";
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
  Plus,
  FastForward,
  Play,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function DirectionIcon({ ex }: { ex: ProgramExercise }) {
  const dir = getProgressionDirection(ex);
  if (dir === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (dir === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function ProgressionLabel({ ex }: { ex: ProgramExercise }) {
  const label = getProgressionLabel(ex);
  const dir = getProgressionDirection(ex);
  const colorClass =
    dir === "up"
      ? "text-green-600 dark:text-green-400"
      : dir === "down"
        ? "text-red-500 dark:text-red-400"
        : "text-foreground";
  return <span className={cn("font-medium", colorClass)}>{label}</span>;
}

type SaveState = "idle" | "saving" | "saved";

export default function Program() {
  const { features } = useSubscription();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    advanceToNextWeek,
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
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);

  // Day completion UI feedback
  const [daySavingIndex, setDaySavingIndex] = useState<number | null>(null);
  const [daySavedIndex, setDaySavedIndex] = useState<number | null>(null);

  // Exercise drawer state
  const [drawerExercise, setDrawerExercise] = useState<{
    dayIndex: number;
    exIndex: number;
    exercise: ProgramExercise;
  } | null>(null);

  const [logReps, setLogReps] = useState("");
  const [logWeight, setLogWeight] = useState("");

  // Save feedback for drawer
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [weightNudge, setWeightNudge] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 900);
    return () => clearTimeout(t);
  }, [saveState]);

  useEffect(() => {
    if (!weightNudge) return;
    const t = setTimeout(() => setWeightNudge(null), 250);
    return () => clearTimeout(t);
  }, [weightNudge]);

  if (!features.phaseModes) {
    return (
      <div className="p-6 text-center space-y-4">
        <Lock className="w-8 h-8 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Program Engine</h1>
        <p className="text-sm text-muted-foreground">
          Unlock the adaptive Program Engine with Pro to get weekly splits, exercise prescriptions, progression tracking,
          and deload logic.
        </p>
        <p className="text-xs font-semibold text-foreground">Upgrade to Pro in Settings</p>
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
  const allComplete = completedCount === totalDays && totalDays > 0;

  const settings = programState.settings ?? { autoProgression: true, microloading: true };
  const history = programState.weekHistory ?? [];

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateProgram();
    } finally {
      setRegenerating(false);
    }
  };

  const handleAdvanceWeek = async () => {
    setAdvancing(true);
    try {
      await advanceToNextWeek();
    } finally {
      setAdvancing(false);
    }
  };

  const openDrawer = (dayIndex: number, exIndex: number, exercise: ProgramExercise) => {
    setDrawerExercise({ dayIndex, exIndex, exercise });
    setLogReps(exercise.reps.toString());
    setLogWeight(exercise.weight.toString());
    setSaveState("idle");
    setWeightNudge(null);
  };

  const closeDrawer = () => {
    setDrawerExercise(null);
    setLogReps("");
    setLogWeight("");
    setSaveState("idle");
    setWeightNudge(null);
  };

  const handleLogExercise = async () => {
    if (!drawerExercise) return;

    const repsNum = Number(logReps) || 0;
    const weightNum = Number(logWeight) || 0;

    setSaveState("saving");
    try {
      // 1) Log performance (this should drive progression logic)
      await logExercise(drawerExercise.dayIndex, drawerExercise.exIndex, repsNum, weightNum);

      // 2) If user adjusted weight input, persist the program weight to match (so it “sticks”)
      if (weightNum !== drawerExercise.exercise.weight) {
        await updateExercise(drawerExercise.dayIndex, drawerExercise.exIndex, { weight: weightNum });
      }

      // Keep drawer open but reflect the latest values so user sees it worked
      setDrawerExercise((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exercise: {
            ...prev.exercise,
            weight: weightNum,
            reps: repsNum,
          },
        };
      });

      setSaveState("saved");
    } catch (e) {
      // If you have toast elsewhere you can add it; keeping file self-contained + safe
      setSaveState("idle");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const handleSetsChange = async (delta: number) => {
    if (!drawerExercise) return;
    const newSets = Math.max(1, Math.min(10, drawerExercise.exercise.sets + delta));
    if (newSets === drawerExercise.exercise.sets) return;

    setSaveState("saving");
    try {
      await updateExercise(drawerExercise.dayIndex, drawerExercise.exIndex, { sets: newSets });
      setDrawerExercise({
        ...drawerExercise,
        exercise: { ...drawerExercise.exercise, sets: newSets },
      });
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const adjustWeightInput = (delta: number) => {
    if (!drawerExercise) return;
    const current = Number(logWeight) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setLogWeight(next.toString());
    setWeightNudge(delta > 0 ? "up" : "down");
  };

  const handleToggleDayComplete = async (dayIndex: number) => {
    if (isViewingHistory) return;
    const day = displayWorkouts[dayIndex];
    if (!day || day.completed) return;

    setDaySavingIndex(dayIndex);
    setDaySavedIndex(null);

    try {
      await completeWorkoutDay(dayIndex);
      setDaySavedIndex(dayIndex);
      setTimeout(() => setDaySavedIndex(null), 900);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setDaySavingIndex(null);
    }
  };

  // Week navigation (fixed: don’t allow “back” to kick you out weirdly)
  const canGoBack = useMemo(() => {
    if (history.length === 0) return false;
    if (!isViewingHistory) return true; // from current -> last history
    return viewingHistoryIndex > 0; // history -> previous history
  }, [history.length, isViewingHistory, viewingHistoryIndex]);

  const canGoForward = useMemo(() => {
    if (!isViewingHistory) return false;
    // you can always go forward toward “present”
    return true;
  }, [isViewingHistory]);

  const goBack = () => {
    if (!canGoBack) return;

    if (isViewingHistory) {
      viewWeek(viewingHistoryIndex - 1);
    } else {
      viewWeek(history.length - 1);
    }
  };

  const goForward = () => {
    if (!isViewingHistory) return;

    if (viewingHistoryIndex < history.length - 1) {
      viewWeek(viewingHistoryIndex + 1);
    } else {
      // last history -> present week
      viewWeek(null);
    }
  };

  // Goal display name with better visibility
  const goalLabel = (g: string) => {
    if (g === "lean bulk") return "Lean Bulk";
    return g.charAt(0).toUpperCase() + g.slice(1);
  };

  const drawerLastPerformance = drawerExercise?.exercise?.performanceHistory?.length
    ? drawerExercise.exercise.performanceHistory[drawerExercise.exercise.performanceHistory.length - 1]
    : null;

  const drawerDeltaFromLast =
    drawerExercise && drawerLastPerformance
      ? Math.round((drawerExercise.exercise.weight - drawerLastPerformance.weight) * 100) / 100
      : null;

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
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Regenerate"
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
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            Week {displayWeekNumber}
            {isViewingHistory && <span className="text-muted-foreground font-normal"> (past)</span>}
          </p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
              {goalLabel(programState.goal)}
            </span>
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium",
                prescription.deload
                  ? "bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                  : "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400",
              )}
            >
              {prescription.deload ? "Deload" : "Progression"}
            </span>
            {!isViewingHistory && <span className="text-[10px] text-muted-foreground">{completedCount}/{totalDays}</span>}
          </div>
        </div>

        <button
          onClick={goForward}
          disabled={!canGoForward}
          className={cn("p-1 rounded transition-colors", canGoForward ? "hover:bg-muted" : "opacity-30")}
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Advance Week Button — shown when all workouts are complete */}
      {allComplete && !isViewingHistory && (
        <button
          onClick={handleAdvanceWeek}
          disabled={advancing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <FastForward className="w-4 h-4" />
          {advancing ? "Advancing..." : "Advance to Next Week"}
        </button>
      )}

      {/* Workout Day Cards */}
      <div className="space-y-2">
        {displayWorkouts.map((day, dayIndex) => {
          const isExpanded = expandedDay === dayIndex;
          const isSaving = daySavingIndex === dayIndex;
          const isSaved = daySavedIndex === dayIndex;

          return (
            <div key={dayIndex} className="bg-card rounded-xl border border-border/50 overflow-hidden">
              {/* Day Header (Left: tappable completion circle, Right: expand/collapse) */}
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  disabled={isViewingHistory || day.completed || isSaving}
                  onClick={() => handleToggleDayComplete(dayIndex)}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    day.completed
                      ? "bg-green-500/10"
                      : isSaving
                        ? "bg-primary/10"
                        : "bg-muted",
                    !isViewingHistory && !day.completed && !isSaving && "active:scale-[0.98]",
                  )}
                  aria-label={day.completed ? "Completed" : "Mark workout complete"}
                  title={day.completed ? "Completed" : "Tap to mark complete"}
                >
                  {day.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : isSaving ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : isSaved ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setExpandedDay(isExpanded ? null : dayIndex)}
                  className={cn(
                    "flex-1 flex items-center justify-between rounded-lg px-2 py-2 transition-colors",
                    "hover:bg-muted/60 active:bg-muted/80",
                  )}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{day.dayName}</p>
                      {isSaved && !day.completed && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{day.exercises.length} exercises</p>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* Expanded Exercise List */}
              <AnimatePresence>
                {isExpanded && (
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
                            <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>
                                {ex.sets}&times;{ex.reps}
                              </span>
                              <span className="text-[10px]">&middot;</span>
                              <ProgressionLabel ex={ex} />
                            </div>
                          </div>
                          {ex.lastPerformance && <DirectionIcon ex={ex} />}
                        </button>
                      ))}

                      {/* Start Workout Session */}
                      {!day.completed && !isViewingHistory && (
                        <button
                          onClick={() => setSessionDayIndex(dayIndex)}
                          className="w-full py-2.5 mt-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4" /> Start Workout
                        </button>
                      )}

                      {/* Complete Day button (fallback) */}
                      {!day.completed && !isViewingHistory && (
                        <button
                          onClick={() => handleToggleDayComplete(dayIndex)}
                          disabled={daySavingIndex === dayIndex}
                          className={cn(
                            "w-full py-2 rounded-lg text-foreground text-xs font-medium transition-colors",
                            daySavingIndex === dayIndex ? "bg-primary/10" : "bg-muted hover:bg-muted/80",
                          )}
                        >
                          {daySavingIndex === dayIndex ? "Saving..." : "Mark Complete (skip session)"}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
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
              className={cn(
                "fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t max-h-[80vh] overflow-y-auto safe-area-pb",
                saveState === "saved" ? "border-green-500/40" : "border-border/50",
              )}
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

                {/* Save feedback */}
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-muted-foreground">
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : " "}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded",
                      saveState === "saved" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-transparent",
                    )}
                  >
                    {saveState === "saved" ? "Update applied" : ""}
                  </div>
                </div>

                {/* Current prescription with adjustable sets */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted rounded-lg p-2 relative">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleSetsChange(-1)}
                        className="w-6 h-6 rounded-full bg-background border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
                        disabled={saveState === "saving"}
                        aria-label="Decrease sets"
                      >
                        <Minus className="w-3 h-3 text-foreground" />
                      </button>
                      <p className="text-lg font-bold text-foreground w-8">{drawerExercise.exercise.sets}</p>
                      <button
                        onClick={() => handleSetsChange(1)}
                        className="w-6 h-6 rounded-full bg-background border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
                        disabled={saveState === "saving"}
                        aria-label="Increase sets"
                      >
                        <Plus className="w-3 h-3 text-foreground" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sets</p>
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

                {/* Previous session only */}
                {drawerLastPerformance && (
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">Previous session</p>
                      <span className="text-[10px] text-muted-foreground">{drawerLastPerformance.date}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-semibold text-foreground">
                        {drawerLastPerformance.weight > 0 ? `${drawerLastPerformance.weight}kg` : "BW"} ×{" "}
                        {drawerLastPerformance.repsCompleted}/{drawerLastPerformance.repsTarget}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          drawerLastPerformance.repsCompleted >= drawerLastPerformance.repsTarget
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-500 dark:text-red-400",
                        )}
                      >
                        {drawerLastPerformance.repsCompleted >= drawerLastPerformance.repsTarget ? "Pass" : "Miss"}
                      </span>
                    </div>

                    {typeof drawerDeltaFromLast === "number" && drawerLastPerformance.weight > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        This session target:{" "}
                        <span className="font-medium text-foreground">{drawerExercise.exercise.weight}kg</span>{" "}
                        <span className={drawerDeltaFromLast >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}>
                          ({drawerDeltaFromLast >= 0 ? "+" : ""}
                          {drawerDeltaFromLast}kg vs last)
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Log form */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Log Performance</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Weight (kg)</label>
                      <div
                        className={cn(
                          "rounded-lg border transition-colors",
                          weightNudge === "up"
                            ? "border-green-500/50"
                            : weightNudge === "down"
                              ? "border-red-500/50"
                              : "border-border/50",
                        )}
                      >
                        <input
                          type="number"
                          value={logWeight}
                          onChange={(e) => setLogWeight(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>

                      {/* Quick adjust (does not auto-save; it updates the input + shows feedback) */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => adjustWeightInput(-2.5)}
                          className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                          disabled={saveState === "saving"}
                        >
                          -2.5kg
                        </button>
                        <button
                          onClick={() => adjustWeightInput(2.5)}
                          className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                          disabled={saveState === "saving"}
                        >
                          +2.5kg
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Reps</label>
                      <input
                        type="number"
                        value={logReps}
                        onChange={(e) => setLogReps(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLogExercise}
                  disabled={saveState === "saving"}
                  className={cn(
                    "w-full py-2.5 rounded-xl text-sm font-medium transition-opacity",
                    saveState === "saved"
                      ? "bg-green-600 text-white"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                    saveState === "saving" && "opacity-70",
                  )}
                >
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save Performance"}
                </button>
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
                          "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          programState.goal === g
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground hover:bg-muted/80",
                        )}
                      >
                        {goalLabel(g)}
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
                            : "bg-muted text-foreground hover:bg-muted/80",
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
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                          settings.autoProgression ? "translate-x-5" : "translate-x-1",
                        )}
                      />
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
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                          settings.microloading ? "translate-x-5" : "translate-x-1",
                        )}
                      />
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

      {/* In-Session Workout Screen */}
      {sessionDayIndex !== null && programState.workouts[sessionDayIndex] && (
        <WorkoutSession
          day={programState.workouts[sessionDayIndex]}
          dayIndex={sessionDayIndex}
          onLogExercise={logExercise}
          onCompleteDay={completeWorkoutDay}
          onClose={() => setSessionDayIndex(null)}
        />
      )}
    </div>
  );
}