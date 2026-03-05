import { useState, useEffect, useRef, useCallback } from "react";
import type { ProgramExercise } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  Play,
  RotateCcw,
  Check,
  X,
  Dumbbell,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

type SetType = "working" | "warmup" | "dropset" | "failure";

const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: { label: "W", color: "text-foreground", bg: "" },
  warmup: { label: "W", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  dropset: { label: "D", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  failure: { label: "F", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
};

const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "dropset", "failure"];

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

interface Props {
  day: WorkoutDay;
  dayIndex: number;
  onLogExercise: (dayIndex: number, exIndex: number, reps: number, weight: number) => Promise<void>;
  onCompleteDay: (dayIndex: number) => Promise<void>;
  onClose: () => void;
}

export default function WorkoutSession({ day, dayIndex, onLogExercise, onCompleteDay, onClose }: Props) {
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() =>
    day.exercises.map((ex) =>
      Array.from({ length: ex.sets }, () => ({
        reps: ex.reps,
        weight: ex.weight,
        completed: false,
        type: "working" as SetType,
      }))
    )
  );
  const [showRPE, setShowRPE] = useState(false);

  // Rest timer
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTarget, setRestTarget] = useState(90);
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session state
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completing, setCompleting] = useState(false);

  const currentExercise = day.exercises[currentExIndex];
  const currentSets = setLogs[currentExIndex] ?? [];
  const completedSetsInExercise = currentSets.filter((s) => s.completed).length;
  const totalSetsCompleted = setLogs.flat().filter((s) => s.completed).length;
  const totalSetsTotal = setLogs.flat().length;

  // Haptic feedback helper
  const haptic = useCallback((pattern: number | number[]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }, []);

  // Timer logic
  const startRest = useCallback(() => {
    setRestSeconds(0);
    setIsResting(true);
    haptic(50);
  }, [haptic]);

  const stopRest = useCallback(() => {
    setIsResting(false);
    setRestSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isResting) {
      timerRef.current = setInterval(() => {
        setRestSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isResting]);

  // Auto-stop timer when it reaches target
  useEffect(() => {
    if (isResting && restSeconds >= restTarget) {
      haptic([200, 100, 200]);
    }
  }, [isResting, restSeconds, restTarget, haptic]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const cycleSetType = (exIdx: number, setIdx: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      const current = updated[exIdx][setIdx].type;
      const currentIndex = SET_TYPE_ORDER.indexOf(current);
      updated[exIdx][setIdx].type = SET_TYPE_ORDER[(currentIndex + 1) % SET_TYPE_ORDER.length];
      return updated;
    });
  };

  const updateSetRPE = (exIdx: number, setIdx: number, rpe: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].rpe = rpe;
      return updated;
    });
  };

  const addSet = (exIdx: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      const lastSet = updated[exIdx][updated[exIdx].length - 1];
      updated[exIdx].push({
        reps: lastSet?.reps ?? day.exercises[exIdx].reps,
        weight: lastSet?.weight ?? day.exercises[exIdx].weight,
        completed: false,
        type: "working",
      });
      return updated;
    });
  };

  const updateSetLog = (exIdx: number, setIdx: number, field: "reps" | "weight", value: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx][field] = value;
      return updated;
    });
  };

  const completeSet = async () => {
    const set = currentSets[currentSetIndex];
    if (!set) return;

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][currentSetIndex].completed = true;
      return updated;
    });

    haptic(100);

    const isLastSet = currentSetIndex >= currentSets.length - 1;
    const isLastExercise = currentExIndex >= day.exercises.length - 1;

    if (isLastSet) {
      // Log exercise performance (use last set's reps/weight)
      await onLogExercise(dayIndex, currentExIndex, set.reps, set.weight);

      if (isLastExercise) {
        setSessionComplete(true);
      } else {
        // Move to next exercise
        setCurrentExIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
        startRest();
      }
    } else {
      // Move to next set, start rest timer
      setCurrentSetIndex((prev) => prev + 1);
      startRest();
    }
  };

  const handleFinish = async () => {
    setCompleting(true);
    await onCompleteDay(dayIndex);
    setCompleting(false);
    onClose();
  };

  // Session complete screen
  if (sessionComplete) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 text-center safe-area-pb"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
        >
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        </motion.div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Workout Complete!</h2>
        <p className="text-muted-foreground mb-1">{day.dayName}</p>
        <p className="text-sm text-muted-foreground mb-8">
          {totalSetsCompleted} sets logged across {day.exercises.length} exercises
        </p>
        <button
          onClick={handleFinish}
          disabled={completing}
          className="w-full max-w-xs py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold shadow-[var(--ds-shadow-purple-glow)] active:scale-95 transition-transform"
        >
          {completing ? "Saving..." : "Mark Day Complete"}
        </button>
        <button
          onClick={onClose}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Close without marking complete
        </button>
      </motion.div>
    );
  }


  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-area-pb">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <p className="text-sm font-semibold text-foreground">{day.dayName}</p>
          <p className="text-[11px] text-muted-foreground">
            {totalSetsCompleted}/{totalSetsTotal} sets
          </p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${totalSetsTotal > 0 ? (totalSetsCompleted / totalSetsTotal) * 100 : 0}%` }}
        />
      </div>

      {/* Exercise navigation pills */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto">
        {day.exercises.map((ex, i) => {
          const setsForEx = setLogs[i] ?? [];
          const done = setsForEx.every((s) => s.completed);
          const active = i === currentExIndex;
          return (
            <button
              key={i}
              onClick={() => {
                setCurrentExIndex(i);
                const nextIncomplete = setsForEx.findIndex((s) => !s.completed);
                setCurrentSetIndex(nextIncomplete >= 0 ? nextIncomplete : 0);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0",
                done
                  ? "bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {ex.name.length > 15 ? ex.name.slice(0, 15) + "…" : ex.name}
            </button>
          );
        })}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Current exercise header */}
        <div className="text-center pt-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
            <h2 className="text-lg font-bold text-foreground">{currentExercise?.name}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Set {currentSetIndex + 1} of {currentSets.length} · {completedSetsInExercise} done
          </p>
          {/* Previous performance hint */}
          {currentExercise?.lastPerformance && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
              style={{ background: `${THEME.lifting}18`, color: THEME.lifting }}>
              <ChevronRight className="w-3 h-3" />
              Last: {currentExercise.lastPerformance.sets}×{currentExercise.lastPerformance.reps}
              {currentExercise.lastPerformance.weight > 0 && ` @ ${currentExercise.lastPerformance.weight}kg`}
            </div>
          )}
        </div>

        {/* Rest Timer - circular */}
        <AnimatePresence>
          {isResting && (() => {
            const RADIUS = 54;
            const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
            const progress = Math.min(restSeconds / restTarget, 1);
            const dashOffset = CIRCUMFERENCE * (1 - progress);
            const isOver = restSeconds >= restTarget;
            return (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-3 py-2"
              >
                {/* Circular timer */}
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                    {/* Track */}
                    <circle cx="64" cy="64" r={RADIUS} fill="none"
                      stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    {/* Progress */}
                    <circle cx="64" cy="64" r={RADIUS} fill="none"
                      stroke={isOver ? THEME.success : THEME.teal}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={dashOffset}
                      style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className={cn(
                      "text-3xl font-extrabold tabular-nums tracking-tight",
                      isOver ? "text-green-400" : "text-foreground"
                    )}>
                      {formatTime(restSeconds)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isOver ? "GO!" : `/ ${formatTime(restTarget)}`}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <button onClick={stopRest}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium">
                    <RotateCcw className="w-3 h-3" /> Skip
                  </button>
                  <div className="flex gap-1">
                    {[60, 90, 120, 180].map((t) => (
                      <button key={t} onClick={() => setRestTarget(t)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                          restTarget === t ? "text-white" : "bg-muted text-muted-foreground"
                        )}
                        style={restTarget === t ? { background: THEME.teal } : undefined}
                      >
                        {t}s
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Set logging grid */}
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Set</div>
            <div className="col-span-4">Weight (kg)</div>
            <div className="col-span-4">Reps</div>
            <div className="col-span-2 text-center">Done</div>
          </div>
          {currentSets.map((set, setIdx) => {
            const typeConfig = SET_TYPE_CONFIG[set.type];
            return (
              <div key={setIdx}>
                <div
                  className={cn(
                    "grid grid-cols-12 gap-2 items-center px-4 py-2.5 border-t border-border/30",
                    setIdx === currentSetIndex && !set.completed && "bg-primary/5",
                    set.completed && "opacity-60",
                    typeConfig.bg,
                  )}
                >
                  <div className="col-span-2 flex justify-center">
                    <button
                      onClick={() => cycleSetType(currentExIndex, setIdx)}
                      disabled={set.completed}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                        typeConfig.color,
                        set.type !== "working" ? "border border-current" : "",
                      )}
                      title={`Set type: ${set.type}`}
                    >
                      {set.type === "working" ? setIdx + 1 : typeConfig.label}
                    </button>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={set.weight || ""}
                      onChange={(e) => updateSetLog(currentExIndex, setIdx, "weight", Number(e.target.value) || 0)}
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={set.reps || ""}
                      onChange={(e) => updateSetLog(currentExIndex, setIdx, "reps", Number(e.target.value) || 0)}
                      disabled={set.completed}
                      className="w-full px-2 py-1.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {set.completed ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-border" />
                    )}
                  </div>
                </div>
                {/* RPE selector for completed sets */}
                {showRPE && set.completed && (
                  <div className="flex gap-1 px-4 py-1.5 border-t border-border/20 bg-muted/30">
                    <span className="text-[10px] text-muted-foreground mr-1 self-center">RPE:</span>
                    {RPE_OPTIONS.map((rpe) => (
                      <button
                        key={rpe}
                        onClick={() => updateSetRPE(currentExIndex, setIdx, rpe)}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                          set.rpe === rpe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {rpe}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Set button */}
          <button
            onClick={() => addSet(currentExIndex)}
            className="w-full py-2.5 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add Set
          </button>
        </div>

        {/* RPE toggle */}
        <button
          onClick={() => setShowRPE(!showRPE)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg transition-colors mx-auto block",
            showRPE ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {showRPE ? "Hide RPE" : "Show RPE"}
        </button>

        {/* Prescription hint */}
        {currentExercise && (
          <p className="text-xs text-muted-foreground text-center">
            Target: {currentExercise.sets}&times;{currentExercise.reps} @{" "}
            {currentExercise.weight > 0 ? `${currentExercise.weight}kg` : "bodyweight"}
          </p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        {isResting ? (
          <button
            onClick={stopRest}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Play className="w-4 h-4" /> Ready — Start Next Set
          </button>
        ) : (
          <button
            onClick={completeSet}
            disabled={!currentSets[currentSetIndex] || currentSets[currentSetIndex]?.completed}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {currentSetIndex >= currentSets.length - 1 && currentExIndex >= day.exercises.length - 1
              ? "Finish Last Set"
              : currentSetIndex >= currentSets.length - 1
                ? "Complete Exercise"
                : `Complete Set ${currentSetIndex + 1}`}
          </button>
        )}
      </div>
    </div>
  );
}