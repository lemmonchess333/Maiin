import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProgram } from "@/features/program/useProgram";
import { useStreaks } from "@/features/streaks/useStreaks";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useWorkouts } from "@/hooks/useWorkouts";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import ProgrammeRunSection from "@/components/program/ProgrammeRunSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import WorkoutSession from "@/components/WorkoutSession";
import SavedRoutinesSection from "@/components/program/SavedRoutinesSection";
import WeeklyVolumeCard from "@/components/program/WeeklyVolumeCard";
import ProgrammeWeekSelector from "@/components/program/ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "@/components/program/ProgrammeWeekSelector";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import TrainingBlockCard from "@/components/program/TrainingBlockCard";
import { THEME } from "@/lib/theme";
import WeekPhaseRow from "@/components/program/WeekPhaseRow";
import SkipConfirmSheet from "@/components/program/SkipConfirmSheet";
import ExpressSessionSheet from "@/components/program/ExpressSessionSheet";
import {
  buildExpressSession,
  expressChoices,
  type SessionVariant,
} from "@/features/program/expressSession";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import {
  Dumbbell,
  Settings2,
  CalendarDays,
  Footprints,
  MoreHorizontal,
  Plus,
  FastForward,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Repeat,
  Trash2,
  Info,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getExerciseById } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { normalizeExercise } from "@/features/program/programTypes";
