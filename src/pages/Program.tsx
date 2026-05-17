import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProgram } from "@/features/program/useProgram";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useWorkouts } from "@/hooks/useWorkouts";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import ProgrammeRunSection from "@/components/program/ProgrammeRunSection";
import ConfigurePlanModal from "@/components/program/ConfigurePlanModal";
import { cn } from "@/lib/utils";
import WorkoutSession from "@/components/WorkoutSession";
import ProgramSettingsPanel from "@/components/program/ProgramSettingsPanel";
import SavedRoutinesSection from "@/components/program/SavedRoutinesSection";
import DayStepper from "@/components/program/DayStepper";
import WeekPhaseRow from "@/components/program/WeekPhaseRow";
import RunningNavIcon from "@/components/program/RunningNavIcon";
import Coachmark from "@/components/ui/Coachmark";
import SkipConfirmSheet from "@/components/program/SkipConfirmSheet";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import { THEME } from "@/lib/theme";
import {
  Lock,
  Check,
  Dumbbell,
  RefreshCw,
  Settings2,
  Sparkles,
  CalendarDays,
  MoreHorizontal,
  Plus,
  FastForward,
  Play,
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
import { splitLabel, primaryGoalLabel } from "@/features/program/programEngine";
import { haptic } from "@/lib/haptic";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import { DndContext, closestCenter, TouchSensor, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import ExercisePicker from "@/components/program/ExercisePicker";
import { Spinner } from "@/components/ui/Spinner";

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

function formatVolume(kg: number): string {
  // 0kg isn't a meaningful "volume achievement" — it just means
  // every exercise in the session was bodyweight or uncalibrated, in
  // which case asserting "0kg" reads as a loss rather than as
  // "weight wasn't the metric here." Show an em-dash instead.
  if (kg <= 0) return "—";
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

function ProgramInner({ phaseLocked = false }: { phaseLocked?: boolean }) {
  const navigate = useNavigate();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    skipWorkoutDay,
    advanceToNextWeek,
    logExercise,
    updateSettings,
    regenerateProgram,
    saveProgram,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
    overrideRunDay,
    completeRunDay,
    skipRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
  } = useProgram();
  const { profile, updateProfile } = useAuth();
  const runsTarget = getWeeklyRunTarget(profile);
  const [configurePlanOpen, setConfigurePlanOpen] = useState(false);
  // PR-2: weekly layout editor sheet. Mounted conditionally — when
  // closed the body unmounts and the inner useProgrammeScheduleEditor
  // hook tears down, so the next open re-reads `profile` fresh.
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const openEditLayout = useCallback(() => {
    setEditLayoutOpen(true);
  }, []);
  // PR-0d: which step the wizard lands on. The overflow menu opens
  // at step 0 (full wizard); the run-mode chips + race-goal CTA in
  // ProgrammeRunSection open at the Running step.
  const [configurePlanInitialStep, setConfigurePlanInitialStep] = useState(0);
  const openConfigurePlan = useCallback((step: number = 0) => {
    setConfigurePlanInitialStep(step);
    setConfigurePlanOpen(true);
  }, []);
  // PR-3: 2-tab segmented control — Lift | Run. Today / Week shells
  // were retired once Home owned today-glance (via the shared
  // `resolveTrainingDayForDate` path — PR-0c) and DayActionSheet
  // owned per-day actions (PR-1). The Footprint nav icon owns
  // "start a run". Defaulting to Lift because the lift swiper is the
  // most-edited surface and is where the user most often returns.
  type ProgramTab = "lift" | "run";
  const [activeTab, setActiveTab] = useState<ProgramTab>("lift");

  const { workouts: recentWorkouts } = useWorkouts();

  // Per-exercise best working set from last session containing that exercise
  const lastPerformanceMap = useMemo(() => {
    const map = new Map<string, { weight: number; reps: number }>();
    if (!recentWorkouts.length) return map;

    // workouts are sorted by date desc — first occurrence of an exercise is the most recent
    for (const workout of recentWorkouts) {
      for (const wex of workout.exercises) {
        if (map.has(wex.exerciseId) || !wex.sets.length) continue;

        const maxWeight = Math.max(...wex.sets.map((s) => s.weightKg));

        if (maxWeight > 0) {
          // Filter out warm-up sets (< 50% of heaviest)
          const workingSets = wex.sets.filter((s) => s.weightKg >= maxWeight * 0.5);
          // Best set: heaviest weight, then highest reps
          const best = workingSets.reduce((a, b) =>
            b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a
          );
          map.set(wex.exerciseId, { weight: best.weightKg, reps: best.reps });
        } else {
          // Bodyweight: take highest reps
          const best = wex.sets.reduce((a, b) => (b.reps > a.reps ? b : a));
          map.set(wex.exerciseId, { weight: 0, reps: best.reps });
        }
      }
    }
    return map;
  }, [recentWorkouts]);

  // Core navigation state
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const isAnimating = useRef(false);

  // UI state
  const [regenerating, setRegenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProSheet, setShowProSheet] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const settingsPanelRef = useFocusTrap<HTMLDivElement>(showSettings);
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);

  // Skip confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipTargetDay, setSkipTargetDay] = useState<number | null>(null);

  // PR-2: Reset-programme confirmation (overflow item) — separate
  // from ScheduleLayoutSheet's restructure modal because that one
  // fires only when the user changes lift-day count; this one
  // rebuilds with the same params and is destructive in a different
  // way (clears weekHistory, resets weekNumber to 1). User should
  // know before tapping. Pre-PR-2 this was labelled "Refresh
  // Programme" — renamed to "Reset programme" so the destructive
  // intent matches the function it calls.
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  // Swipe navigation
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Exercise card state — read-only, tap opens info sheet
  const [reorderMode, setReorderMode] = useState(false);
  // PR-2: reorderMode is meaningless outside the Lift tab — the
  // DndContext that consumes it only renders when activeTab === "lift"
  // (and only when there are exercises). Without this effect the
  // boolean could survive a tab switch and silently re-activate
  // drag-and-drop when the user returns to Lift.
  useEffect(() => {
    if (activeTab !== "lift" && reorderMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from tab-change event
      setReorderMode(false);
    }
  }, [activeTab, reorderMode]);
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
    // Don't preserve old.movementCategory — let normalizeExercise infer
    // the new category from the new exercise's name. Replacing Lat
    // Pulldown (vertical_pull) with Dumbbell Curl shouldn't keep the
    // pull tag; downstream consumers (analytics, MuscleHeatMap, social
    // posts) need the actual movement pattern. Sets / reps / weight
    // carry over as the user's customisation — the user can re-tune
    // them post-replacement if the new exercise needs different
    // prescription.
    const replacement = normalizeExercise({
      name: newEx.name, exerciseId: newEx.id,
      sets: old.sets, reps: old.reps, weight: old.weight,
    });
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: d.exercises.map((ex, ei) => ei === exIndex ? replacement : ex) } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setReplaceTarget(null);
  };

  const addExercisesToDay = async (dayIdx: number, exercises: Exercise[]) => {
    if (!programState) return;
    // Don't hardcode movementCategory — normalizeExercise infers from
    // the exercise name via inferMovementCategory. Forcing
    // "horizontal_push" was tagging every added exercise (including
    // pulls, legs, isolations) as a horizontal press, contaminating
    // analytics, MuscleHeatMap input, and social-post muscle groups.
    const newExs = exercises.map(e => normalizeExercise({ name: e.name, exerciseId: e.id, sets: 3, reps: 10, weight: 0 }));
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


  // Today index: first incomplete workout (respects nextWorkoutOverride)
  const todayIndex = useMemo(() => {
    if (!programState || viewingHistoryIndex !== null) return -1;
    if (programState.nextWorkoutOverride != null) {
      const oi = programState.workouts.findIndex(
        (d, i) => i === programState.nextWorkoutOverride && !d.completed && !d.skipped,
      );
      if (oi >= 0) return oi;
    }
    return programState.workouts.findIndex(d => !d.completed && !d.skipped);
  }, [programState, viewingHistoryIndex]);

  // Auto-select on week change (not on individual completion)
  const prevWeekKeyRef = useRef("");
  useEffect(() => {
    if (!programState) return;
    const weekKey = viewingHistoryIndex !== null
      ? `h${viewingHistoryIndex}`
      : `w${programState.weekNumber}`;
    if (prevWeekKeyRef.current !== weekKey) {
      prevWeekKeyRef.current = weekKey;
      const target = todayIndex >= 0 ? todayIndex : 0;
      setSelectedDayIndex(target); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: reset selection on week navigation
    }
  }, [programState, viewingHistoryIndex, todayIndex]);

  // Scroll reset on day change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedDayIndex]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Spinner size="md" variant="primary" label="Loading programme" />
      </div>
    );
  }

  if (!programState || !prescription) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Failed to load programme</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  // ── Computed values ──
  const isViewingHistory = viewingHistoryIndex !== null;
  const displayWorkouts = isViewingHistory ? (viewedWorkouts ?? []) : programState.workouts;
  const displayWeekNumber = isViewingHistory ? (viewedWeekNumber ?? 1) : programState.weekNumber;
  const allComplete = displayWorkouts.length > 0 && displayWorkouts.every((d) => d.completed || d.skipped);
  const settings = programState.settings ?? { autoProgression: true, microloading: true };
  const history = programState.weekHistory ?? [];

  // Clamp selectedDayIndex
  const idx = displayWorkouts.length > 0 ? Math.min(selectedDayIndex, displayWorkouts.length - 1) : 0;
  if (idx !== selectedDayIndex) setSelectedDayIndex(idx);

  const selectedWorkout = displayWorkouts[idx];
  const isSelectedToday = !isViewingHistory && idx === todayIndex;

  // Day status
  type DayStatus = "today" | "completed" | "skipped" | "upcoming";
  const status: DayStatus = selectedWorkout?.completed
    ? "completed"
    : selectedWorkout?.skipped
      ? "skipped"
      : isSelectedToday
        ? "today"
        : "upcoming";

  // Stepper data — keep skipped distinct from completed. Collapsing
  // them was misleading: a green check on a skipped day suggested
  // "you trained" when the user explicitly skipped. DayStepper has a
  // dedicated grey-with-Ban-icon visual for skipped.
  const stepperDays = displayWorkouts.map((w, i) => ({
    dayNumber: i + 1,
    label: w.dayName,
    status: (w.completed
      ? "completed"
      : w.skipped
        ? "skipped"
        : !isViewingHistory && i === todayIndex
          ? "today"
          : "upcoming") as "completed" | "today" | "upcoming" | "skipped",
  }));

  // Session metadata
  const exerciseCount = selectedWorkout?.exercises.length ?? 0;
  const estimatedMinutes = Math.round((selectedWorkout?.exercises.reduce((s, ex) => s + ex.sets, 0) ?? 0) * 2.5);
  const totalVolume = selectedWorkout?.exercises.reduce((sum, ex) => sum + ex.sets * ex.reps * ex.weight, 0) ?? 0;

  function getDayMuscleGroups(exercises: { exerciseId: string }[]): string {
    const groups = exercises.map(ex => getExerciseById(ex.exerciseId)?.category).filter(Boolean);
    const unique = [...new Set(groups)] as string[];
    if (unique.length === 0) return "";
    if (unique.length <= 3) return unique.join(" · ");
    return unique.slice(0, 3).join(" · ") + " + more";
  }
  const muscleGroups = selectedWorkout ? getDayMuscleGroups(selectedWorkout.exercises) : "";

  // ── Handlers ──
  const handleSelect = (newIndex: number) => {
    if (isAnimating.current || newIndex === idx) return;
    isAnimating.current = true;
    setDirection(newIndex > idx ? 1 : -1);
    setSelectedDayIndex(newIndex);
  };

  const goalLabel = (g: string) => {
    if (g === "lean bulk") return "Lean Bulk";
    return g.charAt(0).toUpperCase() + g.slice(1);
  };

  // W1b legibility line: "Built for [lifting goal] · [split] · [N] days/week"
  //
  // Pre-W1a the Program-page subtitle hardcoded a binary split check
  // (`ppl` vs "Upper / Lower") — so full_body, bro_split, ppl_x2, and
  // fat-loss-circuit users all saw the wrong label. This helper replaces
  // it with a full legibility line built from persisted programState
  // fields (primaryGoal + splitType + actual workout count).
  //
  // Edge handling:
  //   - Run-only athletes (workouts.length === 0): skip the split and
  //     days clause — "Built for Running Support" alone is the truth.
  //   - Legacy docs without primaryGoal: `primaryGoalLabel(undefined)`
  //     falls back to "General Fitness" so the line still renders.
  //   - Day count uses workouts.length (actual) rather than
  //     profile.daysPerWeek (requested) — reflects what the engine
  //     produced after the W1a 7-day cap.
  const programHeaderLine = (() => {
    if (!programState) return "";
    const goalText = primaryGoalLabel(programState.primaryGoal);
    const dayCount = programState.workouts.length;
    if (dayCount === 0) return `Built for ${goalText}`;
    const daysLabel = dayCount === 1 ? "1 day/week" : `${dayCount} days/week`;
    return `Built for ${goalText} · ${splitLabel(programState.splitType)} · ${daysLabel}`;
  })();

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
    const vi = viewingHistoryIndex ?? 0;
    if (vi < history.length - 1) viewWeek(vi + 1);
    else viewWeek(null);
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    let el = e.target as HTMLElement;
    while (el && el !== e.currentTarget) {
      if (el.dataset.swipeCard) return;
      el = el.parentElement!;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && idx < displayWorkouts.length - 1) handleSelect(idx + 1);
      else if (dx > 0 && idx > 0) handleSelect(idx - 1);
    }
  };

  // ── Render ──
  return (
    <div>
      {/* ── Header Zone ── */}
      <div>
        <header>
        <div className="flex items-center justify-between pt-1 pb-1">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Programme</h1>
            <p className="text-xs text-muted-foreground">
              {programHeaderLine}
            </p>
          </div>
          {/* Right utility cluster — running entry leads, then reorder
              + overflow. Running icon is colour-distinct (coral) but
              smaller than its greyscale neighbours; the tint carries
              the affordance so size doesn't have to. First-use
              Coachmark explains the otherwise-unlabelled icon —
              storage key versioned so a later redesign can re-trigger
              by bumping the suffix. */}
          <div className="flex items-center gap-1">
            <Coachmark
              storageKey="program-running-nav-v1"
              content="Track a run from here"
              placement="bottom"
            >
              <RunningNavIcon />
            </Coachmark>
            {/* PR-2: reorder toggle only renders where it works —
                Lift tab AND the user actually has lift workouts in
                their programState. Pre-PR-2 the button lived
                outside the activeTab guard, so users on Today/Week/
                Run saw an inert icon that toggled hidden state. */}
            {activeTab === "lift" && (programState?.workouts?.length ?? 0) > 0 && (
              reorderMode ? (
                <button
                  onClick={() => setReorderMode(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={() => setReorderMode(true)}
                  aria-label="Reorder exercises"
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                </button>
              )
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

        {/* PR-3: 2-tab segmented control. Today / Week were retired —
            Home owns today-glance, DayActionSheet owns per-day
            actions, and the Footprint nav icon starts a run. */}
        <div className="pt-2">
          <div
            role="tablist"
            aria-label="Programme sections"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ background: "hsl(var(--muted) / 0.5)" }}
          >
            {([
              { id: "lift", label: "Lift" },
              { id: "run", label: "Run" },
            ] as { id: ProgramTab; label: string }[]).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "py-2 rounded-lg text-xs font-semibold transition-all",
                  activeTab === t.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── LIFT tab — existing WeekPhaseRow + DayStepper + Session
              content. Wrapped in a conditional so the lift surface
              only renders when the user explicitly switches to it. */}
        {activeTab === "lift" && (
          <>
            <div>
              <WeekPhaseRow
                weekNumber={displayWeekNumber}
                phaseName={goalLabel(programState.goal)}
                onPrevWeek={goBack}
                onNextWeek={goForward}
                canGoPrev={canGoBack}
                canGoNext={canGoForward}
              />
            </div>

            {/* Day Stepper */}
            <div>
              <DayStepper
                days={stepperDays}
                selectedIndex={idx}
                todayIndex={!isViewingHistory && todayIndex >= 0 ? todayIndex : null}
                onSelect={handleSelect}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Advance Week (all complete, current week) — lift tab only. */}
      {activeTab === "lift" && allComplete && !isViewingHistory && !phaseLocked && (
        <div className="pt-4 pb-2">
          <button
            onClick={handleAdvanceWeek}
            disabled={advancing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <FastForward className="w-4 h-4" />
            {advancing ? "Advancing..." : "Advance to Next Week"}
          </button>
        </div>
      )}

      {/* ── RUN tab — ProgrammeRunSection (PR-4). The section owns
            every state (freeform hero / structured next-run /
            race-prep progress / setup CTA / zero-runs CTA); no
            parallel Program.tsx fallback needed. */}
      {activeTab === "run" && profile && (
        <div className="pt-4">
          <ProgrammeRunSection
            profile={profile}
            programState={programState}
            runsTarget={runsTarget}
            overrideRunDay={overrideRunDay}
            completeRunDay={completeRunDay}
            skipRunDay={skipRunDay}
            skipWorkoutDay={skipWorkoutDay}
            refreshRunSchedule={refreshRunSchedule}
            skipRecoveryEarly={skipRecoveryEarly}
            onOpenConfigurePlan={openConfigurePlan}
          />
        </div>
      )}

      {/* ── Session Content — LIFT tab only ── */}
      {activeTab === "lift" && (
      <>
      <div className="pt-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence
          mode="wait"
          custom={direction}
          onExitComplete={() => { isAnimating.current = false; }}
        >
          <motion.div
            key={idx}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 50 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -50 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ willChange: "transform" }}
          >
            {selectedWorkout && (
              <div className="space-y-3">
                {/* ── Session Header ── */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor:
                        status === "completed" || status === "skipped"
                          ? "rgba(76,175,80,0.1)"
                          : status === "today"
                            ? "rgba(124,107,240,0.1)"
                            : "hsl(var(--muted))",
                    }}
                  >
                    {status === "completed" ? (
                      <Check className="w-[18px] h-[18px]" style={{ color: "#4CAF50" }} strokeWidth={2.5} />
                    ) : (
                      <Dumbbell className={`w-[18px] h-[18px] ${status === "today" ? "" : "text-muted-foreground"}`} style={status === "today" ? { color: "#7C6BF0" } : undefined} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold truncate text-foreground">
                        Day {idx + 1} · {selectedWorkout.dayName}
                      </p>
                      {status === "completed" && (
                        <span className="text-[11px] font-semibold shrink-0" style={{ color: "#4CAF50", backgroundColor: "rgba(76,175,80,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                          Done
                        </span>
                      )}
                      {status === "skipped" && (
                        <span className="text-[11px] font-semibold shrink-0 text-muted-foreground bg-muted" style={{ padding: "2px 8px", borderRadius: 6 }}>
                          Skipped
                        </span>
                      )}
                      {status === "today" && (
                        <span className="text-[11px] font-semibold shrink-0" style={{ color: "#7C6BF0", backgroundColor: "rgba(124,107,240,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground" style={{ marginTop: 2 }}>
                      {exerciseCount} exercises · ~{estimatedMinutes} min{muscleGroups ? ` · ${muscleGroups}` : ""}
                    </p>
                  </div>
                </div>

                {/* ── Exercise Cards ── */}
                {reorderMode ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd(idx, event)}>
                    <SortableContext items={selectedWorkout.exercises.map((_, i) => `ex-${idx}-${i}`)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {selectedWorkout.exercises.map((ex, i) => {
                          const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
                          const lastPerf = lastPerformanceMap.get(ex.exerciseId);
                          return (
                            <SortableExerciseRow key={`ex-${idx}-${i}`} id={`ex-${idx}-${i}`} justDropped={justDroppedId === `ex-${idx}-${i}`} showHandle={true}>
                              <div data-swipe-card="true" className="p-3 rounded-xl bg-card">
                                <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 0 ? ` · ${ex.weight}kg` : ""}
                                </p>
                                {lastPerf && (
                                  <p className="text-xs mt-0.5 text-muted-foreground">
                                    Last: {lastPerf.weight > 0
                                      ? `${lastPerf.weight} kg × ${lastPerf.reps}`
                                      : isBW
                                        ? `BW × ${lastPerf.reps}`
                                        : `— × ${lastPerf.reps}`}
                                  </p>
                                )}
                              </div>
                            </SortableExerciseRow>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="space-y-2">
                    {selectedWorkout.exercises.map((ex, i) => {
                      const isBW = getExerciseById(ex.exerciseId)?.equipment === "Bodyweight";
                      const lastPerf = lastPerformanceMap.get(ex.exerciseId);
                      return (
                        <div key={`ex-${idx}-${i}`} data-swipe-card="true">
                          <SortableExerciseRow id={`ex-${idx}-${i}`} showHandle={false} onDelete={() => removeExFromDay(idx, i)}>
                            <button
                              onClick={() => navigate(`/history/exercise/${encodeURIComponent(ex.name)}`, { state: { initialTab: "form" } })}
                              className="w-full p-3 rounded-xl bg-card text-left active:scale-[0.97] transition-transform"
                              onTouchStart={(e) => handleLongPressStart(idx, i, e)}
                              onTouchMove={handleLongPressCancel}
                              onTouchEnd={handleLongPressCancel}
                            >
                              <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ex.sets} sets × {ex.reps} reps{!isBW && ex.weight > 0 ? ` · ${ex.weight}kg` : ""}
                              </p>
                              {lastPerf && (
                                <p className="text-xs mt-0.5" style={{ color: "#999" }}>
                                  Last: {lastPerf.weight > 0 ? `${lastPerf.weight} kg × ${lastPerf.reps}` : `${lastPerf.reps} reps`}
                                </p>
                              )}
                            </button>
                          </SortableExerciseRow>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── + Add Exercise (not on completed/skipped) ── */}
                {status !== "completed" && status !== "skipped" && (
                  <button
                    onClick={() => { setAddPickerDayIndex(idx); setShowAddPicker(true); }}
                    className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2 bg-card rounded-xl text-primary font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Exercise
                  </button>
                )}

                {/* ── Completed Session Summary ── */}
                {status === "completed" && (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(76,175,80,0.05)", border: "1px solid rgba(76,175,80,0.15)" }}>
                    <div className="flex justify-around items-center">
                      <div className="text-center">
                        <p className="text-base font-bold text-foreground">~{estimatedMinutes} min</p>
                        <p className="text-[11px] font-medium text-muted-foreground">Duration</p>
                      </div>
                      <div className="bg-border/60" style={{ width: 1, height: 24 }} />
                      <div className="text-center">
                        <p className="text-base font-bold text-foreground">{formatVolume(totalVolume)}</p>
                        <p className="text-[11px] font-medium text-muted-foreground">Volume</p>
                      </div>
                      <div className="bg-border/60" style={{ width: 1, height: 24 }} />
                      <div className="text-center">
                        <p className="text-base font-bold text-foreground">{exerciseCount}</p>
                        <p className="text-[11px] font-medium text-muted-foreground">Exercises</p>
                      </div>
                    </div>
                  </div>
                )}


              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── CTA Zone ── */}
      <div className="mt-4">
        {status === "today" && !selectedWorkout?.completed ? (
          <>
            <button
              onClick={() => { haptic("light"); setSessionDayIndex(idx); }}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: THEME.gradient.brand }}
            >
              <Play className="w-4 h-4" /> Begin Workout
            </button>
            <div className="flex items-center justify-center mt-2">
              <button
                onClick={() => { setSkipTargetDay(idx); setShowSkipConfirm(true); }}
                className="text-[13px] font-medium text-muted-foreground"
              >
                Skip Session
              </button>
            </div>
          </>
        ) : status === "completed" ? (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-[14px]" style={{ backgroundColor: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.12)" }}>
            <Check className="w-4 h-4" style={{ color: "#4CAF50" }} strokeWidth={2.5} />
            <span className="text-sm font-semibold" style={{ color: "#4CAF50" }}>
              Completed · ~{estimatedMinutes} min · {formatVolume(totalVolume)}
            </span>
          </div>
        ) : status === "skipped" ? (
          <div className="flex items-center justify-center py-3.5 rounded-[14px] bg-muted">
            <span className="text-sm font-medium text-muted-foreground">Skipped</span>
          </div>
        ) : (
          <div className="flex items-center justify-center py-3.5 rounded-[14px] bg-muted">
            <span className="text-sm font-medium text-muted-foreground">Scheduled</span>
          </div>
        )}
      </div>
      </>
      )}

      {/* Saved routines (PR 4) — workouts the user copied from the
          social feed via "Save as routine". Hides itself entirely
          when the user has no saved entries, so users who don't use
          the feature never see the section. Lift tab only — the
          surfaces are workout-centric. */}
      {activeTab === "lift" && <SavedRoutinesSection />}

      {/* ── Context Menu ── */}
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
              <button onClick={() => { removeExFromDay(contextMenu.dayIndex, contextMenu.exIndex); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-muted transition-colors border-b border-border/30">
                <Trash2 className="w-4 h-4" /> Remove Exercise
              </button>
              <button onClick={() => { moveExercise(contextMenu.dayIndex, contextMenu.exIndex, -1); }} disabled={contextMenu.exIndex === 0} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30 disabled:opacity-30">
                <ArrowUp className="w-4 h-4 text-muted-foreground" /> Move Up
              </button>
              <button onClick={() => { moveExercise(contextMenu.dayIndex, contextMenu.exIndex, 1); }} disabled={contextMenu.exIndex >= (displayWorkouts[contextMenu.dayIndex]?.exercises.length ?? 1) - 1} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-30">
                <ArrowDown className="w-4 h-4 text-muted-foreground" /> Move Down
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Skip Confirmation Sheet */}
      <SkipConfirmSheet
        open={showSkipConfirm}
        sessionName={skipTargetDay !== null ? (displayWorkouts[skipTargetDay]?.dayName ?? "") : ""}
        onConfirm={async () => {
          if (skipTargetDay !== null) {
            await skipWorkoutDay(skipTargetDay);
            haptic("medium");
            // Auto-advance to next incomplete day
            const nextIncomplete = displayWorkouts.findIndex(
              (d, i) => i !== skipTargetDay && !d.completed && !d.skipped,
            );
            if (nextIncomplete >= 0) {
              handleSelect(nextIncomplete);
            }
          }
          setShowSkipConfirm(false);
          setSkipTargetDay(null);
        }}
        onCancel={() => { setShowSkipConfirm(false); setSkipTargetDay(null); }}
      />

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <ProgramSettingsPanel
            ref={settingsPanelRef}
            currentGoal={programState.goal}
            currentSplit={programState.splitType}
            settings={settings}
            onClose={() => setShowSettings(false)}
            onRegenerate={handleRegenerate}
            onUpdateSettings={updateSettings}
          />
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
        existingExerciseIds={programState.workouts[addPickerDayIndex ?? idx]?.exercises.map(ex => ex.exerciseId) ?? []}
        onSelect={(ex) => addExercisesToDay(addPickerDayIndex ?? idx, [ex])}
        onMultiSelect={(exs) => addExercisesToDay(addPickerDayIndex ?? idx, exs)}
        onClose={() => { setShowAddPicker(false); setAddPickerDayIndex(null); }}
        onRemoveExercise={(id) => removeExFromDayById(addPickerDayIndex ?? idx, id)}
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


      {/* PR-2: Edit weekly layout sheet. Returns null when closed —
          so the body component (and its useProgrammeScheduleEditor
          hook) only mounts while the sheet is open. That's the
          hydration guarantee: each open is a fresh hook mount that
          re-reads the current profile. */}
      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />

      {/* P0-9: Configure Plan wizard. Renders nothing when closed —
          the modal itself returns null on `!open`. */}
      {profile && (
        <ConfigurePlanModal
          open={configurePlanOpen}
          onClose={() => setConfigurePlanOpen(false)}
          profile={profile}
          programState={programState}
          initialStep={configurePlanInitialStep}
          onSaved={() => {
            // No explicit refresh — useProgram subscribes to the
            // programState doc and re-renders on next snapshot. The
            // toast inside the modal confirms the write landed.
          }}
        />
      )}

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
                {/* PR-2: Edit weekly layout — basic-tier capability.
                    Opens ScheduleLayoutSheet (the editor that pre-PR-2
                    lived in Settings → Training). Intentionally NOT
                    phase-locked: day-to-day layout is foundational,
                    not a premium feature. The other three items below
                    keep their Pro gate (plan-shape change, phase
                    settings, full reset). */}
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    openEditLayout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <CalendarDays className="w-4.5 h-4.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground flex-1">Edit weekly layout</span>
                </button>
                {/* P0-9: Configure programme wizard — runs planBuilder +
                    configurePlan CF on Confirm. Deliberate plan-shape
                    change (not a day toggle), so Pro-locked. */}
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    if (phaseLocked) { setShowProSheet(true); } else { openConfigurePlan(); }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <Sparkles className="w-4.5 h-4.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground flex-1">Configure programme</span>
                  {phaseLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    if (phaseLocked) { setShowProSheet(true); } else { setShowSettings(true); }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <Settings2 className="w-4.5 h-4.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground flex-1">Programme settings</span>
                  {phaseLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                {/* PR-2: "Reset programme" replaces "Refresh Programme".
                    `regenerateProgram` resets weekNumber to 1 and clears
                    weekHistory — that's a hard reset, not a refresh.
                    Calling it Refresh invited accidental taps; the new
                    label discloses the destructive nature. */}
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    if (phaseLocked) { setShowProSheet(true); } else { setShowRefreshConfirm(true); }
                  }}
                  disabled={regenerating}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <RefreshCw className={cn("w-4.5 h-4.5 text-muted-foreground", regenerating && "animate-spin")} />
                  <span className="text-sm font-medium text-foreground flex-1">Reset programme</span>
                  {phaseLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* PR-2: Reset programme confirmation — destructive.
          `regenerateProgram` rebuilds the workouts array, resets
          weekNumber to 1, and clears weekHistory (the user's
          "Browse Past Weeks" data). Logged workouts in History are
          NOT affected. The copy and confirm-button label spell this
          out so users can't tap "Refresh" expecting a benign sync
          and lose their week summaries. */}
      <AnimatePresence>
        {showRefreshConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRefreshConfirm(false)}
              className="fixed inset-0 bg-black/60 z-[60]"
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-card rounded-2xl p-4 space-y-3 max-w-sm mx-auto shadow-xl"
            >
              <h3 className="text-sm font-semibold text-foreground">Reset your programme?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This rebuilds your lift split for the current nutrition phase and training days,
                restarts you at Week&nbsp;1, and clears the week-by-week summary history. Logged
                workouts and runs in History are not affected.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowRefreshConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowRefreshConfirm(false);
                    await handleRegenerate();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Reset programme
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pro Upsell Sheet */}
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
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${THEME.lifting}15` }}>
                    <Lock className="w-5 h-5" style={{ color: THEME.lifting }} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">Upgrade to Pro</p>
                    <p className="text-xs text-muted-foreground">Unlock advanced periodisation and AI adjustments</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowProSheet(false); navigate("/upgrade"); }}
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