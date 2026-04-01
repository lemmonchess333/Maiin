import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import type { Goal } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import WorkoutSession from "@/components/WorkoutSession";
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
  MoreHorizontal,
  X,
  Plus,
  FastForward,
  Play,
  Footprints,
  Leaf,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Repeat,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getExerciseById } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { normalizeExercise } from "@/features/program/programTypes";
import { haptic } from "@/lib/haptic";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import { DndContext, closestCenter, TouchSensor, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import ExercisePicker from "@/components/program/ExercisePicker";
import ExerciseDemoCard from "@/components/ExerciseDemoCard";

/**
 * IMPORTANT:
 * React error #310 is very commonly caused by hook order mismatches when gated UI
 * flips between renders (e.g. subscription/features loading).
 *
 * Fix: split into a gate component (subscription only) + inner component (program hook).
 */



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
  const [showProSheet, setShowProSheet] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const settingsPanelRef = useFocusTrap<HTMLDivElement>(showSettings);
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<"today" | "week">("today");


  // Exercise card state — read-only, tap opens info sheet
  const [demoExercise, setDemoExercise] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addPickerDayIndex, setAddPickerDayIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ dayIndex: number; exIndex: number; x: number; y: number } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ dayIndex: number; exIndex: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Exercise management helpers — accept dayIdx to work on any day (auto-save to Firestore)
  const removeExFromDay = async (dayIdx: number, exIndex: number) => {
    if (!programState) return;
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== exIndex) } : d
    );
    await saveProgram({ ...programState, workouts: updated });
  };

  const removeExFromDayById = async (dayIdx: number, exerciseId: string) => {
    if (!programState) return;
    const exercises = programState.workouts[dayIdx]?.exercises;
    if (!exercises) return;
    const lastIdx = exercises.map(ex => ex.exerciseId).lastIndexOf(exerciseId);
    if (lastIdx === -1) return;
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== lastIdx) } : d
    );
    await saveProgram({ ...programState, workouts: updated });
  };

  const moveExercise = async (dayIdx: number, exIndex: number, direction: -1 | 1) => {
    if (!programState) return;
    const exercises = [...programState.workouts[dayIdx].exercises];
    const newIdx = exIndex + direction;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    [exercises[exIndex], exercises[newIdx]] = [exercises[newIdx], exercises[exIndex]];
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setContextMenu(null);
  };

  const replaceExercise = async (dayIdx: number, exIndex: number, newEx: Exercise) => {
    if (!programState) return;
    const old = programState.workouts[dayIdx].exercises[exIndex];
    const replacement = normalizeExercise({
      name: newEx.name, exerciseId: newEx.id,
      movementCategory: old.movementCategory, sets: old.sets, reps: old.reps, weight: old.weight,
    });
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: d.exercises.map((ex, ei) => ei === exIndex ? replacement : ex) } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setReplaceTarget(null);
  };

  const addExercisesToDay = async (dayIdx: number, exercises: Exercise[]) => {
    if (!programState) return;
    const newExs = exercises.map(e => normalizeExercise({ name: e.name, exerciseId: e.id, movementCategory: "horizontal_push", sets: 3, reps: 10, weight: 0 }));
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: [...d.exercises, ...newExs] } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setShowAddPicker(false);
  };

  const handleLongPressStart = (dayIdx: number, exIndex: number, e: React.TouchEvent) => {
    if (reorderMode) return;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimer.current = setTimeout(() => {
      haptic("medium");
      setContextMenu({ dayIndex: dayIdx, exIndex, x, y });
    }, 500);
  };

  const handleLongPressCancel = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Save feedback states
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

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
  // Force week view when browsing history
  const effectiveView = isViewingHistory ? "week" : activeView;
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

  function getDayMuscleGroups(exercises: { exerciseId: string }[]): string {
    const groups = exercises
      .map(ex => getExerciseById(ex.exerciseId)?.category)
      .filter(Boolean);
    const unique = [...new Set(groups)] as string[];
    if (unique.length === 0) return "";
    if (unique.length <= 3) return unique.join(" · ");
    return unique.slice(0, 3).join(" · ") + " + more";
  }

  return (
    <div className="space-y-4">

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
            {reorderMode ? (
              <button
                onClick={() => setReorderMode(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ color: "#7C6BF0" }}
              >
                Done
              </button>
            ) : (
              <button
                onClick={() => setReorderMode(true)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setShowOverflow(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ VIEW TOGGLE ═══ */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        <button onClick={() => { haptic("light"); setActiveView("today"); }}
          className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
            effectiveView === "today" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}>
          Today
        </button>
        <button onClick={() => { haptic("light"); setActiveView("week"); }}
          className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
            effectiveView === "week" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}>
          Week {displayWeekNumber}
        </button>
      </div>

      {/* ═══ TODAY'S WORKOUT HERO ═══ */}
      {effectiveView === "today" && !isViewingHistory && (
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
                    Day {todayWorkoutIndex + 1} · Week {displayWeekNumber} · {todayWorkout.exercises.length} exercises · ~{Math.round(todayWorkout.exercises.reduce((s, ex) => s + ex.sets, 0) * 2.5)} min
                  </p>
                  {getDayMuscleGroups(todayWorkout.exercises) && (
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>{getDayMuscleGroups(todayWorkout.exercises)}</p>
                  )}
                </div>
              </div>

              {/* Exercise cards — read-only, tap for info, swipe to delete, long-press menu */}
              {reorderMode ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd(todayWorkoutIndex, event)}>
                  <SortableContext items={todayWorkout.exercises.map((_, i) => `ex-${todayWorkoutIndex}-${i}`)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {todayWorkout.exercises.map((ex, i) => {
                        const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
                        return (
                          <SortableExerciseRow key={`ex-${todayWorkoutIndex}-${i}`} id={`ex-${todayWorkoutIndex}-${i}`} justDropped={justDroppedId === `ex-${todayWorkoutIndex}-${i}`} showHandle={true}>
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-card">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${THEME.lifting}10` }}>
                                <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 0 ? ` · ${ex.weight}kg` : ""}
                                </p>
                              </div>
                            </div>
                          </SortableExerciseRow>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-1.5">
                  {todayWorkout.exercises.map((ex, i) => {
                    const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
                    return (
                      <SortableExerciseRow key={`ex-${todayWorkoutIndex}-${i}`} id={`ex-${todayWorkoutIndex}-${i}`} showHandle={false} onDelete={() => removeExFromDay(todayWorkoutIndex!, i)}>
                        <button
                          onClick={() => setDemoExercise(ex.name)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card text-left active:scale-[0.97] transition-transform"
                          onTouchStart={(e) => handleLongPressStart(todayWorkoutIndex!, i, e)}
                          onTouchMove={handleLongPressCancel}
                          onTouchEnd={handleLongPressCancel}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${THEME.lifting}10` }}>
                            <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 0 ? ` · ${ex.weight}kg` : ""}
                            </p>
                          </div>
                        </button>
                      </SortableExerciseRow>
                    );
                  })}
                </div>
              )}

              {/* + Add Exercise */}
              <button
                onClick={() => { setAddPickerDayIndex(todayWorkoutIndex); setShowAddPicker(true); }}
                className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: "#FFFFFF", borderRadius: 10, border: "none", color: "#7C6BF0", fontWeight: 500, fontSize: 15 }}
              >
                <Plus className="w-4 h-4" /> Add Exercise
              </button>

              {/* Long-press context menu */}
              <AnimatePresence>
                {contextMenu && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="fixed z-[201] bg-card rounded-xl shadow-lg border border-border/50 overflow-hidden"
                      style={{ top: Math.min(contextMenu.y, window.innerHeight - 220), left: Math.min(contextMenu.x - 80, window.innerWidth - 200), width: 200 }}
                    >
                      <button onClick={() => { setReplaceTarget({ dayIndex: contextMenu.dayIndex, exIndex: contextMenu.exIndex }); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30">
                        <Repeat className="w-4 h-4 text-muted-foreground" /> Replace Exercise
                      </button>
                      <button onClick={() => { removeExFromDay(contextMenu.dayIndex, contextMenu.exIndex); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-red-500 hover:bg-muted transition-colors border-b border-border/30">
                        <Trash2 className="w-4 h-4" /> Remove Exercise
                      </button>
                      <button onClick={() => moveExercise(contextMenu.dayIndex, contextMenu.exIndex, -1)} disabled={contextMenu.exIndex === 0} className={cn("w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30", contextMenu.exIndex === 0 && "opacity-30 cursor-not-allowed")}>
                        <ArrowUp className="w-4 h-4 text-muted-foreground" /> Move Up
                      </button>
                      <button onClick={() => moveExercise(contextMenu.dayIndex, contextMenu.exIndex, 1)} disabled={contextMenu.exIndex === (programState.workouts[contextMenu.dayIndex]?.exercises.length ?? 1) - 1} className={cn("w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors", contextMenu.exIndex === (programState.workouts[contextMenu.dayIndex]?.exercises.length ?? 1) - 1 && "opacity-30 cursor-not-allowed")}>
                        <ArrowDown className="w-4 h-4 text-muted-foreground" /> Move Down
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Sticky Begin Workout + Skip Session */}
              <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-4 safe-area-pb" style={{ boxShadow: "0 -1px 4px rgba(0,0,0,0.06)", backgroundColor: "var(--background)" }}>
                <button
                  onClick={() => { haptic("light"); setSessionDayIndex(todayWorkoutIndex); }}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: THEME.gradient.brand }}
                >
                  <Play className="w-4 h-4" /> Begin Workout
                </button>
                <div className="flex items-center justify-center mt-2">
                  <button
                    onClick={() => completeWorkoutDay(todayWorkoutIndex)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip Session
                  </button>
                </div>
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

      {/* ═══ WEEK VIEW ═══ */}
      {effectiveView === "week" && (
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
                  <p className="text-sm text-gray-400 text-center mt-3">
                    Complete all sessions to advance to Week {displayWeekNumber + 1}
                  </p>
                )}

                <div className="flex items-center justify-center gap-2 px-4 mt-2 mb-4">
                  <button
                    onClick={function() { if (phaseLocked) setShowProSheet(true); }}
                    className="inline-flex items-center justify-center whitespace-nowrap"
                    style={{
                      height: 28, paddingLeft: 12, paddingRight: 12, borderRadius: 14,
                      backgroundColor: "#7C6BF0", color: "white", fontSize: 13, fontWeight: 600,
                      border: "none", cursor: phaseLocked ? "pointer" : "default",
                    }}
                  >
                    {goalLabel(programState.goal)}
                    {phaseLocked && <Lock className="w-3 h-3 ml-1 inline shrink-0" />}
                  </button>
                  <button
                    onClick={function() { if (phaseLocked) setShowProSheet(true); }}
                    className="inline-flex items-center justify-center whitespace-nowrap"
                    style={{
                      height: 28, paddingLeft: 12, paddingRight: 12, borderRadius: 14,
                      backgroundColor: "transparent", border: "1.5px solid #D1D1D6", color: "#3C3C43", fontSize: 13, fontWeight: 500,
                      cursor: phaseLocked ? "pointer" : "default",
                    }}
                  >
                    {prescription.deload ? "Deload" : "Progression"}
                    {phaseLocked && <Lock className="w-3 h-3 ml-1 inline shrink-0" style={{ color: "#8E8E93" }} />}
                  </button>
                  {!isViewingHistory && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap" style={{
                      height: 28, paddingLeft: 12, paddingRight: 12, borderRadius: 14,
                      backgroundColor: "transparent", border: "1.5px solid #D1D1D6", color: "#8E8E93", fontSize: 13, fontWeight: 500,
                    }}>
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
                  const firstIncompleteIndex = displayWorkouts.findIndex(d => !d.completed);
                  const isCurrent = !day.completed && dayIndex === firstIncompleteIndex;

                  return (
                  <div
                    key={dayIndex}
                    className={cn(
                      "rounded-2xl overflow-hidden transition-all",
                      day.completed ? "opacity-70" : ""
                    )}
                    style={{
                      background: 'var(--card)',
                      borderLeft: isCurrent ? '3px solid #7C6BF0' : undefined,
                    }}
                  >
                    {/* Current day label */}
                    {isCurrent && (
                      <div className="px-3 pt-2.5 pb-0">
                        <span className="text-[11px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-md"
                          style={{ color: "#7C6BF0", background: "rgba(124, 107, 240, 0.08)" }}>
                          Up next
                        </span>
                      </div>
                    )}

                    {/* Day Header */}
                    <button
                      onClick={() => setExpandedDay(expandedDay === dayIndex ? null : dayIndex)}
                      className="w-full flex items-center p-3 gap-3 active:scale-[0.98] transition-transform"
                    >
                      {/* Completion indicator */}
                      <div className="shrink-0">
                        {day.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : isCurrent ? (
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: "#7C6BF0" }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: "#7C6BF0" }} />
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
                          {day.dayName} &middot; {day.exercises.length} exercises &middot; ~{Math.round(day.exercises.reduce((s, ex) => s + ex.sets, 0) * 2.5)} min
                          {day.isCustom && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-medium">Custom</span>
                          )}
                        </p>
                        {getDayMuscleGroups(day.exercises) && (
                          <p className="text-xs truncate" style={{ color: "#9CA3AF" }}>{getDayMuscleGroups(day.exercises)}</p>
                        )}
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
                          <div className="px-3 pb-3 space-y-1">
                            {/* Exercise preview — compact rows */}
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(dayIndex, e)}>
                              <SortableContext items={day.exercises.map((_, i) => `ex-${dayIndex}-${i}`)} strategy={verticalListSortingStrategy}>
                                {day.exercises.map((ex, exIndex) => {
                                  const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
                                  return (
                                    <SortableExerciseRow
                                      key={`ex-${dayIndex}-${exIndex}`}
                                      id={`ex-${dayIndex}-${exIndex}`}
                                      justDropped={justDroppedId === `ex-${dayIndex}-${exIndex}`}
                                      showHandle={reorderMode}
                                      onDelete={() => removeExFromDay(dayIndex, exIndex)}
                                    >
                                      <button
                                        onClick={() => setDemoExercise(ex.name)}
                                        className="w-full flex items-center gap-2.5 py-2 px-3 text-left active:scale-[0.97] transition-transform"
                                        onTouchStart={(e) => handleLongPressStart(dayIndex, exIndex, e)}
                                        onTouchMove={handleLongPressCancel}
                                        onTouchEnd={handleLongPressCancel}
                                      >
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${THEME.lifting}10` }}>
                                          <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 0 ? ` · ${ex.weight}kg` : ""}
                                          </p>
                                        </div>
                                      </button>
                                    </SortableExerciseRow>
                                  );
                                })}
                              </SortableContext>
                            </DndContext>

                            {/* + Add Exercise */}
                            {!day.completed && (
                              <button
                                onClick={() => { setAddPickerDayIndex(dayIndex); setShowAddPicker(true); }}
                                className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                                style={{ backgroundColor: "#FFFFFF", borderRadius: 10, border: "none", color: "#7C6BF0", fontWeight: 500, fontSize: 15 }}
                              >
                                <Plus className="w-4 h-4" /> Add Exercise
                              </button>
                            )}

                            {/* Conditional buttons based on day status */}
                            {isCurrent && !day.completed && (
                              <>
                                <button
                                  onClick={() => setSessionDayIndex(dayIndex)}
                                  className="w-full py-3 mt-1 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                                  style={{ background: THEME.gradient.brand }}
                                >
                                  <Play className="w-4 h-4" /> Begin Workout
                                </button>
                                <div className="flex items-center justify-center">
                                  <button
                                    onClick={() => completeWorkoutDay(dayIndex)}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    Skip Session
                                  </button>
                                </div>
                              </>
                            )}
                            {day.completed && (
                              <p style={{ color: "#4CAF50", fontSize: 15, fontWeight: 500, textAlign: "center", padding: "8px 0" }}>
                                Completed ✓
                              </p>
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
      )}

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

      {/* Exercise Picker — Add mode (scoped to addPickerDayIndex) */}
      <ExercisePicker
        open={showAddPicker}
        headerTitle="Add Exercise"
        existingExerciseIds={programState.workouts[addPickerDayIndex ?? todayWorkoutIndex ?? 0]?.exercises.map(ex => ex.exerciseId) ?? []}
        onSelect={(ex) => addExercisesToDay(addPickerDayIndex ?? todayWorkoutIndex!, [ex])}
        onMultiSelect={(exs) => addExercisesToDay(addPickerDayIndex ?? todayWorkoutIndex!, exs)}
        onClose={() => { setShowAddPicker(false); setAddPickerDayIndex(null); }}
        onRemoveExercise={(id) => removeExFromDayById(addPickerDayIndex ?? todayWorkoutIndex!, id)}
      />

      {/* Exercise Picker — Replace mode */}
      {replaceTarget !== null && (
        <ExercisePicker
          open={true}
          headerTitle={`Replace ${programState.workouts[replaceTarget.dayIndex]?.exercises[replaceTarget.exIndex]?.name || "Exercise"}`}
          onSelect={(ex) => replaceExercise(replaceTarget.dayIndex, replaceTarget.exIndex, ex)}
          onClose={() => setReplaceTarget(null)}
        />
      )}

      {/* Exercise Info Half-Sheet */}
      <ExerciseDemoCard
        exerciseName={demoExercise ?? ""}
        open={demoExercise !== null}
        onClose={() => setDemoExercise(null)}
      />

      {/* Overflow Menu Sheet */}
      <AnimatePresence>
        {showOverflow && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowOverflow(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50"
            >
              <div className="max-w-md mx-auto p-5 space-y-1">
                <div className="w-10 h-1 rounded-full bg-border mx-auto mb-3" />
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    if (phaseLocked) { setShowProSheet(true); } else { setShowSettings(true); }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <Settings2 className="w-4.5 h-4.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground flex-1">Programme Settings</span>
                  {phaseLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    if (phaseLocked) { setShowProSheet(true); } else { handleRegenerate(); }
                  }}
                  disabled={regenerating}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <RefreshCw className={cn("w-4.5 h-4.5 text-muted-foreground", regenerating && "animate-spin")} />
                  <span className="text-sm font-medium text-foreground flex-1">Refresh Programme</span>
                  {phaseLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pro Upsell Sheet — contextual replacement for removed banner */}
      <AnimatePresence>
        {showProSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowProSheet(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50"
            >
              <div className="max-w-md mx-auto p-5 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#7C6BF015" }}>
                    <Lock className="w-5 h-5" style={{ color: "#7C6BF0" }} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">Upgrade to Pro</p>
                    <p className="text-xs text-muted-foreground">Unlock advanced periodisation and AI adjustments</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowProSheet(false); navigate("/settings"); }}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold"
                  style={{ background: THEME.gradient.brand }}
                >
                  Learn More
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}