import {
  splitLabel,
  primaryGoalLabel,
  isCycleEndWeek,
} from "@/features/program/programEngine";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { resolveDayPagerDelta } from "@/lib/dayPagerSwipe";
import { useRunFitnessAutoDerive } from "@/hooks/useRunFitnessAutoDerive";

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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const { awardEventBadge } = useStreaks();
  // Latest programState for deferred handlers (e.g. the delete-undo toast,
  // which fires after the removing save has already advanced state).
  const programStateRef = useRef(programState);
  useEffect(() => {
    programStateRef.current = programState;
  }, [programState]);
  // Adaptive Paces: silently derive a fitness benchmark from recent runs when
  // the user hasn't set one (the "derive" half of the capture decision).
  useRunFitnessAutoDerive();
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
  // Mirror the Lift|Run tab into the URL (?tab=run) for the same reason as the
  // day selector: navigating into a run/exercise detail and pressing back must
  // return to the tab the user was on, not snap back to Lift.
  const urlTab: ProgramTab = searchParams.get("tab") === "run" ? "run" : "lift";
  const [activeTab, setActiveTab] = useState<ProgramTab>(urlTab);
  const selectTab = useCallback(
    (value: ProgramTab) => {
      setActiveTab(value);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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

  // Core navigation state. The selected training day is mirrored into the URL
  // (?day=N) so opening an exercise detail and pressing back RESTORES the day
  // instead of snapping to today — a fresh open (no ?day) still lands on today.
  const urlDay = (() => {
    const raw = searchParams.get("day");
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  })();
  const [selectedDayIndex, setSelectedDayIndex] = useState(urlDay ?? 0);
  const setDayInUrl = useCallback(
    (i: number) => {
      // replace (not push) so day taps don't stack history entries — back
      // should leave the page, not walk back through prior day selections.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("day", String(i));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const selectDay = useCallback(
    (i: number) => {
      setSelectedDayIndex(i);
      setDayInUrl(i);
    },
    [setDayInUrl]
  );
  const [direction, setDirection] = useState(0);
  const isAnimating = useRef(false);

  // UI state
  const [showOverflow, setShowOverflow] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);
  // PROGRAM-FLEX-01: Express Session chooser target + chosen variant.
  // The chooser only opens when a budget would actually change the day
  // (expressChoices > 1); otherwise Begin Workout stays one tap.
  const [expressChooserDay, setExpressChooserDay] = useState<number | null>(
    null
  );
  const [sessionVariant, setSessionVariant] = useState<SessionVariant>("full");

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
    const removed = programState.workouts[dayIdx]?.exercises[exIndex];
    if (!removed) return;
    const updated = programState.workouts.map((d, i) =>
      i === dayIdx
        ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== exIndex) }
        : d
    );
    await saveProgram({ ...programState, workouts: updated });
    // Exercise delete is destructive; offer an undo (parity with set-undo in
    // the workout session). Re-insert at the original index against the LATEST
    // state (the removing save has already advanced it).
    toast(`Removed ${removed.name}`, {
      action: {
        label: "Undo",
        onClick: () => {
          const latest = programStateRef.current;
          const day = latest?.workouts[dayIdx];
          if (!latest || !day) return;
          const exercises = [...day.exercises];
          exercises.splice(Math.min(exIndex, exercises.length), 0, removed);
          const restored = latest.workouts.map((d, i) =>
            i === dayIdx ? { ...d, exercises } : d
          );
          haptic("light");
          void saveProgram({ ...latest, workouts: restored });
        },
      },
    });
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

  // Auto-select on week change (not on individual completion). Skips the reset
  // on the FIRST run when the URL pinned a day (back-navigation restore) — only
  // a fresh open or a genuine week change snaps back to today.
  const prevWeekKeyRef = useRef("");
  useEffect(() => {
    if (!programState) return;
    const weekKey =
      viewingHistoryIndex !== null
        ? `h${viewingHistoryIndex}`
        : `w${programState.weekNumber}`;
    if (prevWeekKeyRef.current !== weekKey) {
      const isFirstRun = prevWeekKeyRef.current === "";
      prevWeekKeyRef.current = weekKey;
      // Honour a URL-restored day on mount; otherwise land on today.
      if (isFirstRun && urlDay !== null) return;
      const target = todayIndex >= 0 ? todayIndex : 0;
      selectDay(target); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: reset selection on week navigation
    }
  }, [programState, viewingHistoryIndex, todayIndex, urlDay, selectDay]);

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

  // PROGRAM-BLOCK-01: the programme's main compounds become the new
  // block's default anchor lifts (v1 auto-anchors — no picker yet).
  // Plain derivation — this region sits below an early return, so no
  // hooks; the arrays are small enough that memoisation buys nothing.
  const blockAnchorIds = [
    ...new Set(
      (programState?.workouts ?? [])
        .flatMap((w) => w.exercises)
        .filter((ex) => ex.isAccessory === false)
        .map((ex) => ex.exerciseId)
    ),
  ].slice(0, 3);

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
    selectDay(newIndex);
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
    // Capture the week being COMPLETED before it advances. A deload week is
    // the last week of a 4-week periodization mesocycle (isCycleEndWeek derives
    // this from generateWeekPrescription, so it can't drift from the schedule),
    // so completing it = "finished a full programme cycle". advanceToNextWeek
    // is gated on all days done/skipped → a genuine completion, not a calendar
    // catch-up rollover.
    const completedWeek = programState?.weekNumber ?? 0;
    await advanceToNextWeek();
    if (isCycleEndWeek(completedWeek)) {
      awardEventBadge("programme_complete");
    }
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

  // Swipe handlers — inner day-pager (Lift session swiper). Shares
  // resolveDayPagerDelta with the Run swiper so both use identical
  // thresholds. At its boundary it returns 0 and the outer tab-swipe
  // (useSwipeNavigation) takes over via the data-swipe-pager contract below.
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.dataset.swipeCard) return;
      el = el.parentElement;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const delta = resolveDayPagerDelta(dx, dy, idx, displayWorkouts.length);
    if (delta !== 0) {
      haptic("light");
      handleSelect(idx + delta);
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
              <h1 className="text-xl font-extrabold text-foreground">Train</h1>
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
            ariaLabel="Train mode"
            value={activeTab}
            onChange={(value) => selectTab(value)}
            tone={activeTab === "run" ? "running" : "lifting"}
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
            <Button
              fullWidth
              onClick={handleAdvanceWeek}
              disabled={advancing}
              leftIcon={<FastForward className="size-4" />}
            >
              {advancing ? "Advancing..." : "Advance to Next Week"}
            </Button>
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
              data-swipe-pager
              data-swipe-at-start={idx <= 0}
              data-swipe-at-end={idx >= displayWorkouts.length - 1}
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
                      {/* PROGRAM-BLOCK-01 — compact Training Block header.
                          Quiet by design: the SessionCommandCard below stays
                          the tab's primary moment. */}
                      {profile?.uid && programState && (
                        <TrainingBlockCard
                          uid={profile.uid}
                          defaultWeeklyLiftTarget={programState.workouts.length}
                          mainCompoundIds={blockAnchorIds}
                          trainingWhy={profile?.trainingWhy?.trim() ?? ""}
                        />
                      )}

                      {/* ── Session hero — shared command-card chrome
                            (SessionCommandCard sport="lift"), mirroring the Run
                            tab so both sports get the same "what's next"
                            moment. Cursor-aware eyebrow; the primary "Begin
                            Workout" CTA renders only on the startable cursor
                            session (terminal/upcoming days show status, no
                            button). The editable exercise list stays its own
                            body below. Replaces the old hand-rolled header that
                            hardcoded the lift purple / success green. */}
                      <SessionCommandCard
                        sport="lift"
                        eyebrow={`${
                          status === "completed"
                            ? "Completed"
                            : status === "skipped"
                              ? "Skipped"
                              : status === "today"
                                ? "Up next"
                                : "Upcoming"
                        } · Day ${idx + 1}`}
                        title={selectedWorkout.dayName}
                        description={muscleGroups || undefined}
                        meta={[
                          `${exerciseCount} exercises`,
                          `~${estimatedMinutes} min`,
                        ]}
                        primaryActionLabel={
                          status === "today" && !selectedWorkout.completed
                            ? "Begin Workout"
                            : undefined
                        }
                        onPrimaryAction={
                          status === "today" && !selectedWorkout.completed
                            ? () => {
                                haptic("light");
                                // PROGRAM-FLEX-01: offer time budgets
                                // only when trimming would change the
                                // session; short days start directly.
                                if (expressChoices(selectedWorkout).length > 1)
                                  setExpressChooserDay(idx);
                                else {
                                  setSessionVariant("full");
                                  setSessionDayIndex(idx);
                                }
                              }
                            : undefined
                        }
                      />

                      {/* Secondary action: skip this session — mirrors the
                          Run card's "Start free run instead" link. Offered on
                          the cursor day AND any upcoming day of the CURRENT
                          week (owner request 2026-07-11: "let me move to next
                          week when I want" — skipping the remaining days is
                          the deliberate, per-day path to the Advance button).
                          History weeks are records, not prescriptions. */}
                      {(status === "today" || status === "upcoming") &&
                        !isViewingHistory && (
                          <div className="flex items-center justify-center">
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
                        )}

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
                                    label={ex.name}
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
                                  label={ex.name}
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
                                    onContextMenu={(e) => {
                                      // D-LIFT-17: long-press is touch-only —
                                      // right-click is its pointer/desktop
                                      // equivalent for the same manage menu.
                                      e.preventDefault();
                                      setContextMenu({
                                        dayIndex: idx,
                                        exIndex: i,
                                        x: e.clientX,
                                        y: e.clientY,
                                      });
                                    }}
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
                                    {ex.notes && (
                                      <p className="text-xs mt-1 text-muted-foreground flex items-start gap-1">
                                        <Info className="size-3 shrink-0 mt-0.5" />
                                        <span>{ex.notes}</span>
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
                            // Brand success green via the THEME token (=#4DB872)
                            // + hex alpha, not a raw rgb literal. Faithful swap:
                            // the Tailwind `--success` token is a different,
                            // darker green, so bg-success/5 would shift the
                            // colour — THEME.success keeps it exact.
                            backgroundColor: `${THEME.success}0D`,
                            border: `1px solid ${THEME.success}26`,
                          }}
                        >
                          <div className="flex justify-around items-center">
                            <div className="text-center">
                              <p className="text-base font-bold font-mono tabular-nums text-foreground">
                                ~{estimatedMinutes} min
                              </p>
                              <p className="text-caption font-medium text-muted-foreground">
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
                              <p className="text-caption font-medium text-muted-foreground">
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
                              <p className="text-caption font-medium text-muted-foreground">
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
          </TrackProgrammeSectionView>
        </>
      )}

      {/* Saved routines (PR 4) — workouts the user copied from the
          social feed via "Save as routine". Hides itself entirely
          when the user has no saved entries, so users who don't use
          the feature never see the section. Lift tab only — the
          surfaces are workout-centric. */}
      {/* Weekly sets-per-muscle volume summary (D-LIFT-1) — read-only, for the
          viewed week, against goal landmarks. */}
      {activeTab === "lift" && (
        <WeeklyVolumeCard
          workouts={displayWorkouts}
          primaryGoal={profile?.primaryGoal}
        />
      )}

      {activeTab === "lift" && <SavedRoutinesSection />}

      {/* ROUTINE-EXCHANGE-01 — curated blueprint shelf. Read-only
          intents; saving creates a private routine copy, never a
          programme change. */}

      {/* Section-Split: focused "Edit lift plan" entry — mirrors the Run
          tab's "Edit run plan ›" footer. Deep-links to the lift-only editor
          (/settings/lift-plan) instead of the full programme form. The ⋯
          menu's "Edit programme" still opens the everything editor. */}
      {activeTab === "lift" && (
        <div className="flex justify-end pt-2 border-t border-border/30">
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate("/settings/lift-plan");
            }}
            className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
          >
            Edit lift plan
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}

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

      {/* Express Session chooser (PROGRAM-FLEX-01) */}
      <ExpressSessionSheet
        open={expressChooserDay !== null}
        day={
          expressChooserDay !== null
            ? (programState.workouts[expressChooserDay] ?? null)
            : null
        }
        onClose={() => setExpressChooserDay(null)}
        onStart={(variant) => {
          const idx = expressChooserDay;
          setExpressChooserDay(null);
          if (idx === null) return;
          setSessionVariant(variant);
          setSessionDayIndex(idx);
        }}
      />

      {/* In-Session Workout Screen */}
      {sessionDayIndex !== null &&
        programState.workouts[sessionDayIndex] &&
        (() => {
          // Express variants run a deterministically trimmed COPY of
          // the day — the stored programme day is never mutated, and
          // the LIFT-01 draft identity derives from the trimmed layout
          // so a full-session draft can't restore into an express run
          // (or vice versa). The session logs sets positionally over
          // the TRIMMED list, while logExercise and completeWorkoutDay
          // index into the STORED day — both callbacks realign through
          // plan.sourceIndexes so a dropped accessory can't shift
          // progression or the saved record onto the wrong lift.
          const storedDay = programState.workouts[sessionDayIndex];
          const plan =
            sessionVariant === "full"
              ? null
              : buildExpressSession(storedDay, sessionVariant);
          return (
            <WorkoutSession
              day={
                plan ? { ...storedDay, exercises: plan.exercises } : storedDay
              }
              dayIndex={sessionDayIndex}
              draftEpoch={programState.weekNumber}
              sessionVariant={
                plan ? (plan.variant as "express45" | "express30") : undefined
              }
              onLogExercise={
                plan
                  ? (di, exIdx, reps, weight, rpe) =>
                      logExercise(
                        di,
                        plan.sourceIndexes[exIdx] ?? exIdx,
                        reps,
                        weight,
                        rpe
                      )
                  : logExercise
              }
              onCompleteDay={
                plan
                  ? (di, sd) => {
                      // Re-expand trimmed setLogs to stored-day
                      // positions. Dropped exercises get [] (recorded
                      // as zero completed sets — same as an exercise
                      // the user skipped mid-session), NEVER undefined
                      // (undefined falls back to planned all-completed
                      // data, which would fake work never done).
                      const aligned = storedDay.exercises.map(
                        () =>
                          [] as {
                            weight: number;
                            reps: number;
                            completed: boolean;
                          }[]
                      );
                      plan.sourceIndexes.forEach((srcIdx, i) => {
                        aligned[srcIdx] = sd.setLogs[i] ?? [];
                      });
                      return completeWorkoutDay(di, {
                        ...sd,
                        setLogs: aligned,
                      });
                    }
                  : completeWorkoutDay
              }
              onClose={() => {
                setSessionDayIndex(null);
                setSessionVariant("full");
              }}
            />
          );
        })()}

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
