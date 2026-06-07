import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProgram } from "@/features/program/useProgram";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useWorkouts } from "@/hooks/useWorkouts";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import ProgrammeRunSection from "@/components/program/ProgrammeRunSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import WorkoutSession from "@/components/WorkoutSession";
import SavedRoutinesSection from "@/components/program/SavedRoutinesSection";
import ProgrammeWeekSelector from "@/components/program/ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "@/components/program/ProgrammeWeekSelector";
import WeekPhaseRow from "@/components/program/WeekPhaseRow";
import SkipConfirmSheet from "@/components/program/SkipConfirmSheet";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import { THEME } from "@/lib/theme";
import {
  Check,
  Dumbbell,
  Settings2,
  CalendarDays,
  Footprints,
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

import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/SortableExerciseRow";
import ExercisePicker from "@/components/program/ExercisePicker";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";
import TrackProgrammeSectionView from "@/components/program/TrackProgrammeSectionView";
import DeloadBanner from "@/components/program/DeloadBanner";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { raceDistanceLabel } from "@/lib/runProgrammeViewModel";

/**
 * IMPORTANT:
 * React error #310 is very commonly caused by hook order mismatches when gated UI
 * flips between renders (e.g. subscription/features loading).
 *
 * Fix: split into a gate component (subscription only) + inner component (program hook).
 */

export default function Program() {
  const { isPro } = useSubscription();
  return <ProgramInner phaseLocked={!isPro} />;
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
    regenerateProgram,
    saveProgram,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
    overrideRunDay,
    markManualComplete,
    skipRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
    realignRacePlan,
    dismissFellBehindPrompt,
  } = useProgram();
  const { profile, updateProfile } = useAuth();
  // Pgm3: deload banner data source. usePerformanceWeeks reads the
  // server-side performance rollup; the `deloadRecommended` flag on
  // the current week is the spec's banner trigger. Lazy — at most 2
  // weeks fetched (current + previous) since the banner only consults
  // the current.
  const { currentWeek: perfWeek } = usePerformanceWeeks(2);
  const runsTarget = getWeeklyRunTarget(profile);
  // PR-2: weekly layout editor sheet. Mounted conditionally — when
  // closed the body unmounts and the inner useProgrammeScheduleEditor
  // hook tears down, so the next open re-reads `profile` fresh.
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const openEditLayout = useCallback(() => {
    setEditLayoutOpen(true);
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
          const workingSets = wex.sets.filter(
            (s) => s.weightKg >= maxWeight * 0.5
          );
          // Best set: heaviest weight, then highest reps
          const best = workingSets.reduce((a, b) =>
            b.weightKg > a.weightKg ||
            (b.weightKg === a.weightKg && b.reps > a.reps)
              ? b
              : a
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
  const [showOverflow, setShowOverflow] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);

  // Skip confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipTargetDay, setSkipTargetDay] = useState<number | null>(null);

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
  const [addPickerDayIndex, setAddPickerDayIndex] = useState<number | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<{
    dayIndex: number;
    exIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{
    dayIndex: number;
    exIndex: number;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Exercise management helpers — accept dayIdx to work on any day (auto-save to Firestore)
  const removeExFromDay = async (dayIdx: number, exIndex: number) => {
    if (!programState) return;
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx
        ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== exIndex) }
        : d
    );
    await saveProgram({ ...programState, workouts: updated });
  };

  const removeExFromDayById = async (dayIdx: number, exerciseId: string) => {
    if (!programState) return;
    const exercises = programState.workouts[dayIdx]?.exercises;
    if (!exercises) return;
    const lastIdx = exercises
      .map((ex) => ex.exerciseId)
      .lastIndexOf(exerciseId);
    if (lastIdx === -1) return;
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx
        ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== lastIdx) }
        : d
    );
    await saveProgram({ ...programState, workouts: updated });
  };

  const moveExercise = async (
    dayIdx: number,
    exIndex: number,
    direction: -1 | 1
  ) => {
    if (!programState) return;
    const exercises = [...programState.workouts[dayIdx].exercises];
    const newIdx = exIndex + direction;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    [exercises[exIndex], exercises[newIdx]] = [
      exercises[newIdx],
      exercises[exIndex],
    ];
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setContextMenu(null);
  };

  const replaceExercise = async (
    dayIdx: number,
    exIndex: number,
    newEx: Exercise
  ) => {
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
      name: newEx.name,
      exerciseId: newEx.id,
      sets: old.sets,
      reps: old.reps,
      weight: old.weight,
    });
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx
        ? {
            ...d,
            exercises: d.exercises.map((ex, ei) =>
              ei === exIndex ? replacement : ex
            ),
          }
        : d
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
    const newExs = exercises.map((e) =>
      normalizeExercise({
        name: e.name,
        exerciseId: e.id,
        sets: 3,
        reps: 10,
        weight: 0,
      })
    );
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx ? { ...d, exercises: [...d.exercises, ...newExs] } : d
    );
    await saveProgram({ ...programState, workouts: updated });
    setShowAddPicker(false);
  };

  const handleLongPressStart = (
    dayIdx: number,
    exIndex: number,
    e: React.TouchEvent
  ) => {
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
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Save feedback states
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

  // Sensors: MouseSensor + TouchSensor (never PointerSensor + TouchSensor —
  // dnd-kit warns those conflict on touch, where pointer + touch events both
  // fire). The drag is handle-based (SortableExerciseRow spreads listeners onto
  // an explicit grip with `touch-action: none`), so the handle itself
  // disambiguates drag-from-scroll — no press-and-hold delay is needed.
  //
  // Two bugs this replaces: (1) the handle's `onPointerDown={haptic}` was spread
  // AFTER {...listeners}, clobbering PointerSensor's `onPointerDown` activator,
  // so PointerSensor never fired (mouse drag dead on desktop). MouseSensor's
  // activator is `onMouseDown`, which the haptic handler no longer shadows.
  // (2) TouchSensor's `{ delay: 150, tolerance: 5 }` aborts activation if the
  // finger moves >5px during the 150ms hold — a natural reorder gesture (grab
  // the grip and slide) exceeds 5px before 150ms, so the row never lifted.
  // Distance-based activation lifts the row once the finger moves, no abort.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // #1038: stable dnd-kit id + React key for an exercise row. Prefers the
  // persisted per-instance id (so drag/swipe-delete reconcile by exercise,
  // not by position); falls back to the legacy positional id when a freshly
  // built exercise hasn't been normalized yet.
  const rowId = (ex: { instanceId?: string }, dayIdx: number, i: number) =>
    ex.instanceId ?? `ex-${dayIdx}-${i}`;

  const handleDragEnd = async (dayIndex: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !programState) return;

    const exercises = programState.workouts[dayIndex].exercises;
    const oldIdx = exercises.findIndex(
      (ex, i) => rowId(ex, dayIndex, i) === active.id
    );
    const newIdx = exercises.findIndex(
      (ex, i) => rowId(ex, dayIndex, i) === over.id
    );
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(exercises, oldIdx, newIdx);
    const updatedWorkouts = programState.workouts.map((d, i) =>
      i === dayIndex ? { ...d, exercises: reordered } : d
    );

    // Green flash — track the dropped exercise by its stable id so the flash
    // lands on the right row after the re-render reorders the list.
    setJustDroppedId(rowId(reordered[newIdx], dayIndex, newIdx));
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
        (d, i) =>
          i === programState.nextWorkoutOverride && !d.completed && !d.skipped
      );
      if (oi >= 0) return oi;
    }
    return programState.workouts.findIndex((d) => !d.completed && !d.skipped);
  }, [programState, viewingHistoryIndex]);

  // Auto-select on week change (not on individual completion)
  const prevWeekKeyRef = useRef("");
  useEffect(() => {
    if (!programState) return;
    const weekKey =
      viewingHistoryIndex !== null
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
    // Mirror the in-Layout Suspense fallback (PageContentSkeleton →
    // ProgramSkeleton) so the route-chunk placeholder and this
    // data-loading gate are the SAME shape — no flash from skeleton to
    // a bare spinner while useProgram() resolves. Replaces a lone
    // centred Spinner that floated high (its wrapper had no height) and
    // gave the page no structure during the cold-start window.
    return <ProgramSkeleton />;
  }

  if (!programState || !prescription) {
    return (
      <ErrorState
        title="Couldn't load your programme"
        description="Something went wrong fetching your training plan. Check your connection and try again."
        retry={{ label: "Retry", onClick: () => window.location.reload() }}
      />
    );
  }

  // ── Computed values ──
  const isViewingHistory = viewingHistoryIndex !== null;
  const displayWorkouts = isViewingHistory
    ? (viewedWorkouts ?? [])
    : programState.workouts;
  const displayWeekNumber = isViewingHistory
    ? (viewedWeekNumber ?? 1)
    : programState.weekNumber;
  const allComplete =
    displayWorkouts.length > 0 &&
    displayWorkouts.every((d) => d.completed || d.skipped);
  const history = programState.weekHistory ?? [];

  // Clamp selectedDayIndex
  const idx =
    displayWorkouts.length > 0
      ? Math.min(selectedDayIndex, displayWorkouts.length - 1)
      : 0;
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

  // Lift selector cells — SPLIT-ORDERED (ADR-0002): the circle shows the
  // session number (Day 1..N), not a calendar date, and the rotation cursor
  // (todayIndex = next-incomplete) is the lift execution surface. Skipped
  // stays distinct from completed (a green check on a skipped day would read
  // as "you trained"); ProgrammeWeekSelector renders the Ban glyph for it.
  const liftSelectorCells: ProgrammeWeekSelectorCell[] = displayWorkouts.map(
    (w, i) => ({
      key: String(i),
      center: String(i + 1),
      // Show only the split CATEGORY ("Push" / "Pull" / "Legs" / "Upper" /
      // "Full Body") on the chip, not the full "Push — Chest Focus". The chip
      // is `line-clamp-1`, so the full name truncated to a dangling "Push —…"
      // — and it's redundant: the full name already shows in the day header
      // below ("Day N · Push — Chest Focus"). The category alone reads clean
      // and makes the rotation legible across the week.
      bottomLabel: w.dayName.split(/\s*[—–-]\s*/)[0].trim() || w.dayName,
      status: w.completed ? "completed" : w.skipped ? "skipped" : "upcoming",
      isToday: !isViewingHistory && i === todayIndex,
    })
  );

  // Session metadata
  const exerciseCount = selectedWorkout?.exercises.length ?? 0;
  const estimatedMinutes = Math.round(
    (selectedWorkout?.exercises.reduce((s, ex) => s + ex.sets, 0) ?? 0) * 2.5
  );
  const totalVolume =
    selectedWorkout?.exercises.reduce(
      (sum, ex) => sum + ex.sets * ex.reps * ex.weight,
      0
    ) ?? 0;

  function getDayMuscleGroups(exercises: { exerciseId: string }[]): string {
    const groups = exercises
      .map((ex) => getExerciseById(ex.exerciseId)?.category)
      .filter(Boolean);
    const unique = [...new Set(groups)] as string[];
    if (unique.length === 0) return "";
    if (unique.length <= 3) return unique.join(" · ");
    return unique.slice(0, 3).join(" · ") + " + more";
  }
  const muscleGroups = selectedWorkout
    ? getDayMuscleGroups(selectedWorkout.exercises)
    : "";

  // ── Handlers ──
  const handleSelect = (newIndex: number) => {
    if (isAnimating.current || newIndex === idx) return;
    isAnimating.current = true;
    setDirection(newIndex > idx ? 1 : -1);
    setSelectedDayIndex(newIndex);
    trackProgrammeEvent("programme_day_tapped", { dayIndex: newIndex });
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

  // Run-tab header line — so the subtitle stops being lift-led when the
  // user is on the Run tab. Race prep leads with distance + week-of-M;
  // structured shows weekly run frequency; freeform is the calm default.
  // (Run9 locked model: only freeform + race-goal overlay exist.)
  const programRunHeaderLine = (() => {
    const runMode = profile?.runMode ?? "freeform";
    const raceGoal = programState?.runPlan?.raceGoal;
    if (runMode === "race_prep") {
      if (!raceGoal) return "Race prep · Set your race goal";
      const dist = raceDistanceLabel(raceGoal.distance);
      const cw = programState?.runPlan?.currentWeek;
      const tw = programState?.runPlan?.totalWeeks;
      if (cw != null && tw) {
        return `Race prep · ${dist} · Week ${cw + 1}/${tw}`;
      }
      return `Race prep · ${dist}`;
    }
    if (runMode === "structured") {
      const t = runsTarget;
      return `Structured · ${t} ${t === 1 ? "run" : "runs"}/week`;
    }
    return "Free running · Start whenever";
  })();

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
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
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
              <h1 className="text-xl font-extrabold text-foreground">
                Programme
              </h1>
              {/* Subtitle is tab-aware so the Run tab no longer reads as a
                  secondary add-on under a lifting-only header.

                  Reserve a stable 2-line height so the segmented control — and
                  everything below it — sits at the SAME Y on both tabs. The
                  lift subtitle ("Built for … · split · N days/week") often
                  wraps to two lines while the run subtitle ("Free running · …")
                  is one; without the reserve the whole page shifted up ~12px
                  when toggling Lift↔Run. line-clamp-2 caps longer lines so it
                  can't grow to three and re-introduce the jump. */}
              <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                {activeTab === "run" ? programRunHeaderLine : programHeaderLine}
              </p>
            </div>
            {/* Right utility cluster — reorder (Lift only) + overflow. The
              unlabelled Footprints "start a run" icon was removed: ambiguous
              beside the utility controls, and the Run tab now owns clearly
              labelled Start-run CTAs. */}
            <div className="flex items-center gap-1">
              {/* PR-2: reorder toggle only renders where it works —
                Lift tab AND the user actually has lift workouts in
                their programState. Pre-PR-2 the button lived
                outside the activeTab guard, so users on Today/Week/
                Run saw an inert icon that toggled hidden state. */}
              {activeTab === "lift" &&
                (programState?.workouts?.length ?? 0) > 0 &&
                (reorderMode ? (
                  <button
                    type="button"
                    onClick={() => setReorderMode(false)}
                    className="px-3 py-1.5 min-h-[44px] inline-flex items-center rounded-lg text-xs font-semibold text-primary"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReorderMode(true)}
                    aria-label="Reorder exercises"
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    style={{ minWidth: 44, minHeight: 44 }}
                  >
                    <ArrowUpDown className="size-4 text-muted-foreground" />
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setShowOverflow(true)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                style={{ minWidth: 44, minHeight: 44 }}
                aria-label="More options"
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </header>

        {/* PR-3: 2-tab segmented control. Today / Week were retired —
            Home owns today-glance, DayActionSheet owns per-day
            actions, and the Footprint nav icon starts a run.

            Sport-coding matters here: Programme is the point where the
            athlete chooses between two training modes, so the switch should
            not read as two anonymous grey tabs. The shared SegmentedControl
            keeps the iOS pill interaction, 44px targets, roving-keyboard
            support, and reduced-motion behaviour in one primitive while the
            active tone reinforces the design-system rule: purple = lift,
            coral = run. */}
        <div className="pt-2">
          <SegmentedControl
            ariaLabel="Programme mode"
            value={activeTab}
            onChange={(value) => setActiveTab(value)}
            tone={activeTab === "run" ? "running" : "brand"}
            className="rounded-2xl bg-muted/50 p-1.5"
            options={
              [
                {
                  value: "lift",
                  label: (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Dumbbell className="size-4" aria-hidden="true" />
                      <span>Lift</span>
                    </span>
                  ),
                },
                {
                  value: "run",
                  label: (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Footprints className="size-4" aria-hidden="true" />
                      <span>Run</span>
                    </span>
                  ),
                },
              ] satisfies {
                value: ProgramTab;
                label: ReactNode;
              }[]
            }
          />
        </div>

        {/* ── LIFT tab — WeekPhaseRow + ProgrammeWeekSelector (split-ordered
              rotation cursor) + Session content. Wrapped in a conditional so
              the lift surface only renders when the user switches to it. */}
        {activeTab === "lift" && (
          <>
            {/* Pgm3: deload banner. Sits ABOVE the week-phase row so
                it's visible regardless of which day the user is
                inspecting — deload is a week-level signal. Per-week
                dismissal lives in localStorage; the banner stays
                shown across day navigation within the same week, and
                reopens on a new week if the signal still applies. */}
            <TrackProgrammeSectionView section="deload_banner">
              <DeloadBanner
                visible={!!perfWeek?.flags?.deloadRecommended}
                weekKey={`w${displayWeekNumber}`}
              />
            </TrackProgrammeSectionView>

            <TrackProgrammeSectionView section="week_phase_row">
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
            </TrackProgrammeSectionView>

            {/* Single Lift day-selector (ADR-0002 split-ordered rotation).
                The duplicate "this week" HybridWeekRail that used to sit
                above this was removed — one selector per tab, in the same
                vertical position as the Run tab's selector, and it drives
                the session content below. */}
            <TrackProgrammeSectionView section="day_stepper">
              <div>
                <ProgrammeWeekSelector
                  sport="lift"
                  ariaLabel="Lift sessions"
                  cells={liftSelectorCells}
                  selectedKey={String(idx)}
                  onSelect={(key) => handleSelect(Number(key))}
                />
              </div>
            </TrackProgrammeSectionView>
          </>
        )}
      </div>

      {/* ── Advance Week (all complete, current week) — lift tab only. */}
      {activeTab === "lift" &&
        allComplete &&
        !isViewingHistory &&
        !phaseLocked && (
          <div className="pt-4 pb-2">
            <button
              type="button"
              onClick={handleAdvanceWeek}
              disabled={advancing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <FastForward className="size-4" />
              {advancing ? "Advancing..." : "Advance to Next Week"}
            </button>
          </div>
        )}

      {/* ── RUN tab — ProgrammeRunSection (PR-4). The section owns
            every state (freeform hero / structured next-run /
            race-prep progress / setup CTA / zero-runs CTA); no
            parallel Program.tsx fallback needed. */}
      {activeTab === "run" && profile && (
        // pt-4 positions the Run day-selector so its day circles line up with
        // the Lift tab's day circles (verified on the harness: run button-top
        // 190 vs lift 192). The Run selector carries a weekday-letter row the
        // Lift selector lacks, so a little more top padding here lands the
        // circles — not the container — at the same Y, which is what the eye
        // tracks when toggling tabs.
        <div className="pt-4">
          <ProgrammeRunSection
            profile={profile}
            programState={programState}
            runsTarget={runsTarget}
            overrideRunDay={overrideRunDay}
            markManualComplete={markManualComplete}
            skipRunDay={skipRunDay}
            skipWorkoutDay={skipWorkoutDay}
            skipRecoveryEarly={skipRecoveryEarly}
            realignRacePlan={realignRacePlan}
            dismissFellBehindPrompt={dismissFellBehindPrompt}
          />
        </div>
      )}

      {/* ── Session Content — LIFT tab only ── */}
      {activeTab === "lift" && (
        <>
          <TrackProgrammeSectionView section="session_card">
            <div
              className="pt-4"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <AnimatePresence
                mode="wait"
                custom={direction}
                onExitComplete={() => {
                  isAnimating.current = false;
                }}
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
                          className="size-9 rounded-[10px] flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor:
                              status === "completed" || status === "skipped"
                                ? "rgba(77,184,114,0.1)"
                                : status === "today"
                                  ? "rgba(123,114,233,0.1)"
                                  : "hsl(var(--muted))",
                          }}
                        >
                          {status === "completed" ? (
                            <Check
                              className="size-[18px]"
                              style={{ color: "#4DB872" }}
                              strokeWidth={2.5}
                            />
                          ) : (
                            <Dumbbell
                              className={`size-[18px] ${status === "today" ? "" : "text-muted-foreground"}`}
                              style={
                                status === "today"
                                  ? { color: "#7B72E9" }
                                  : undefined
                              }
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-bold truncate text-foreground">
                              Day {idx + 1} · {selectedWorkout.dayName}
                            </p>
                            {status === "completed" && (
                              <span
                                className="text-[11px] font-semibold shrink-0"
                                style={{
                                  color: "#4DB872",
                                  backgroundColor: "rgba(77,184,114,0.1)",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                }}
                              >
                                Done
                              </span>
                            )}
                            {status === "skipped" && (
                              <span
                                className="text-[11px] font-semibold shrink-0 text-muted-foreground bg-muted"
                                style={{ padding: "2px 8px", borderRadius: 6 }}
                              >
                                Skipped
                              </span>
                            )}
                            {status === "today" && (
                              <span
                                className="text-[11px] font-semibold shrink-0"
                                style={{
                                  color: "#7B72E9",
                                  backgroundColor: "rgba(123,114,233,0.1)",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                }}
                              >
                                Today
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[13px] text-muted-foreground"
                            style={{ marginTop: 2 }}
                          >
                            {exerciseCount} exercises · ~{estimatedMinutes} min
                            {muscleGroups ? ` · ${muscleGroups}` : ""}
                          </p>
                        </div>
                      </div>

                      {/* ── Exercise Cards ── */}
                      {reorderMode ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleDragEnd(idx, event)}
                        >
                          <SortableContext
                            items={selectedWorkout.exercises.map((ex, i) =>
                              rowId(ex, idx, i)
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {selectedWorkout.exercises.map((ex, i) => {
                                const isBW =
                                  getExerciseById(ex.exerciseId)?.equipment ===
                                  "Bodyweight";
                                const lastPerf = lastPerformanceMap.get(
                                  ex.exerciseId
                                );
                                return (
                                  <SortableExerciseRow
                                    key={rowId(ex, idx, i)}
                                    id={rowId(ex, idx, i)}
                                    justDropped={
                                      justDroppedId === rowId(ex, idx, i)
                                    }
                                    showHandle={true}
                                  >
                                    <div
                                      data-swipe-card="true"
                                      className="p-3 rounded-xl bg-card"
                                    >
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        {ex.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-mono tabular-nums">
                                          {ex.sets}
                                        </span>{" "}
                                        sets ×{" "}
                                        <span className="font-mono tabular-nums">
                                          {ex.reps}
                                        </span>{" "}
                                        reps
                                        {!isBW && ex.weight > 0 ? (
                                          <>
                                            {" · "}
                                            <span className="font-mono tabular-nums">
                                              {ex.weight}
                                            </span>
                                            kg
                                          </>
                                        ) : null}
                                      </p>
                                      {lastPerf && (
                                        <p className="text-xs mt-0.5 text-muted-foreground">
                                          Last:{" "}
                                          {lastPerf.weight > 0 ? (
                                            <>
                                              <span className="font-mono tabular-nums">
                                                {lastPerf.weight}
                                              </span>{" "}
                                              kg ×{" "}
                                              <span className="font-mono tabular-nums">
                                                {lastPerf.reps}
                                              </span>
                                            </>
                                          ) : isBW ? (
                                            <>
                                              BW ×{" "}
                                              <span className="font-mono tabular-nums">
                                                {lastPerf.reps}
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              — ×{" "}
                                              <span className="font-mono tabular-nums">
                                                {lastPerf.reps}
                                              </span>
                                            </>
                                          )}
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
                            const isBW =
                              getExerciseById(ex.exerciseId)?.equipment ===
                              "Bodyweight";
                            const lastPerf = lastPerformanceMap.get(
                              ex.exerciseId
                            );
                            return (
                              <div
                                key={rowId(ex, idx, i)}
                                data-swipe-card="true"
                              >
                                <SortableExerciseRow
                                  id={rowId(ex, idx, i)}
                                  showHandle={false}
                                  onDelete={() => removeExFromDay(idx, i)}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/history/exercise/${encodeURIComponent(ex.name)}`,
                                        { state: { initialTab: "form" } }
                                      )
                                    }
                                    className="w-full p-3 rounded-xl bg-card text-left active:scale-[0.97] transition-transform"
                                    onTouchStart={(e) =>
                                      handleLongPressStart(idx, i, e)
                                    }
                                    onTouchMove={handleLongPressCancel}
                                    onTouchEnd={handleLongPressCancel}
                                  >
                                    <p className="text-sm font-semibold text-foreground truncate">
                                      {ex.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-mono tabular-nums">
                                        {ex.sets}
                                      </span>{" "}
                                      sets ×{" "}
                                      <span className="font-mono tabular-nums">
                                        {ex.reps}
                                      </span>{" "}
                                      reps
                                      {!isBW && ex.weight > 0 ? (
                                        <>
                                          {" · "}
                                          <span className="font-mono tabular-nums">
                                            {ex.weight}
                                          </span>
                                          kg
                                        </>
                                      ) : null}
                                    </p>
                                    {lastPerf && (
                                      <p className="text-xs mt-0.5 text-muted-foreground/80">
                                        Last:{" "}
                                        {lastPerf.weight > 0 ? (
                                          <>
                                            <span className="font-mono tabular-nums">
                                              {lastPerf.weight}
                                            </span>{" "}
                                            kg ×{" "}
                                            <span className="font-mono tabular-nums">
                                              {lastPerf.reps}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <span className="font-mono tabular-nums">
                                              {lastPerf.reps}
                                            </span>{" "}
                                            reps
                                          </>
                                        )}
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
                          type="button"
                          onClick={() => {
                            setAddPickerDayIndex(idx);
                            setShowAddPicker(true);
                          }}
                          className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2 bg-card rounded-xl text-primary font-medium text-sm"
                        >
                          <Plus className="size-4" /> Add Exercise
                        </button>
                      )}

                      {/* ── Completed Session Summary ── */}
                      {status === "completed" && (
                        <div
                          className="rounded-xl p-3"
                          style={{
                            backgroundColor: "rgba(77,184,114,0.05)",
                            border: "1px solid rgba(77,184,114,0.15)",
                          }}
                        >
                          <div className="flex justify-around items-center">
                            <div className="text-center">
                              <p className="text-base font-bold font-mono tabular-nums text-foreground">
                                ~{estimatedMinutes} min
                              </p>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Duration
                              </p>
                            </div>
                            <div
                              className="bg-border/60"
                              style={{ width: 1, height: 24 }}
                            />
                            <div className="text-center">
                              <p className="text-base font-bold font-mono tabular-nums text-foreground">
                                {formatVolume(totalVolume)}
                              </p>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Volume
                              </p>
                            </div>
                            <div
                              className="bg-border/60"
                              style={{ width: 1, height: 24 }}
                            />
                            <div className="text-center">
                              <p className="text-base font-bold font-mono tabular-nums text-foreground">
                                {exerciseCount}
                              </p>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Exercises
                              </p>
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
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setSessionDayIndex(idx);
                    }}
                    className="w-full py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.97] flex items-center justify-center gap-2"
                    style={{ background: THEME.gradient.brand }}
                  >
                    <Play className="size-4" /> Begin Workout
                  </button>
                  <div className="flex items-center justify-center mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSkipTargetDay(idx);
                        setShowSkipConfirm(true);
                      }}
                      className="min-h-[44px] px-4 inline-flex items-center justify-center text-sm font-medium text-muted-foreground active:scale-[0.97] transition-transform"
                    >
                      Skip Session
                    </button>
                  </div>
                </>
              ) : status === "completed" ? (
                <div
                  className="flex items-center justify-center gap-2 py-3.5 rounded-[14px]"
                  style={{
                    backgroundColor: "rgba(77,184,114,0.06)",
                    border: "1px solid rgba(77,184,114,0.12)",
                  }}
                >
                  <Check
                    className="size-4"
                    style={{ color: "#4DB872" }}
                    strokeWidth={2.5}
                  />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "#4DB872" }}
                  >
                    Completed · ~{estimatedMinutes} min ·{" "}
                    {formatVolume(totalVolume)}
                  </span>
                </div>
              ) : status === "skipped" ? (
                <div className="flex items-center justify-center py-3.5 rounded-[14px] bg-muted">
                  <span className="text-sm font-medium text-muted-foreground">
                    Skipped
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center py-3.5 rounded-[14px] bg-muted">
                  <span className="text-sm font-medium text-muted-foreground">
                    Scheduled
                  </span>
                </div>
              )}
            </div>
          </TrackProgrammeSectionView>
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200]"
              onClick={() => setContextMenu(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[201] bg-card rounded-xl shadow-lg border border-border/50 overflow-hidden"
              style={{
                top: Math.min(contextMenu.y, window.innerHeight - 220),
                left: Math.min(contextMenu.x - 80, window.innerWidth - 200),
                width: 200,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setReplaceTarget({
                    dayIndex: contextMenu.dayIndex,
                    exIndex: contextMenu.exIndex,
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30"
              >
                <Repeat className="size-4 text-muted-foreground" /> Replace
                Exercise
              </button>
              <button
                type="button"
                onClick={() => {
                  removeExFromDay(contextMenu.dayIndex, contextMenu.exIndex);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-muted transition-colors border-b border-border/30"
              >
                <Trash2 className="size-4" /> Remove Exercise
              </button>
              <button
                type="button"
                onClick={() => {
                  moveExercise(contextMenu.dayIndex, contextMenu.exIndex, -1);
                }}
                disabled={contextMenu.exIndex === 0}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30 disabled:opacity-30"
              >
                <ArrowUp className="size-4 text-muted-foreground" /> Move Up
              </button>
              <button
                type="button"
                onClick={() => {
                  moveExercise(contextMenu.dayIndex, contextMenu.exIndex, 1);
                }}
                disabled={
                  contextMenu.exIndex >=
                  (displayWorkouts[contextMenu.dayIndex]?.exercises.length ??
                    1) -
                    1
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ArrowDown className="size-4 text-muted-foreground" /> Move Down
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Skip Confirmation Sheet */}
      <SkipConfirmSheet
        open={showSkipConfirm}
        sessionName={
          skipTargetDay !== null
            ? (displayWorkouts[skipTargetDay]?.dayName ?? "")
            : ""
        }
        onConfirm={async () => {
          if (skipTargetDay !== null) {
            await skipWorkoutDay(skipTargetDay);
            haptic("medium");
            // Auto-advance to next incomplete day
            const nextIncomplete = displayWorkouts.findIndex(
              (d, i) => i !== skipTargetDay && !d.completed && !d.skipped
            );
            if (nextIncomplete >= 0) {
              handleSelect(nextIncomplete);
            }
          }
          setShowSkipConfirm(false);
          setSkipTargetDay(null);
        }}
        onCancel={() => {
          setShowSkipConfirm(false);
          setSkipTargetDay(null);
        }}
      />

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
        existingExerciseIds={
          programState.workouts[addPickerDayIndex ?? idx]?.exercises.map(
            (ex) => ex.exerciseId
          ) ?? []
        }
        onSelect={(ex) => addExercisesToDay(addPickerDayIndex ?? idx, [ex])}
        onMultiSelect={(exs) =>
          addExercisesToDay(addPickerDayIndex ?? idx, exs)
        }
        onClose={() => {
          setShowAddPicker(false);
          setAddPickerDayIndex(null);
        }}
        onRemoveExercise={(id) =>
          removeExFromDayById(addPickerDayIndex ?? idx, id)
        }
      />

      {/* Exercise Picker — Replace mode */}
      {replaceTarget !== null && (
        <ExercisePicker
          open={true}
          headerTitle={`Replace ${programState.workouts[replaceTarget.dayIndex]?.exercises[replaceTarget.exIndex]?.name || "Exercise"}`}
          onSelect={(ex) =>
            replaceExercise(replaceTarget.dayIndex, replaceTarget.exIndex, ex)
          }
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

      {/* Overflow Menu Sheet */}
      <AnimatePresence>
        {showOverflow && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowOverflow(false)}
            />
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
                {/* Edit weekly layout — opens ScheduleLayoutSheet (the
                    day-by-day Rest/Lift/Run/Both grid). Foundational, free. */}
                <button
                  type="button"
                  onClick={() => {
                    setShowOverflow(false);
                    openEditLayout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <CalendarDays className="size-5 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Edit weekly layout
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Set which days are Rest, Lift, Run or Both
                    </span>
                  </span>
                </button>
                {/* Pgm4: single free "Edit programme" entry. The three
                    previous items (Configure wizard / Programme settings /
                    Reset) and their Pro gate were consolidated into the
                    unified ProgrammeSettings editor at /settings/training —
                    goal, nutrition phase, lifting, running, equipment,
                    injuries, toggles and reset all live there now. */}
                <button
                  type="button"
                  onClick={() => {
                    setShowOverflow(false);
                    navigate("/settings/training");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <Settings2 className="size-5 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Edit programme
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Goal, nutrition, lifting, running, equipment, injuries
                    </span>
                  </span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
