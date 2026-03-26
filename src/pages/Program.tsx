import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { getProgressionLabel, getProgressionDirection } from "@/features/program/programEngine";
import type { ProgramExercise, Goal } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import WorkoutSession from "@/components/WorkoutSession";
import { PlateCalculator } from "@/components/PlateCalculator";
import { THEME } from "@/lib/theme";
import { getTodaySchedule, generateSchedule } from "@/lib/scheduleUtils";
import {
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
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
  Calculator,
  Pencil,
  Check,
  Footprints,
  Leaf,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getExerciseById } from "@/lib/exercises";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { DndContext, closestCenter, TouchSensor, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import CustomDayBuilder from "@/components/program/CustomDayBuilder";

/**
 * IMPORTANT:
 * React error #310 is very commonly caused by hook order mismatches when gated UI
 * flips between renders (e.g. subscription/features loading).
 *
 * Fix: split into a gate component (subscription only) + inner component (program hook).
 */

function DirectionIcon({ ex }: { ex: ProgramExercise }) {
  const dir = getProgressionDirection(ex);
  if (dir === "up") return <TrendingUp className="w-3.5 h-3.5" style={{ color: THEME.success }} />;
  if (dir === "down") return <TrendingDown className="w-3.5 h-3.5" style={{ color: THEME.danger }} />;
  return null;
}

function ProgressionLabel({ ex }: { ex: ProgramExercise }) {
  const label = getProgressionLabel(ex);
  const dir = getProgressionDirection(ex);
  if (dir === "stable") return null;
  const color = dir === "up" ? THEME.success : dir === "down" ? THEME.danger : undefined;
  return <><span className="text-xs">&middot;</span><span className="font-medium" style={color ? { color } : undefined}>{label}</span></>;
}

export default function Program() {
  const { features } = useSubscription();
  return <ProgramInner phaseLocked={!features.phaseModes} />;
}

function ProgramInner({ phaseLocked = false }: { phaseLocked?: boolean }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
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
    saveProgram,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  } = useProgram();

  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsPanelRef = useFocusTrap<HTMLDivElement>(showSettings);
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);
  const [weekExpanded, setWeekExpanded] = useState(false);

  // Exercise drawer state
  const [drawerExercise, setDrawerExercise] = useState<{
    dayIndex: number;
    exIndex: number;
    exercise: ProgramExercise;
  } | null>(null);
  const exerciseDrawerRef = useFocusTrap<HTMLDivElement>(!!drawerExercise);
  const [logReps, setLogReps] = useState("");
  const [logWeight, setLogWeight] = useState("");

  // Inline card editing state
  const [expandedCardIdx, setExpandedCardIdx] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ sets: number; reps: number; weight: number } | null>(null);

  const expandCard = (idx: number, ex: ProgramExercise) => {
    if (expandedCardIdx !== null && expandedCardIdx !== idx) {
      // Collapse current, then expand new after animation
      saveAndCollapseCard(expandedCardIdx);
      setTimeout(() => {
        setExpandedCardIdx(idx);
        setEditValues({ sets: ex.sets, reps: ex.reps, weight: ex.weight });
      }, 300);
    } else if (expandedCardIdx === idx) {
      saveAndCollapseCard(idx);
    } else {
      setExpandedCardIdx(idx);
      setEditValues({ sets: ex.sets, reps: ex.reps, weight: ex.weight });
    }
  };

  const saveAndCollapseCard = async (idx: number) => {
    if (editValues && todayWorkoutIndex !== null) {
      await updateExercise(todayWorkoutIndex, idx, editValues);
    }
    setExpandedCardIdx(null);
    setEditValues(null);
  };

  // Save feedback states
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);

  const handleSaveCustomDay = async (dayIdx: number, exercises: ProgramExercise[], isCustom: boolean) => {
    if (!programState) return;
    const updatedWorkouts = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises, isCustom } : d
    );
    await saveProgram({ ...programState, workouts: updatedWorkouts });
  };

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = async (dayIndex: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !programState) return;

    const exercises = programState.workouts[dayIndex].exercises;
    const oldIdx = exercises.findIndex((_, i) => `ex-${dayIndex}-${i}` === active.id);
    const newIdx = exercises.findIndex((_, i) => `ex-${dayIndex}-${i}` === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(exercises, oldIdx, newIdx);
    const updatedWorkouts = programState.workouts.map((d, i) =>
      i === dayIndex ? { ...d, exercises: reordered } : d
    );

    // Green flash
    setJustDroppedId(`ex-${dayIndex}-${newIdx}`);
    setTimeout(() => setJustDroppedId(null), 300);

    // Persist via useProgram's saveProgram
    const updatedState = { ...programState, workouts: updatedWorkouts };
    await saveProgram(updatedState);
  };

  // Today's day type from schedule (must be before early return — hooks rule)
  const todayDayType = useMemo(() => {
    const schedule = profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : generateSchedule(profile?.weeklyWorkoutsTarget || 3, profile?.weeklyRunsTarget || 2);
    const today = getTodaySchedule(schedule);
    return (today?.type || "rest") as "lift" | "run" | "both" | "rest";
  }, [profile]);

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

  // Today's workout = first incomplete day (same logic as Home page)
  const todayWorkout = !isViewingHistory
    ? programState.workouts.find((d) => !d.completed) ?? null
    : null;
  const todayWorkoutIndex = todayWorkout
    ? programState.workouts.indexOf(todayWorkout)
    : -1;

  // Next workout after today (for rest day preview)
  const nextUpWorkout = !isViewingHistory
    ? programState.workouts.find((d) => !d.completed) ?? null
    : null;
  const nextUpDayName = nextUpWorkout?.dayName ?? null;

  const handleRegenerate = async (goalOverride?: string, weeklyTargetOverride?: number) => {
    setRegenerating(true);
    await regenerateProgram(goalOverride, weeklyTargetOverride);
    setRegenerating(false);
    setShowSettings(false);
  };

  const handleAdvanceWeek = async () => {
    setAdvancing(true);
    await advanceToNextWeek();
    setAdvancing(false);
  };

  // Progression increment based on exercise type
  const getProgressionIncrement = (ex: ProgramExercise): number => {
    const lowerCompound = ["knee_dominant", "hip_dominant"];
    const upperCompound = ["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"];
    if (lowerCompound.includes(ex.movementCategory)) return 2.5;
    if (upperCompound.includes(ex.movementCategory)) return 1.25;
    return 0.5; // isolation
  };

  const openDrawer = (dayIndex: number, exIndex: number, exercise: ProgramExercise) => {
    setDrawerExercise({ dayIndex, exIndex, exercise });

    // Auto-fill from previous session with progressive overload
    const lastPerf = exercise.performanceHistory[exercise.performanceHistory.length - 1];
    if (lastPerf) {
      const passed = lastPerf.repsCompleted >= lastPerf.repsTarget;
      if (passed) {
        // Passed last session — apply progressive overload
        const increment = getProgressionIncrement(exercise);
        setLogWeight((lastPerf.weight + increment).toString());
      } else {
        // Failed — repeat same weight
        setLogWeight(lastPerf.weight.toString());
      }
      setLogReps(exercise.reps.toString());
    } else {
      // No history — use prescription defaults
      setLogReps(exercise.reps.toString());
      setLogWeight(exercise.weight.toString());
    }
  };

  const closeDrawer = () => {
    setDrawerExercise(null);
    setLogReps("");
    setLogWeight("");
  };

  const handleLogExercise = async () => {
    if (!drawerExercise || savingState !== "idle") return;
    setSavingState("saving");
    await logExercise(
      drawerExercise.dayIndex,
      drawerExercise.exIndex,
      Number(logReps) || 0,
      Number(logWeight) || 0
    );
    setSavingState("saved");
    setTimeout(() => {
      setSavingState("idle");
      closeDrawer();
    }, 800);
  };

  const handleSetsChange = async (delta: number) => {
    if (!drawerExercise) return;
    const newSets = Math.max(1, Math.min(10, drawerExercise.exercise.sets + delta));
    if (newSets === drawerExercise.exercise.sets) return;

    await updateExercise(drawerExercise.dayIndex, drawerExercise.exIndex, { sets: newSets });
    setDrawerExercise({
      ...drawerExercise,
      exercise: { ...drawerExercise.exercise, sets: newSets },
    });
  };

  // Week navigation
  const canGoBack = history.length > 0;
  const canGoForward = isViewingHistory;

  const goBack = () => {
    if (isViewingHistory) {
      const newIdx = (viewingHistoryIndex ?? 0) - 1;
      viewWeek(newIdx >= 0 ? newIdx : null);
    } else if (history.length > 0) {
      viewWeek(history.length - 1);
    }
  };

  const goForward = () => {
    if (!isViewingHistory) return;
    const idx = viewingHistoryIndex ?? 0;
    if (idx < history.length - 1) {
      viewWeek(idx + 1);
    } else {
      viewWeek(null);
    }
  };

  // Goal display name
  const goalLabel = (g: string) => {
    if (g === "lean bulk") return "Lean Bulk";
    return g.charAt(0).toUpperCase() + g.slice(1);
  };

  // Hero section helpers
  const isLiftToday = todayDayType === "lift" || todayDayType === "both";
  const isRestDay = todayDayType === "rest";

  return (
    <div className="space-y-4">
      {phaseLocked && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <Lock className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Phase Modes Locked</p>
            <p className="text-xs text-muted-foreground">Upgrade to Pro for advanced periodisation and AI adjustments</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Program</h1>
            <p className="text-xs text-muted-foreground">
              {programState.splitType === "ppl" ? "Push / Pull / Legs" : "Upper / Lower"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => !phaseLocked && setShowSettings(true)}
              disabled={phaseLocked}
              className={cn("p-2 rounded-lg hover:bg-muted transition-colors", phaseLocked && "opacity-40")}
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => handleRegenerate()}
              disabled={regenerating || phaseLocked}
              className={cn("p-2 rounded-lg hover:bg-muted transition-colors", phaseLocked && "opacity-40")}
            >
              <RefreshCw className={cn("w-4 h-4 text-muted-foreground", regenerating && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ TODAY'S WORKOUT HERO ═══ */}
      {!isViewingHistory && (
        <section aria-label="Today's workout">
          {/* LIFT DAY or BOTH DAY — show exercise cards */}
          {isLiftToday && todayWorkout && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${THEME.lifting}15` }}>
                  <Dumbbell className="w-3.5 h-3.5" style={{ color: THEME.lifting }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Today · {todayWorkout.dayName}</p>
                  <p className="text-xs text-muted-foreground">
                    Day {todayWorkoutIndex + 1} · Week {displayWeekNumber} · {todayWorkout.exercises.length} exercises
                  </p>
                </div>
              </div>

              {/* Exercise cards — tap to expand for inline editing */}
              <div className="space-y-1.5">
                {todayWorkout.exercises.map((ex, i) => {
                  const isExpanded = expandedCardIdx === i;
                  const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";

                  return (
                    <div key={i} className="rounded-xl bg-card overflow-hidden" style={isExpanded ? { borderLeft: "3px solid #7C6BF0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" } : undefined}>
                      {/* Card header — always visible */}
                      <button
                        onClick={() => expandCard(i, ex)}
                        className="w-full flex items-center gap-3 p-3 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${THEME.lifting}10` }}>
                          <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                          {!isExpanded && (
                            <p className="text-xs text-muted-foreground">
                              {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 1 ? ` · ${ex.weight}kg` : ""}
                            </p>
                          )}
                        </div>
                        {isExpanded ? (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#F0EDFD", minWidth: 44, minHeight: 44 }}>
                            <Check className="w-[18px] h-[18px]" style={{ color: "#7C6BF0" }} />
                          </div>
                        ) : (
                          <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: "#C7C7CC", opacity: 0.3 }} />
                        )}
                      </button>

                      {/* Expanded inline editing */}
                      <AnimatePresence>
                        {isExpanded && editValues && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1, transition: { height: { duration: 0.25 }, opacity: { duration: 0.15, delay: 0.1 } } }}
                            exit={{ opacity: 0, height: 0, transition: { opacity: { duration: 0.1 }, height: { duration: 0.2, delay: 0.1 } } }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-end gap-1.5 px-3 pb-3 ml-11">
                              <div className="flex flex-col items-center">
                                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" as const, color: "#8E8E93", marginBottom: 4 }}>S</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={editValues.sets}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v)) setEditValues((prev) => prev ? { ...prev, sets: Math.max(1, Math.min(20, v)) } : prev);
                                  }}
                                  className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                                  style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: "#1C1C1E" }}
                                />
                              </div>
                              <div className="flex flex-col items-center">
                                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" as const, color: "#8E8E93", marginBottom: 4 }}>R</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={editValues.reps}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v)) setEditValues((prev) => prev ? { ...prev, reps: Math.max(1, Math.min(100, v)) } : prev);
                                  }}
                                  className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                                  style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: "#1C1C1E" }}
                                />
                              </div>
                              <div className="flex flex-col items-center">
                                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" as const, color: "#8E8E93", marginBottom: 4 }}>W</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.]*"
                                    value={editValues.weight || ""}
                                    placeholder={isBW ? "BW" : "0"}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value);
                                      setEditValues((prev) => prev ? { ...prev, weight: isNaN(v) ? 0 : Math.max(0, v) } : prev);
                                    }}
                                    className="focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                                    style={{ width: 64, height: 34, borderRadius: 6, backgroundColor: "#E5E5EA", border: "none", textAlign: "center", fontSize: 15, fontWeight: 500, color: editValues.weight ? "#1C1C1E" : "#C7C7CC" }}
                                  />
                                  <span style={{ fontSize: 12, fontWeight: 500, color: "#C7C7CC", width: 20, textAlign: "center", flexShrink: 0 }}>kg</span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Begin Workout button */}
              <button
                onClick={() => setSessionDayIndex(todayWorkoutIndex)}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                style={{ background: THEME.gradient.brand }}
              >
                <Play className="w-4 h-4" /> Begin Workout
              </button>

              {/* Edit Day + Skip */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setEditingDayIndex(todayWorkoutIndex)}
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit Day
                </button>
                <span className="text-muted-foreground/30">·</span>
                <button
                  onClick={() => completeWorkoutDay(todayWorkoutIndex)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip Session
                </button>
              </div>
            </div>
          )}

          {/* RUN DAY (run only, not both) — show run card */}
          {todayDayType === "run" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${THEME.running}15` }}>
                  <Footprints className="w-3.5 h-3.5" style={{ color: THEME.running }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Today · Run Day</p>
                  <p className="text-xs text-muted-foreground">Week {displayWeekNumber}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card" style={{ borderLeft: `3px solid ${THEME.running}` }}>
                <p className="text-xs uppercase tracking-wider font-bold" style={{ color: THEME.running }}>Run · Scheduled</p>
                <p className="text-sm font-semibold text-foreground mt-1">Today's Run</p>
                <p className="text-xs text-muted-foreground mt-0.5">Start your run when you're ready</p>
                <button
                  onClick={() => navigate("/run")}
                  className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ backgroundColor: THEME.running }}
                >
                  <Play className="w-4 h-4" /> Start Run
                </button>
              </div>
            </div>
          )}

          {/* BOTH DAY — stacked lift + run cards */}
          {todayDayType === "both" && (
            <div className="mt-3">
              <div className="p-4 rounded-xl bg-card" style={{ borderLeft: `3px solid ${THEME.running}` }}>
                <p className="text-xs uppercase tracking-wider font-bold" style={{ color: THEME.running }}>Run · Scheduled</p>
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Today's Run</p>
                    <p className="text-xs text-muted-foreground">Start your run when you're ready</p>
                  </div>
                  <button
                    onClick={() => navigate("/run")}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5"
                    style={{ backgroundColor: THEME.running }}
                  >
                    <Play className="w-3 h-3" fill="white" /> Start
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* REST DAY */}
          {isRestDay && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${THEME.success}15` }}>
                  <Leaf className="w-3.5 h-3.5" style={{ color: THEME.success }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Recovery Day</p>
                  <p className="text-xs text-muted-foreground">Week {displayWeekNumber}</p>
                </div>
              </div>

              {/* Next workout preview */}
              {nextUpDayName && (
                <div className="p-3 rounded-xl bg-card" style={{ borderLeft: `3px solid ${THEME.text.muted}` }}>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Up Next</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: "#888" }}>{nextUpDayName} · {nextUpWorkout?.exercises.length} exercises</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rest helps your muscles grow stronger</p>
                </div>
              )}

              {/* Ad-hoc buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Find first incomplete workout and start it
                    const idx = programState.workouts.findIndex((d) => !d.completed);
                    if (idx >= 0) setSessionDayIndex(idx);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border/50 text-muted-foreground text-sm font-medium active:scale-[0.97] transition-all hover:border-primary/30"
                >
                  <Dumbbell className="w-4 h-4" /> Quick Lift
                </button>
                <button
                  onClick={() => navigate("/run")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border/50 text-muted-foreground text-sm font-medium active:scale-[0.97] transition-all hover:border-primary/30"
                >
                  <Footprints className="w-4 h-4" /> Easy Run
                </button>
              </div>
            </div>
          )}

          {/* All workouts complete this week */}
          {!isRestDay && !todayWorkout && allComplete && (
            <div className="p-4 rounded-xl bg-card text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
              <p className="text-sm font-semibold text-foreground">All sessions complete!</p>
              <p className="text-xs text-muted-foreground">Great work this week. Advance to start fresh.</p>
            </div>
          )}
        </section>
      )}

      {/* ═══ VIEW FULL WEEK TOGGLE ═══ */}
      <button
        onClick={() => setWeekExpanded(!weekExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card active:scale-[0.98] transition-transform"
      >
        <span className="text-sm text-muted-foreground font-medium">
          View full week ({completedCount}/{totalDays} done)
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", weekExpanded && "rotate-180")} />
      </button>

      {/* ═══ COLLAPSIBLE WEEK CONTENT ═══ */}
      <AnimatePresence>
        {weekExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-4">
              {/* Phase + Week Header */}
              <div className="bg-card rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={goBack}
                    disabled={!canGoBack}
                    className={cn("w-8 h-8 flex items-center justify-center rounded-full transition-all", canGoBack ? "hover:bg-muted active:scale-[0.95]" : "opacity-30")}
                  >
                    <ChevronLeft className="w-4 h-4 text-foreground" />
                  </button>

                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground tracking-tight">
                      Week {displayWeekNumber}
                      {isViewingHistory && <span className="text-muted-foreground font-normal"> (past)</span>}
                    </p>
                  </div>

                  <button
                    onClick={goForward}
                    disabled={!canGoForward}
                    className={cn("w-8 h-8 flex items-center justify-center rounded-full transition-all", canGoForward ? "hover:bg-muted active:scale-[0.95]" : "opacity-30")}
                  >
                    <ChevronRight className="w-4 h-4 text-foreground" />
                  </button>
                </div>
                {!canGoBack && !canGoForward && (
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    Complete all sessions to advance to Week {displayWeekNumber + 1}
                  </p>
                )}

                <div className="flex items-center justify-center gap-2 px-4 pb-3 -mt-1">
                  <span className="px-2.5 py-0.5 rounded-full border text-xs font-medium border-primary/30 text-primary">
                    {goalLabel(programState.goal)}
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-full border text-xs font-medium"
                    style={prescription.deload
                      ? { borderColor: `${THEME.lifting}40`, color: THEME.lifting }
                      : { borderColor: `${THEME.success}40`, color: THEME.success }
                    }
                  >
                    {prescription.deload ? "Deload" : "Progression"}
                  </span>
                  {!isViewingHistory && (
                    <span className="px-2.5 py-0.5 rounded-full border border-border text-xs font-medium text-muted-foreground">
                      {completedCount}/{totalDays} done
                    </span>
                  )}
                </div>
              </div>

              {/* Phase explanation card */}
              {!isViewingHistory && !phaseLocked && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="mx-4 mb-3 p-3 rounded-xl text-xs space-y-1"
                  style={{
                    backgroundColor: prescription.deload ? `${THEME.lifting}08` : `${THEME.success}08`,
                    borderLeft: `3px solid ${prescription.deload ? THEME.lifting : THEME.success}`,
                  }}
                >
                  <p className="font-semibold text-foreground">
                    {prescription.deload
                      ? "Recovery Week"
                      : `Week ${displayWeekNumber} — ${prescription.intensityMultiplier > 1 ? "Intensity building" : "Base volume"}`
                    }
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {prescription.deload
                      ? "Volume reduced to ~70%. Focus on form and recovery — your body adapts and grows during rest, not just during training."
                      : prescription.intensityMultiplier > 1.05
                      ? `Intensity at ${Math.round(prescription.intensityMultiplier * 100)}% of baseline. Progressive overload in action — small increases compound over time.`
                      : "Building your base volume. Consistent effort now sets up bigger gains in the coming weeks."
                    }
                  </p>
                </motion.div>
              )}

              {/* Advance Week Button */}
              {allComplete && !isViewingHistory && !phaseLocked && (
                <button
                  onClick={handleAdvanceWeek}
                  disabled={advancing}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <FastForward className="w-4 h-4" />
                  {advancing ? "Advancing..." : "Advance to Next Week"}
                </button>
              )}

              {/* Workout Day Cards */}
              <section aria-label="Workout days">
              <div className="space-y-2">
                {displayWorkouts.map((day, dayIndex) => {
                  const dayType = day.dayName?.toLowerCase() ?? '';
                  const isUpper = dayType.includes('upper') || dayType.includes('push') || dayType.includes('pull');
                  const firstIncompleteIndex = displayWorkouts.findIndex(d => !d.completed);
                  const isCurrent = !day.completed && dayIndex === firstIncompleteIndex;
                  const sportColor = isUpper ? THEME.lifting : THEME.running;

                  return (
                  <div
                    key={dayIndex}
                    className={cn(
                      "rounded-2xl overflow-hidden transition-all",
                      day.completed ? "opacity-70" : ""
                    )}
                    style={{
                      background: isCurrent
                        ? `linear-gradient(135deg, ${sportColor}18 0%, ${sportColor}08 100%)`
                        : 'var(--card)',
                      borderLeft: isCurrent ? `3px solid ${sportColor}` : undefined,
                    }}
                  >
                    {/* Current day label */}
                    {isCurrent && (
                      <div className="px-3 pt-2.5 pb-0">
                        <span className="text-[11px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-md"
                          style={{ color: sportColor, background: `${sportColor}12` }}>
                          Up next
                        </span>
                      </div>
                    )}

                    {/* Day Header */}
                    <button
                      onClick={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
                      className="w-full flex items-center p-3 gap-3"
                    >
                      {/* Completion indicator */}
                      <div className="shrink-0">
                        {day.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : isCurrent ? (
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: sportColor }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: sportColor }} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/20" />
                        )}
                      </div>

                      {/* Day label + type */}
                      <div className="flex-1 text-left min-w-0">
                        <p className={cn("text-sm font-semibold", day.completed ? "text-muted-foreground" : "text-foreground")}>
                          Day {dayIndex + 1}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {day.dayName} &middot; {day.exercises.length} exercises
                          {day.isCustom && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-medium">Custom</span>
                          )}
                        </p>
                      </div>

                      {day.completed && (
                        <span className="text-xs font-medium text-green-500 mr-1">Done</span>
                      )}
                      {expandedDay === dayIndex ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
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
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(dayIndex, e)}>
                              <SortableContext items={day.exercises.map((_, i) => `ex-${dayIndex}-${i}`)} strategy={verticalListSortingStrategy}>
                                {day.exercises.map((ex, exIndex) => (
                                  <SortableExerciseRow key={`ex-${dayIndex}-${exIndex}`} id={`ex-${dayIndex}-${exIndex}`} justDropped={justDroppedId === `ex-${dayIndex}-${exIndex}`}>
                                    <button
                                      onClick={() => openDrawer(dayIndex, exIndex, ex)}
                                      className={cn(
                                        "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                                        day.completed ? "bg-muted/30 opacity-60" : "bg-muted/50 hover:bg-muted"
                                      )}
                                    >
                                      <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                          <span>{ex.sets}&times;{ex.reps}</span>
                                          {ex.weight > 0 && (() => {
                                            const dir = getProgressionDirection(ex);
                                            const baseWeight = (dir !== "stable" && ex.lastAttemptedWeight && ex.lastAttemptedWeight > 0)
                                              ? ex.lastAttemptedWeight
                                              : ex.weight;
                                            if (dir === "stable" || baseWeight === ex.weight) {
                                              return (
                                                <>
                                                  <span className="text-xs">&middot;</span>
                                                  <span className="font-mono">{ex.weight}kg</span>
                                                </>
                                              );
                                            }
                                            return (
                                              <>
                                                <span className="text-xs">&middot;</span>
                                                <span className="font-mono">{baseWeight}kg</span>
                                                <ProgressionLabel ex={ex} />
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                      {ex.lastPerformance && <DirectionIcon ex={ex} />}
                                    </button>
                                  </SortableExerciseRow>
                                ))}
                              </SortableContext>
                            </DndContext>

                            {/* Edit Day */}
                            {!day.completed && !isViewingHistory && (
                              <button
                                onClick={() => setEditingDayIndex(dayIndex)}
                                className="w-full py-2 rounded-lg bg-muted/50 text-foreground text-xs font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit day
                              </button>
                            )}

                            {/* Start Workout Session */}
                            {!day.completed && (
                              <button
                                onClick={() => setSessionDayIndex(dayIndex)}
                                className="w-full py-3 mt-1 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                                style={{ background: THEME.gradient.brand }}
                              >
                                <Play className="w-4 h-4" /> Start Workout
                              </button>
                            )}

                            {/* Complete Day button */}
                            {!day.completed && (
                              <button
                                onClick={() => completeWorkoutDay(dayIndex)}
                                className="w-full py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                              >
                                Skip session
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
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exercise Detail Drawer */}
      <AnimatePresence>
        {drawerExercise && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              ref={exerciseDrawerRef}
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[80vh] overflow-y-auto safe-area-pb bg-background border-t border-border shadow-xl"
            >
              <div className="max-w-md mx-auto p-4 space-y-3">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />

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

                {/* Current prescription with adjustable sets */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted rounded-lg p-2 relative">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleSetsChange(-1)}
                        className="w-8 h-8 rounded-full bg-background border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-colors touch-target"
                      >
                        <Minus className="w-3 h-3 text-foreground" />
                      </button>
                      <p className="text-lg font-bold text-foreground w-8 font-mono tabular-nums">{drawerExercise.exercise.sets}</p>
                      <button
                        onClick={() => handleSetsChange(1)}
                        className="w-8 h-8 rounded-full bg-background border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-colors touch-target"
                      >
                        <Plus className="w-3 h-3 text-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Sets</p>
                  </div>

                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold text-foreground font-mono tabular-nums">{drawerExercise.exercise.reps}</p>
                    <p className="text-xs text-muted-foreground">Reps</p>
                  </div>

                  <div className="bg-muted rounded-lg p-2">
                    <p className={`font-bold text-foreground font-mono tabular-nums ${drawerExercise.exercise.weight > 0 ? 'text-lg' : 'text-sm'}`}>
                      {drawerExercise.exercise.weight > 0 ? drawerExercise.exercise.weight : "Bodyweight"}
                    </p>
                    <p className="text-xs text-muted-foreground">{drawerExercise.exercise.weight > 0 ? "kg" : ""}</p>
                  </div>
                </div>

                {/* Previous session */}
                {drawerExercise.exercise.performanceHistory.length > 0 && (() => {
                  const last = drawerExercise.exercise.performanceHistory[
                    drawerExercise.exercise.performanceHistory.length - 1
                  ];
                  const passed = last.repsCompleted >= last.repsTarget;
                  return (
                    <div className="rounded-lg p-3 space-y-1 border border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Previous Session</p>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={passed
                            ? { backgroundColor: `${THEME.success}18`, color: THEME.success }
                            : { backgroundColor: `${THEME.danger}18`, color: THEME.danger }
                          }
                        >
                          {passed ? "Pass" : "Fail"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-foreground font-medium">
                          {last.weight > 0 ? `${last.weight}kg` : "Bodyweight"}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground">
                          {last.repsCompleted}/{last.repsTarget} reps
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{last.date}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Log form */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-muted-foreground">Log Performance</p>
                    {(() => {
                      const lastPerf = drawerExercise.exercise.performanceHistory[
                        drawerExercise.exercise.performanceHistory.length - 1
                      ];
                      if (lastPerf && lastPerf.repsCompleted >= lastPerf.repsTarget) {
                        const inc = getProgressionIncrement(drawerExercise.exercise);
                        return (
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${THEME.success}18`, color: THEME.success }}
                          >
                            +{inc}kg auto-fill
                          </span>
                        );
                      }
                      if (lastPerf) {
                        return (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            repeat weight
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label htmlFor="log-weight" className="text-xs text-muted-foreground">Weight (kg)</label>
                      <input
                        id="log-weight"
                        type="number"
                        value={logWeight}
                        onChange={(e) => setLogWeight(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="log-reps" className="text-xs text-muted-foreground">Reps</label>
                      <input
                        id="log-reps"
                        type="number"
                        value={logReps}
                        onChange={(e) => setLogReps(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                      />
                    </div>
                  </div>
                  {/* Estimated 1RM */}
                  {Number(logWeight) > 0 && Number(logReps) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Est. 1RM: <span className="font-semibold text-foreground">
                        {Math.round(Number(logWeight) * (1 + Number(logReps) / 30))}kg
                      </span>
                    </p>
                  )}

                  {/* Plate Calculator Toggle */}
                  {drawerExercise.exercise.weight > 0 && (
                    <button
                      onClick={() => setShowPlateCalc(!showPlateCalc)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      {showPlateCalc ? "Hide" : "Plate"} Calculator
                    </button>
                  )}
                </div>

                {showPlateCalc && drawerExercise.exercise.weight > 0 && (
                  <PlateCalculator weight={Number(logWeight) || drawerExercise.exercise.weight || 20} onClose={() => setShowPlateCalc(false)} />
                )}

                <button
                  onClick={handleLogExercise}
                  disabled={savingState !== "idle" || phaseLocked}
                  className={cn(
                    "w-full py-3 rounded-xl text-sm font-medium transition-all",
                    savingState !== "saved" && "bg-primary text-primary-foreground hover:opacity-90",
                    (savingState === "saving" || phaseLocked) && "opacity-50 cursor-not-allowed"
                  )}
                  style={savingState === "saved" ? { backgroundColor: THEME.success, color: "#fff" } : undefined}
                >
                  {phaseLocked
                    ? "Upgrade to Pro"
                    : savingState === "saving"
                    ? "Saving..."
                    : savingState === "saved"
                    ? "Saved!"
                    : "Save Performance"}
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
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              ref={settingsPanelRef}
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb pointer-events-auto max-h-[85vh] overflow-y-auto"
              style={{ background: "var(--background)", border: "1px solid var(--border)", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-md mx-auto p-4 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />

                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-foreground">Program Settings</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowSettings(false)} className="text-sm font-medium text-primary">
                      Done
                    </button>
                    <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-muted">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Goal selector */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Goal</p>
                  <div className="flex gap-1">
                    {(["cut", "recomp", "lean bulk"] as Goal[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => handleRegenerate(g)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors pointer-events-auto",
                          programState.goal === g ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
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
                        onClick={() => handleRegenerate(undefined, s.value)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors pointer-events-auto",
                          s.split === programState.splitType ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
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
                      <p className="text-xs text-muted-foreground">Adjust weights after logging</p>
                    </div>
                    <button
                      onClick={() => updateSettings({ autoProgression: !settings.autoProgression })}
                      className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto", settings.autoProgression ? "bg-primary" : "bg-muted")}
                    >
                      <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.autoProgression ? "translate-x-5" : "translate-x-1")} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Microloading</p>
                      <p className="text-xs text-muted-foreground">+1kg steps for isolations</p>
                    </div>
                    <button
                      onClick={() => updateSettings({ microloading: !settings.microloading })}
                      className={cn("w-10 h-6 rounded-full transition-colors relative pointer-events-auto", settings.microloading ? "bg-primary" : "bg-muted")}
                    >
                      <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform", settings.microloading ? "translate-x-5" : "translate-x-1")} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleRegenerate()}
                  className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors pointer-events-auto"
                >
                  Reset Program
                </button>

                <div className="h-[120px]" />
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

      {/* Custom Day Builder */}
      {editingDayIndex !== null && programState.workouts[editingDayIndex] && (
        <CustomDayBuilder
          open={true}
          onClose={() => setEditingDayIndex(null)}
          dayIndex={editingDayIndex}
          dayName={programState.workouts[editingDayIndex].dayName}
          exercises={programState.workouts[editingDayIndex].exercises}
          onSave={handleSaveCustomDay}
        />
      )}
    </div>
  );
}