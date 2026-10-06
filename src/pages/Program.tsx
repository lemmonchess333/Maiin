import {
  buildTimeBudgetSession,
  isLiftTimeBudget,
} from "@/features/program/liftTimeBudget";
import { workoutCompletionDayIdentity } from "@/lib/workoutCompletion";
import { liftCompletionContext } from "@/lib/completionPlanContext";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { focusLabel } from "@/features/program/trainingBlock";
import {
  LIFT_DAY_STATUS_LABEL,
  liftDayStatus,
} from "@/features/program/liftDayStatus";
import { useProgram } from "@/features/program/useProgram";
import { changeStands } from "@/features/program/programOutcome";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { useStreaks } from "@/features/streaks/useStreaks";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import ProgrammeRunSection from "@/components/program/ProgrammeRunSection";
import ProgramOfflineBanner from "@/components/program/ProgramOfflineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import WorkoutSession from "@/components/WorkoutSession";
import SavedRoutinesSection from "@/components/program/SavedRoutinesSection";
import ProgrammeWeekSelector from "@/components/program/ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "@/components/program/ProgrammeWeekSelector";
import { dayFocusLabel, liftDayTitle } from "@/lib/liftDayLabel";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import LiftPurpose from "@/components/program/LiftPurpose";
import { deloadDismissKey, pickLiftAdvice } from "@/lib/programNotices";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import ExerciseRowSummary from "@/components/program/ExerciseRowSummary";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import TrainingBlockCard from "@/components/program/TrainingBlockCard";
import ExperienceSuggestionCard from "@/components/program/ExperienceSuggestionCard";
import {
  blockOfferBlockedByRace,
  blockPrefersShorterSessions,
} from "@/features/program/represcribe";
import { liftWeekLabel } from "@/lib/liftWeekLabel";
import WeekPhaseRow from "@/components/program/WeekPhaseRow";
import SkipConfirmSheet from "@/components/program/SkipConfirmSheet";
import ExpressSessionSheet from "@/components/program/ExpressSessionSheet";
import {
  buildExpressSession,
  draftScopeForVariant,
  estimateSessionMinutes,
  type SessionVariant,
} from "@/features/program/expressSession";
import type { RestContext } from "@/features/program/restTime";
import {
  buildEasierSession,
  pickLighterDay,
  summarizeEasier,
} from "@/features/program/easierToday";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { useEasierTodayRecommendation } from "@/features/program/useEasierTodayRecommendation";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import {
  CalendarRange,
  Dumbbell,
  Feather,
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageShell from "@/components/ui/PageShell";
import type { Exercise } from "@/lib/exercises";
import { splitLabel } from "@/features/program/programEngine";
import {
  isCycleEndWeek,
  lighterWeekAllowed,
} from "@/features/program/weekPrescription";
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
import IconButton from "@/components/ui/IconButton";
import ExercisePicker from "@/components/program/ExercisePicker";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";
import TrackProgrammeSectionView from "@/components/program/TrackProgrammeSectionView";
import DeloadBanner from "@/components/program/DeloadBanner";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import {
  loadFromRunning,
  shouldSuggestDeload,
} from "@/lib/deloadSuggestVisibility";
import { runHeaderLine } from "@/lib/runHeaderLine";
import { resolveDeloadRecommended } from "@/lib/performanceDocFields";
import { deloadRunSwapCount } from "@/lib/deloadChangeSummary";
import GuideHint from "@/components/guide/GuideHint";
import { openLiftSession } from "@/features/program/openLiftSession";
import { lastSetsByExercise } from "@/features/program/lastSets";

/**
 * IMPORTANT:
 * React error #310 is very commonly caused by hook order mismatches when gated UI
 * flips between renders (e.g. subscription/features loading).
 *
 * Fix: split into a gate component (subscription only) + inner component (program hook).
 */

export default function Program() {
  return <ProgramInner />;
}

function ProgramInner() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    skipWorkoutDay,
    setNextWorkout,
    advanceToNextWeek,
    regenerateProgram,
    reorderDayExercises,
    removeExerciseFromDay,
    addExercisesToDayCmd,
    replaceExerciseInDay,
    restoreRemovedExercise,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
    overrideRunDay,
    applyEaseWeek,
    revertEaseWeek,
    markManualComplete,
    skipRunDay,
    restoreRunDay,
    restoreWorkoutDay,
    moveRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
    realignRacePlan,
    dismissFellBehindPrompt,
    applyDeloadWeek,
    revertDeloadWeek,
    startTrainingBlock,
    adoptLegacyTrainingBlock,
    releaseTrainingBlock,
    keepTrainingBlockFocus,
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
  // PROGRAM-DELOAD-01: Apply routes through the server applyDeloadWeek
  // command; undo lives in the success toast (reversibility-over-
  // confirmation — no dialog). The banner itself fires the 'applied'
  // telemetry; the undo path tracks 'undo' here since the toast owns it.
  const handleApplyDeload = useCallback(async (): Promise<boolean> => {
    const ok = await applyDeloadWeek();
    if (!ok) {
      toast.error(
        "Couldn't take a lighter week. Check your connection and try again."
      );
      return false;
    }
    toast.success("A lighter week: half the sets, at the same weights", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          void revertDeloadWeek().then((reverted) => {
            if (reverted) {
              trackProgrammeEvent("programme_deload_banner_action", {
                action: "undo",
              });
              toast.success("Back to the full plan this week");
            } else {
              toast.error("Couldn't undo the lighter week.");
            }
          });
        },
      },
    });
    return true;
  }, [applyDeloadWeek, revertDeloadWeek]);

  const completeWithViewToast = completeWorkoutDay;

  const runsTarget = getWeeklyRunTarget(profile);
  // PR-2: weekly layout editor sheet. Mounted conditionally — when
  // closed the body unmounts and the inner useProgrammeScheduleEditor
  // hook tears down, so the next open re-reads `profile` fresh.
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const openEditLayout = useCallback(() => {
    setEditLayoutOpen(true);
  }, [setEditLayoutOpen]);
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

  const { workouts: recentWorkouts, loading: workoutsLoading } = useWorkouts();

  // Every counted set from the last session with each exercise, for the
  // rows' "Last:" line (`lastSetsByExercise`).
  const lastSetsMap = useMemo(
    () => lastSetsByExercise(recentWorkouts),
    [recentWorkouts]
  );

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
  // The week rollover waits while a session is open, so its finish lands on
  // the week it started in (`openLiftSession`).
  const sessionOpen = sessionDayIndex !== null;
  useEffect(() => (sessionOpen ? openLiftSession() : undefined), [sessionOpen]);
  // PROGRAM-FLEX-01: Express Session chooser target + chosen variant.
  // The chooser only opens when a budget would actually change the day
  // (expressChoices > 1); otherwise Start workout stays one tap.
  const [expressChooserDay, setExpressChooserDay] = useState<number | null>(
    null
  );
  const [sessionBudgetMinutes, setSessionBudgetMinutes] = useState<number>(60);
  const [sessionVariant, setSessionVariant] = useState<SessionVariant>("full");

  // Skip confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipTargetDay, setSkipTargetDay] = useState<number | null>(null);

  // Swipe navigation
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Exercise card state — read-only, tap opens info sheet
  const [reorderMode, setReorderMode] = useState(false);
  /* The training block's detail sheet, driven from the page ⋯ now that
     the running block's own row is gone — its title was the week row's
     string and its subtitle repeated the number. The card still renders
     "Start a training block" and "Block complete" itself; only the
     running state moved. */
  const [blockDetailOpen, setBlockDetailOpen] = useState(false);
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
    if (!removed?.instanceId) return;
    if (!(await removeExerciseFromDay(dayIdx, removed.instanceId))) return;
    // Exercise delete is destructive; offer an undo (parity with set-undo in
    // the workout session).
    //
    // P6: the undo is a SERVER command now, not a client re-insert. It used to
    // splice the removed exercise object back in from a React closure — which
    // is the one thing the boundary cannot accept, because a client-supplied
    // exercise is exactly what the validator refuses. The reducer soft-deletes
    // instead, stashing the original verbatim, so `restoreExercise` returns the
    // same lift with its history and load rather than a catalog rebuild of it.
    //
    // That is also why this pair could not be half-migrated: leaving the undo
    // as a direct write would have kept the mixed-mode clobbering the boundary
    // exists to remove.
    toast(`Removed ${removed.name}`, {
      action: {
        label: "Undo",
        onClick: () => {
          haptic("light");
          void restoreRemovedExercise(dayIdx);
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
    // P6: through the boundary. This is the remove with NO undo partner, which
    // is what makes it migratable — the other one offers an undo that restores
    // the exercise's history and load, and the server cannot rebuild either.
    const instanceId = exercises[lastIdx]?.instanceId;
    if (!instanceId) return;
    await removeExerciseFromDay(dayIdx, instanceId);
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
    // P6: same boundary as drag-and-drop — one reorder path, one authority.
    await reorderDayExercises(
      dayIdx,
      exercises.map((ex) => ex.instanceId ?? "")
    );
    setContextMenu(null);
  };

  const replaceExercise = async (
    dayIdx: number,
    exIndex: number,
    newEx: Exercise
  ) => {
    if (!programState) return;
    const old = programState.workouts[dayIdx].exercises[exIndex];
    if (!old?.instanceId) return;
    // P6: through the boundary. The identity work the long comment here used
    // to describe — carry the role-level prescription, re-infer the category,
    // mint a new instance, reset a reps<->seconds transition — now lives in
    // `replaceExerciseInDay` and in the server reducer that is its authority.
    //
    // The one thing that could NOT simply move is the load: the reducer has no
    // profile, so it used to hard-code 0. The calibrated weight is computed
    // client-side and sent as a bounded scalar; see the reducer's note.
    await replaceExerciseInDay(dayIdx, old.instanceId, newEx.id);
    setReplaceTarget(null);
  };

  const addExercisesToDay = async (dayIdx: number, exercises: Exercise[]) => {
    if (!programState) return;
    // Don't hardcode movementCategory — normalizeExercise infers from
    // the exercise name via inferMovementCategory. Forcing
    // "horizontal_push" was tagging every added exercise (including
    // pulls, legs, isolations) as a horizontal press, contaminating
    // analytics, MuscleHeatMap input, and social-post muscle groups.
    // P6: through the boundary. Only IDS cross the wire — the server derives
    // the name and category from the catalog rather than trusting a
    // client-supplied exercise object, which is the boundary's security stance.
    // Equivalent because both sides start an added movement UNCALIBRATED at
    // 3x10x0; that is what separates this from `replaceExercise`.
    await addExercisesToDayCmd(
      dayIdx,
      exercises.map((e) => e.id)
    );
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

    // Green flash — track the dropped exercise by its stable id so the flash
    // lands on the right row after the re-render reorders the list.
    setJustDroppedId(rowId(reordered[newIdx], dayIndex, newIdx));
    setTimeout(() => setJustDroppedId(null), 300);

    // P6: through the command boundary, not `saveProgram`. The reorder applies
    // optimistically first, so the drop still settles immediately; the server
    // is the authority for what actually persists.
    await reorderDayExercises(
      dayIndex,
      reordered.map((ex) => ex.instanceId ?? "")
    );
  };

  /* DS3: one advice notice at a time (`programNotices`). Train owns the
     two week-level dismissals so it can hold the rest back while either
     shows. The week key is the one the banners have always used,
     `w${displayWeekNumber}`, worked out here because hooks run before the
     loading return below. */
  const noticeWeekKey = `w${
    viewingHistoryIndex !== null
      ? (viewedWeekNumber ?? 1)
      : (programState?.weekNumber ?? 1)
  }`;
  const deloadNotice = useDismissOnce(deloadDismissKey(noticeWeekKey));

  // Today index: the next-up cursor, the session Home offers too.
  const todayIndex = useMemo(() => {
    if (!programState || viewingHistoryIndex !== null) return -1;
    return nextUpIndex(programState);
  }, [programState, viewingHistoryIndex]);

  const easierRecommendation = useEasierTodayRecommendation(
    programState?.workouts[expressChooserDay ?? todayIndex]
  );

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
      // Reset the selection on week navigation.
      selectDay(target);
    }
  }, [programState, viewingHistoryIndex, todayIndex, urlDay, selectDay]);

  // Scroll reset on day change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedDayIndex]);

  // Home's Today card links here with `?day=N&start=1` (DS3): Start on Home
  // begins the session. Begin it the way this page's own Start does, once,
  // then drop `start` from the
  // URL so a refresh or a back navigation lands on the day instead of
  // starting it again. A finished or skipped day just opens. N is the day
  // Home showed, which can differ from this page's rotation cursor
  // (ADR-0002: Home resolves a lift by weekday); starting a day off the
  // cursor is already supported, it is what the lighter-day swap does.
  const startRequested = searchParams.get("start") === "1";
  useEffect(() => {
    if (!startRequested || !programState) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("start");
        return next;
      },
      { replace: true }
    );
    if (viewingHistoryIndex !== null || urlDay === null) return;
    const day = programState.workouts[urlDay];
    if (!day || day.completed || day.skipped) return;
    // A plan built to fit the person's time (Lift4 (5)) starts in full; one
    // built before that still trims to their usual time at Start.
    const budget =
      programState.sessionMinutes === undefined &&
      isLiftTimeBudget(profile?.liftTimeBudgetMinutes)
        ? profile!.liftTimeBudgetMinutes!
        : null;
    /* eslint-disable react-hooks/set-state-in-effect -- a one-shot reaction
       to the deep link, consumed above so it cannot repeat */
    setSessionBudgetMinutes(budget ?? 60);
    setSessionVariant(budget === null ? "full" : "time_budget");
    setSessionDayIndex(urlDay);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    startRequested,
    programState,
    viewingHistoryIndex,
    urlDay,
    profile,
    setSearchParams,
  ]);

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
  // Older saves have no explicit link. Only a unique current-week match is
  // safe; historical/ambiguous records retain the History fallback.
  const legacySavedMatches =
    !isViewingHistory && selectedWorkout
      ? recentWorkouts.filter(
          (workout) =>
            workout.date >= localWeekKey() &&
            workout.date <= localDateString() &&
            workout.notes ===
              `${selectedWorkout.dayName} — Programme Week ${displayWeekNumber}`
        )
      : [];
  const completedWorkoutId =
    selectedWorkout?.completedWorkoutId ??
    (legacySavedMatches.length === 1 ? legacySavedMatches[0].id : null);

  // Day status. A past week's day left open was missed: it takes no time
  // estimate and no note about starting it, since it cannot come up again.
  const status = liftDayStatus(selectedWorkout, {
    pastWeek: isViewingHistory,
    cursor: isSelectedToday,
  });
  const missed = status === "missed";

  // Lift selector cells — SPLIT-ORDERED (ADR-0002): the circle shows the
  // session number (Day 1..N), not a calendar date, and the rotation cursor
  // (todayIndex = next-incomplete) is the lift execution surface. Skipped
  // stays distinct from completed (a green check on a skipped day would read
  // as "you trained"); ProgrammeWeekSelector renders the Ban glyph for it.
  const liftSelectorCells: ProgrammeWeekSelectorCell[] = displayWorkouts.map(
    (w, i) => ({
      key: String(i),
      center: String(i + 1),
      // The day's FOCUS ("Squat", "Chest", "Shoulder"), not its split
      // category. The chip is one `truncate`d line, so the full "Push —
      // Chest Focus" cannot go here, and the category is the wrong half to
      // keep: it is already the page header's subtitle, and it REPEATS —
      // a Full Body rotation labels all three days "Full Body", and a
      // Push/Pull/Legs x2 week labels days 1 and 4 both "Push". The
      // focus is what varies within a week by construction.
      bottomLabel: dayFocusLabel(w.dayName),
      status: w.completed ? "completed" : w.skipped ? "skipped" : "upcoming",
      isToday: !isViewingHistory && i === todayIndex,
    })
  );

  // Session metadata. Every estimate here prices the rests the session's
  // timer will run (`restSecondsFor`): the person's fixed rest, or the
  // plan's, shorter in a plan built for 30 minutes.
  const restContext: RestContext = {
    fixedRest: profile?.defaultRestSeconds,
    sessionMinutes: programState.sessionMinutes,
  };
  // The trim at Start retires with plans built to fit the time (Lift4 (5)):
  // only a plan from before then still trims to the person's usual time.
  const usualBudget =
    programState.sessionMinutes === undefined &&
    isLiftTimeBudget(profile?.liftTimeBudgetMinutes)
      ? profile.liftTimeBudgetMinutes
      : null;
  const usualPlan =
    selectedWorkout && usualBudget !== null
      ? buildTimeBudgetSession(selectedWorkout, usualBudget, restContext)
      : null;
  // Was an inline copy of the old sets x 2.5 formula. A second copy of a
  // shared rule is the drift this repo keeps paying for — and it would now
  // disagree with the chooser sheet on the same screen.
  const estimatedMinutes =
    usualPlan?.estimatedMinutes ??
    estimateSessionMinutes(selectedWorkout?.exercises ?? [], restContext);

  /* The session card's words and picture (DS3). "Pull — Lat Focus" set
     whole as a title broke at the dash on a phone, so the category joins
     the day's status in the eyebrow and the focus is the title, as on
     Home. The picture is the muscles the day works; the rows below carry
     each exercise's drawing. */
  const sessionTitle = liftDayTitle(selectedWorkout?.dayName ?? "");
  const sessionStatusLabel = LIFT_DAY_STATUS_LABEL[status];
  const sessionMuscleCategories = (selectedWorkout?.exercises ?? []).map(
    (ex) => ex.movementCategory
  );

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

  // ── Handlers ──
  const handleSelect = (newIndex: number) => {
    if (isAnimating.current || newIndex === idx) return;
    isAnimating.current = true;
    setDirection(newIndex > idx ? 1 : -1);
    selectDay(newIndex);
    trackProgrammeEvent("programme_day_tapped", { dayIndex: newIndex });
  };

  // W1b legibility line: "[split] · [N] days/week", from persisted
  // programState fields (splitType + actual workout count).
  //
  // Pre-W1a the Program-page subtitle hardcoded a binary split check
  // (`ppl` vs "Upper / Lower") — so full_body, bro_split, ppl_x2, and
  // fat-loss-circuit users all saw the wrong label.
  //
  // Edge handling:
  //   - Run-only athletes (workouts.length === 0): no split or days, so
  //     the line names the focus and says there are no lift days.
  //   - Legacy docs without primaryGoal read as the general focus, which
  //     is what the engine built for them (`goalProfileFor(undefined)`).
  //   - Day count uses workouts.length (actual) rather than
  //     profile.daysPerWeek (requested) — reflects what the engine
  //     produced after the W1a 7-day cap.
  const programHeaderLine = (() => {
    if (!programState) return "";
    const dayCount = programState.workouts.length;
    // Run-only: no lift days means no week row beneath, so this is the
    // only line that says why the tab is empty. The focus stays here, in
    // Settings' words, as everywhere else on Train.
    if (dayCount === 0)
      return `${focusLabel(programState.primaryGoal ?? "general")} · no lift days`;
    const daysLabel = dayCount === 1 ? "1 day/week" : `${dayCount} days/week`;
    // The focus is deliberately absent from this branch. The week row
    // states it on every render, in Settings' words (`focusLabel`), with
    // or without a block running. Carrying it here as well named one
    // field twice. Split and day count are stated in words nowhere else,
    // so they stay.
    return `${splitLabel(programState.splitType)} · ${daysLabel}`;
  })();

  // Run-tab header line — so the subtitle stops being lift-led when the
  // user is on the Run tab. Race prep leads with distance + week-of-M;
  // structured shows weekly run frequency; freeform is the calm default.
  // (Run9 locked model: only freeform + race-goal overlay exist.)
  //
  // The GOAL now comes from the resolver. Taking it from the runPlan mirror
  // while the mode came from the profile is what made this render
  // "Race prep · Set your race goal" at users who had just set one, for as
  // long as regeneration took. The mode itself stays on the profile — that
  // half was already canonical, and narrowing it to the resolver's RunMode
  // would drop legacy `structured` profiles to freeform. The derivation
  // moved to src/lib/runHeaderLine.ts so the case could be pinned by a test.
  const resolvedRunPlan = resolveRunPlan(
    profile,
    programState,
    localDateString(new Date())
  );
  /**
   * P1d pin 2 — race-taper exclusivity for the deload-suggest banner.
   *
   * The Performance Index can recommend a deload for a runner who is
   * already tapering into a race, and the banner had no guard: it offered
   * a lighter week on top of a taper that is itself a planned load
   * cut. The lock's words are "taper IS the deload; no double-deload".
   *
   * The decision lives in `shouldSuggestDeload` rather than inline here,
   * following this file's own runHeaderLine precedent — the bug was a
   * missing term in a render expression, which is exactly what no test
   * can reach while it stays one.
   */
  const showDeloadSuggest = shouldSuggestDeload({
    deloadRecommended: resolveDeloadRecommended(perfWeek),
    loadFromRunning: loadFromRunning(perfWeek),
    currentWeek: programState?.runPlan?.currentWeek,
    totalWeeks: programState?.runPlan?.totalWeeks,
    distance: resolvedRunPlan.raceGoal?.distance as
      | "5k"
      | "10k"
      | "half"
      | "marathon"
      | undefined,
  });
  const liftAdvice = pickLiftAdvice({
    deload:
      showDeloadSuggest &&
      programState.currentPhase !== "deload" &&
      !deloadNotice.dismissed,
    easier:
      status === "today" &&
      !!selectedWorkout &&
      !selectedWorkout.completed &&
      !!easierRecommendation?.recommended,
  });

  const programRunHeaderLine = runHeaderLine({
    runMode: profile?.runMode ?? "freeform",
    raceGoal: resolvedRunPlan.raceGoal,
    currentWeek: programState?.runPlan?.currentWeek,
    totalWeeks: programState?.runPlan?.totalWeeks,
    runsTarget,
  });

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
  /* DS3: Train's header is the plain one every page has. The sport-tinted
     header zone and the icon tile beside the title are gone: the Lift/Run
     switch and everything beneath it already say which mode is on. */
  return (
    <PageShell
      title="Train"
      banner={<ProgramOfflineBanner />}
      /* Tab-aware, so the Run tab does not read as an add-on under a
         lifting-only header. Two lines reserved: the lift line often wraps
         while the run line is one, and without the reserve everything
         below shifted ~12px on Lift↔Run. */
      subtitle={activeTab === "run" ? programRunHeaderLine : programHeaderLine}
      subtitleReserveLines={1}
      /* Overflow, plus a "Done" exit only while reordering. */
      actions={
        <>
          {activeTab === "lift" &&
            (programState?.workouts?.length ?? 0) > 0 &&
            reorderMode && (
              <button
                type="button"
                onClick={() => setReorderMode(false)}
                className="px-3 py-1.5 min-h-[44px] inline-flex items-center rounded-lg text-xs font-semibold text-lifting-strong"
              >
                Done
              </button>
            )}
          <button
            type="button"
            onClick={() => setShowOverflow(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="More options"
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </>
      }
      /* Sport-coded 2-tab switch: purple = lift, coral = run. */
      controls={
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
      }
    >
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
              /* An active lighter week is state and shows regardless. */
              visible={showDeloadSuggest}
              dismissed={deloadNotice.dismissed}
              onDismiss={deloadNotice.dismiss}
              weekKey={`w${displayWeekNumber}`}
              deloadActive={programState.currentPhase === "deload"}
              // The run half of the deload, named in the copy. Derived from
              // the snapshot rather than stored — see deloadChangeSummary.
              runsEased={deloadRunSwapCount(programState)}
              onApply={handleApplyDeload}
            />
          </TrackProgrammeSectionView>

          <TrackProgrammeSectionView section="week_phase_row">
            <div>
              <WeekPhaseRow
                weekNumber={displayWeekNumber}
                label={
                  liftWeekLabel(
                    {
                      ...programState,
                      weekNumber: displayWeekNumber,
                      trainingBlock: isViewingHistory
                        ? undefined
                        : programState.trainingBlock,
                    },
                    localDateString(),
                    profile?.experience
                  ) ?? undefined
                }
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
            <div data-guide-anchor="train-order">
              <ProgrammeWeekSelector
                sport="lift"
                ariaLabel="Lift sessions"
                cells={liftSelectorCells}
                selectedKey={String(idx)}
                onSelect={(key) => handleSelect(Number(key))}
              />
            </div>
          </TrackProgrammeSectionView>
          {/* The guide's hint on a first visit to the lift tab (FV1): the
              rotation is the one thing about Train that the screen can't
              say by itself. Not while a session is open over the page. */}
          <GuideHint
            id="train-order"
            placement="top"
            when={liftSelectorCells.length > 1 && sessionDayIndex === null}
          />

          {/* Experience auto-detection: evidence-triggered level suggestion.
                Renders null almost always — only when the v2 exhaustion
                criteria hold (misses + survived reset, mature programme,
                not cutting), and never after a dismissal. Spacing lives
                INSIDE the card so the null render leaves no phantom gap.
                BELOW the day selector (DS2, 2026-08-22): it used to sit
                between WeekPhaseRow and the selector, so on the rare render
                a ~434px card split the week header from the day circles it
                governs and the circles read as belonging to the suggestion.
                Below keeps navigator adjacency without burying the
                navigator, which moving the card ABOVE the header would. */}
          <ExperienceSuggestionCard
            suppressed={liftAdvice === "deload"}
            workouts={programState?.workouts}
            context={{
              weekNumber: programState?.weekNumber,
              nutritionGoal: programState?.goal,
            }}
          />
        </>
      )}

      {/* ── Advance Week (all complete, current week) — lift tab only. */}
      {/* Free, deliberately (owner call 2026-08-04). This was the last
          surviving `phaseLocked` gate, and gating it was the wrong trade: it
          is not a premium capability, it is the only way to tell the app you
          finished your week early. Without it a user who trains six days by
          Wednesday has no forward affordance at all and waits for Sunday —
          and the operator's own trial had expired, so THE single production
          user could never advance manually. */}
      {activeTab === "lift" && allComplete && !isViewingHistory && (
        <div className="pt-4 pb-2">
          <Button
            fullWidth
            onClick={handleAdvanceWeek}
            disabled={advancing}
            leftIcon={<FastForward className="size-4" />}
          >
            {advancing ? "Starting…" : "Start next week"}
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
            applyEaseWeek={applyEaseWeek}
            revertEaseWeek={revertEaseWeek}
            markManualComplete={markManualComplete}
            skipRunDay={skipRunDay}
            skipWorkoutDay={skipWorkoutDay}
            restoreRunDay={restoreRunDay}
            restoreWorkoutDay={restoreWorkoutDay}
            moveRunDay={moveRunDay}
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
                      {/* ── Session hero — shared command-card chrome
                            (SessionCommandCard sport="lift"), mirroring the Run
                            tab so both sports get the same "what's next"
                            moment. Cursor-aware eyebrow; the primary "Start
                            workout" CTA renders only on the startable cursor
                            session (terminal/upcoming days show status, no
                            button). The editable exercise list stays its own
                            body below. Replaces the old hand-rolled header that
                            hardcoded the lift purple / success green. */}
                      <SessionCommandCard
                        sport="lift"
                        eyebrow={[sessionTitle.category, sessionStatusLabel]
                          .filter(Boolean)
                          .join(" · ")}
                        title={sessionTitle.title}
                        figure={
                          hasMuscleFigure(sessionMuscleCategories) ? (
                            <MiniMuscleFigure
                              categories={sessionMuscleCategories}
                              className="h-24 w-auto"
                            />
                          ) : undefined
                        }
                        meta={
                          status === "completed" || missed
                            ? []
                            : [`~${estimatedMinutes} min`]
                        }
                        /* The card always carries the day's ONE action.
                           Start on the startable day; on an upcoming one
                           "Make this next" IS the action (you cannot start
                           it), so it takes the slot rather than floating in
                           a row beneath. A completed or skipped day has no
                           action and the slot stays empty. History weeks
                           are records, not prescriptions — the same gate
                           the row used. */
                        primaryActionLabel={
                          status === "today" && !selectedWorkout.completed
                            ? "Start workout"
                            : status === "upcoming" && !isViewingHistory
                              ? "Make this next"
                              : undefined
                        }
                        primaryActionIcon={
                          status === "upcoming" ? (
                            <ArrowUp className="size-4" />
                          ) : undefined
                        }
                        primaryActionVariant={
                          status === "upcoming" ? "secondary" : undefined
                        }
                        onPrimaryAction={
                          status === "upcoming" && !isViewingHistory
                            ? () => {
                                haptic("light");
                                void setNextWorkout(idx);
                              }
                            : status === "today" && !selectedWorkout.completed
                              ? () => {
                                  haptic("light");
                                  // Begin means begin (operator, 2026-08-05:
                                  // the every-tap chooser was "too much
                                  // choice"). Hevy / Strong / Fitbod all start
                                  // on tap — the CLAUDE.md reference bar for
                                  // surfacing an interstitial isn't met. The
                                  // honest versions stay one tap away: the
                                  // "Short on time?" link opens the chooser,
                                  // and a signal-backed easier day surfaces as
                                  // its own row below, so PROGRAM-ADAPT-01's
                                  // never-auto-applied offer survives without
                                  // taxing every session start.
                                  setSessionBudgetMinutes(usualBudget ?? 60);
                                  setSessionVariant(
                                    usualBudget === null
                                      ? "full"
                                      : "time_budget"
                                  );
                                  setSessionDayIndex(idx);
                                }
                              : undefined
                        }
                      />

                      {usualPlan && !selectedWorkout.completed && !missed && (
                        <p className="px-3 text-xs text-muted-foreground leading-relaxed">
                          Start uses your usual session time.{" "}
                          {usualPlan.trim.droppedExercises.length > 0 ||
                          usualPlan.trim.reducedSets.length > 0
                            ? "Some accessories or sets are trimmed; the full programme stays below."
                            : usualPlan.estimatedMinutes > usualBudget!
                              ? "Your main lifts stay in place."
                              : "This session already fits."}
                          {usualPlan.estimatedMinutes > usualBudget!
                            ? " The main lifts still take longer than your available time."
                            : ""}
                        </p>
                      )}

                      {/* The reason sits behind a tap, as "Why this run"
                          does on the Run tab, and on the same days: one
                          still to train this week. */}
                      {(status === "today" || status === "upcoming") && (
                        <LiftPurpose
                          programme={programState}
                          day={selectedWorkout}
                          date={localDateString()}
                          experience={profile?.experience}
                          className="px-3"
                        />
                      )}

                      {/* PROGRAM-ADAPT-01, post-de-interception home: the
                          recommendation is VISIBLE before any tap, instead of
                          hiding inside an interstitial everyone paid for.
                          Rendered only when a real signal fired; tapping
                          starts the reduced session directly — the row names
                          exactly what it does. */}
                      {/* Held back while a week-level notice shows: it is
                          offered on the same high-load signal that
                          recommends a deload, so the two said one thing
                          twice (`programNotices`). */}
                      {liftAdvice === "easier" &&
                        easierRecommendation?.recommended && (
                          <button
                            type="button"
                            onClick={() => {
                              haptic("light");
                              setSessionVariant("easier_today");
                              setSessionDayIndex(idx);
                            }}
                            className="w-full min-h-[44px] p-3 rounded-xl bg-muted text-left active:scale-[0.97] transition-transform"
                          >
                            <p className="text-sm font-semibold text-foreground">
                              Go easier today ·{" "}
                              {summarizeEasier(
                                buildEasierSession(selectedWorkout, restContext)
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Recommended — {easierRecommendation.reason}
                            </p>
                          </button>
                        )}

                      {/* The day's exercises, on screen rather than behind a tap.
                          The list IS the page: a card that states the session
                          above a control that hides it says one thing twice, and
                          the per-row Replace / Remove / Move menu lives nowhere
                          else — `DayActionSheet` is day-scoped and offers none of
                          the three. "Reorder exercises" is a page-header action,
                          so it needs rows on screen the moment it is tapped. */}
                      <div className="space-y-2">
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
                                {selectedWorkout.exercises.map((ex, i) => (
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
                                      <ExerciseRowSummary
                                        exercise={ex}
                                        lastSets={lastSetsMap.get(
                                          ex.exerciseId
                                        )}
                                        thumbSize="sm"
                                      />
                                    </div>
                                  </SortableExerciseRow>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        ) : (
                          /* One card, one row per exercise, each with its
                             drawing (DS3). A row still opens the exercise's
                             Form tab, still swipes and long-presses to its
                             manage menu, and still has the "…" that opens
                             that menu visibly. */
                          <div className="rounded-2xl bg-card card-shadow overflow-hidden divide-y divide-border">
                            {selectedWorkout.exercises.map((ex, i) => (
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
                                  {/* Owner request 2026-09-02: removing an
                                    exercise was reachable only by swipe or
                                    long-press. The "…" opens the same
                                    manage menu (Replace / Remove / Move)
                                    visibly; swipe and long-press stay. */}
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        navigate(
                                          `/history/exercise/${encodeURIComponent(ex.name)}`,
                                          { state: { initialTab: "form" } }
                                        )
                                      }
                                      className="flex-1 min-w-0 flex items-center p-3 text-left transition-colors active:bg-muted"
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
                                      <ExerciseRowSummary
                                        exercise={ex}
                                        lastSets={lastSetsMap.get(
                                          ex.exerciseId
                                        )}
                                        showNotes
                                      />
                                    </button>
                                    <IconButton
                                      aria-label={`More options for ${ex.name}`}
                                      icon={
                                        <MoreHorizontal className="size-5" />
                                      }
                                      variant="ghost"
                                      size="md"
                                      className="mr-1 text-muted-foreground"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const r = (
                                          e.currentTarget as HTMLElement
                                        ).getBoundingClientRect();
                                        setContextMenu({
                                          dayIndex: idx,
                                          exIndex: i,
                                          x: r.left + r.width / 2,
                                          y: r.bottom + 4,
                                        });
                                      }}
                                    />
                                  </div>
                                </SortableExerciseRow>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── + Add exercise (only on a day still to do) ── */}
                        {(status === "today" || status === "upcoming") && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddPickerDayIndex(idx);
                              setShowAddPicker(true);
                            }}
                            className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2 bg-card rounded-xl text-lifting-strong font-medium text-sm"
                          >
                            <Plus className="size-4" /> Add exercise
                          </button>
                        )}
                      </div>

                      {/* Session modifiers, BELOW the list rather than
                          between it and the card.

                          Both are judgements about work you have to have
                          seen: "short on time?" against five exercises and
                          an estimate, "skip session" against what skipping
                          costs. Asking above the list asks blind, and it
                          put two secondary links between the card that
                          states the session and the rows that ARE it.

                          Offered on the cursor day AND any upcoming day of
                          the CURRENT week (owner request: skipping the
                          remaining days is the deliberate, per-day path to
                          the Advance button). History weeks are records,
                          not prescriptions. */}
                      {(status === "today" || status === "upcoming") &&
                        !isViewingHistory && (
                          <div className="flex items-center justify-center">
                            {/* The chooser's new home (2026-08-05): the
                                time-budget / easier / lighter-day menu is a
                                menu you ASK for, not an interception. Only on
                                the startable day — express variants execute
                                today's session. */}
                            {status === "today" &&
                              !selectedWorkout.completed && (
                                /* Was a hand-rolled button in
                                   text-muted-foreground with NO focus
                                   styling: it read as disabled, and a
                                   keyboard user got no focus indicator at
                                   all. `ghost` is the guide's variant for
                                   a low-emphasis action, and md is the
                                   same geometry these already had
                                   (min-h-44 / px-4 / text-sm), so this is
                                   a drop-in that buys foreground contrast,
                                   a hover tint and the focus-visible ring.
                                   Transparent background keeps it from
                                   competing with the filled Begin
                                   Workout CTA above. */
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    haptic("light");
                                    setExpressChooserDay(idx);
                                  }}
                                >
                                  Short on time?
                                </Button>
                              )}
                            {/* Ghost, like its neighbour, and a Button
                                rather than a hand-rolled one: a
                                muted-foreground span reads as disabled
                                and gives a keyboard user no focus ring.
                                "Make this next" is not in this row — it
                                takes the card's own action slot. */}
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setSkipTargetDay(idx);
                                setShowSkipConfirm(true);
                              }}
                            >
                              Skip session
                            </Button>

                            {status === "today" &&
                              programState?.nextWorkoutOverride === idx && (
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    haptic("light");
                                    void setNextWorkout(null);
                                  }}
                                >
                                  Follow programme order
                                </Button>
                              )}
                          </div>
                        )}

                      {/* ── Completed Session Summary ── */}
                      {status === "completed" && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {completedWorkoutId
                              ? "Your recorded sets and actual totals are ready to view."
                              : "This programme day is complete. Find your recorded session in History."}
                          </p>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(
                                completedWorkoutId
                                  ? `/workout/${completedWorkoutId}`
                                  : "/history?view=lifting"
                              )
                            }
                          >
                            {completedWorkoutId
                              ? "View this workout"
                              : "View workout history"}
                          </Button>
                        </div>
                      )}
                      {/* Programme planning follows the current workout. */}
                      {profile?.uid && programState && (
                        <TrainingBlockCard
                          uid={profile.uid}
                          block={programState.trainingBlock}
                          currentFocus={programState.primaryGoal ?? "general"}
                          experience={profile?.experience}
                          liftDaysPerWeek={programState.workouts.length}
                          mainCompoundIds={blockAnchorIds}
                          trainingWhy={profile?.trainingWhy?.trim() ?? ""}
                          hasTrained={recentWorkouts.length > 0}
                          raceTaperActive={blockOfferBlockedByRace({
                            runMode: profile?.runMode,
                            raceDistance: profile?.raceGoal?.distance,
                            raceTargetDate: profile?.raceGoal?.targetDate,
                            today: localDateString(),
                          })}
                          onStart={startTrainingBlock}
                          onAdoptLegacy={adoptLegacyTrainingBlock}
                          onRelease={releaseTrainingBlock}
                          onKeepFocus={keepTrainingBlockFocus}
                          hideRunningRow
                          detailOpen={blockDetailOpen}
                          onDetailOpenChange={setBlockDetailOpen}
                        />
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
      {/* The weekly sets-per-muscle table moved to Settings › Lift plan
          (D-LIFT-1 lives on, in a new home). Collapsed, it said "4 muscles
          below target" — a count of problems, not a finding, two screens
          away from the fields that fix it. Expanded it is a plan-quality
          readout, and the lift editor is where the days it rates are
          edited. */}
      {activeTab === "lift" && <SavedRoutinesSection />}

      {/* ROUTINE-EXCHANGE-01 — curated blueprint shelf. Read-only
          intents; saving creates a private routine copy, never a
          programme change. */}

      {/* The "Edit lift plan ›" footnote is gone — 10 px muted text under
          a hairline, a third edit entry beside the two already in ⋯. On
          the Lift tab that menu's edit row now points at the lift editor
          itself, which is also where the volume table went. */}

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
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-destructive-strong hover:bg-muted transition-colors border-b border-border/30"
              >
                <Trash2 className="size-4" /> Remove exercise
              </button>
              <button
                type="button"
                onClick={() => {
                  moveExercise(contextMenu.dayIndex, contextMenu.exIndex, -1);
                }}
                disabled={contextMenu.exIndex === 0}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30 disabled:opacity-30"
              >
                <ArrowUp className="size-4 text-muted-foreground" /> Move up
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
                <ArrowDown className="size-4 text-muted-foreground" /> Move down
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
            const outcome = await skipWorkoutDay(skipTargetDay);
            // A refused skip has been said by the writer, and the day is
            // still the one to look at.
            if (changeStands(outcome)) {
              haptic("medium");
              // On to the session that is up next now.
              const nextUp = nextUpIndex(programState, skipTargetDay);
              if (nextUp >= 0) {
                handleSelect(nextUp);
              }
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

      {/* Pre-session chooser (PROGRAM-FLEX-01 + PROGRAM-ADAPT-01) */}
      <ExpressSessionSheet
        timeBudgetMinutes={usualBudget}
        rest={restContext}
        open={expressChooserDay !== null}
        day={
          expressChooserDay !== null
            ? (programState.workouts[expressChooserDay] ?? null)
            : null
        }
        easierRecommendation={easierRecommendation}
        lighterDay={
          expressChooserDay !== null
            ? pickLighterDay(
                programState.workouts,
                expressChooserDay,
                restContext
              )
            : null
        }
        blockPrefersShorter={blockPrefersShorterSessions(
          programState.trainingBlock
        )}
        onSwapToDay={(index) => {
          setExpressChooserDay(null);
          setSessionVariant("full");
          setSessionDayIndex(index);
        }}
        onClose={() => setExpressChooserDay(null)}
        onStart={(variant) => {
          const idx = expressChooserDay;
          setExpressChooserDay(null);
          if (idx === null) return;
          setSessionBudgetMinutes(usualBudget ?? 60);
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
          // (or vice versa). The session logs and saves the TRIMMED
          // list; progression finds each exercise's row in the STORED
          // day by instanceId (`progressionBaseline` below, then
          // `applySessionProgression`), so a dropped accessory can't
          // shift progression onto the wrong lift.
          const storedDay = programState.workouts[sessionDayIndex];
          // Easier today (PROGRAM-ADAPT-01) is the same execution-clone
          // contract as Express: a reduced COPY runs; the stored day is
          // untouched, and nothing is dropped.
          const plan =
            sessionVariant === "full"
              ? null
              : sessionVariant === "easier_today"
                ? buildEasierSession(storedDay, restContext)
                : sessionVariant === "time_budget"
                  ? buildTimeBudgetSession(
                      storedDay,
                      sessionBudgetMinutes,
                      restContext
                    )
                  : buildExpressSession(storedDay, sessionVariant, restContext);
          return (
            <WorkoutSession
              deloadWeek={programState.currentPhase === "deload"}
              sessionMinutes={programState.sessionMinutes}
              day={
                plan ? { ...storedDay, exercises: plan.exercises } : storedDay
              }
              dayIndex={sessionDayIndex}
              planContext={liftCompletionContext(
                programState,
                sessionDayIndex,
                localDateString(),
                profile?.experience
              )}
              draftEpoch={programState.weekNumber}
              // Variant-scoped draft namespace (PROGRAM-ADAPT-01
              // follow-up): the draft identity fingerprints the
              // exercise LAYOUT (ids × sets) but not loads, so an
              // easier clone whose set-floors all bind would share an
              // identity with the full session and a mid-session kill
              // could restore its logs into the other variant —
              // completing under the wrong sessionVariant label.
              // Scoping by variant makes restore deterministic: an
              // easier draft only ever resumes an easier session.
              draftScope={draftScopeForVariant(sessionVariant)}
              sessionVariant={
                plan
                  ? (plan.variant as Exclude<SessionVariant, "full">)
                  : undefined
              }
              progressionBaseline={storedDay.exercises}
              firstWorkout={!workoutsLoading && recentWorkouts.length === 0}
              programmeContext={{
                weekNumber: programState.weekNumber,
                dayIndex: sessionDayIndex,
                dayIdentity: workoutCompletionDayIdentity(storedDay) ?? "",
                trainingBlockId: programState.trainingBlock?.id,
              }}
              onCompleteDay={completeWithViewToast}
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
        headerTitle="Add exercise"
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
                {/* Reorder exercises — enters the drag-to-reorder mode for
                    today's lift session. Moved here from a permanent header
                    icon: it's a low-frequency plan edit, so it lives with the
                    other edit actions instead of occupying header space. Only
                    offered where it works — Lift tab with logged workouts. */}
                {/* Managing a RUNNING block, which no longer has a row of
                    its own on the page. Only while one is running: the
                    card still renders "Start a training block" when there
                    is none and "Block complete" when one has finished,
                    because those two say something the page does not. */}
                {activeTab === "lift" && programState?.trainingBlock && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverflow(false);
                      setBlockDetailOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                    style={{ minHeight: 44 }}
                  >
                    <CalendarRange className="size-5 text-muted-foreground" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        Training block
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {focusLabel(programState.trainingBlock.focus)}
                      </span>
                    </span>
                  </button>
                )}

                {activeTab === "lift" &&
                  (programState?.workouts?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflow(false);
                        setReorderMode(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                      style={{ minHeight: 44 }}
                    >
                      <ArrowUpDown className="size-5 text-muted-foreground" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          Reorder exercises
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Drag to change today&apos;s order
                        </span>
                      </span>
                    </button>
                  )}
                {/* A lighter week whenever the person wants one (Lift4 (9)):
                    half the sets this week, at the same weights, one at a
                    time and never two in a row. */}
                {activeTab === "lift" &&
                  !isViewingHistory &&
                  (programState?.workouts?.length ?? 0) > 0 &&
                  lighterWeekAllowed(programState) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflow(false);
                        void handleApplyDeload();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                      style={{ minHeight: 44 }}
                    >
                      <Feather className="size-5 text-muted-foreground" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          Take a lighter week
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Half the sets this week, at the same weights
                        </span>
                      </span>
                    </button>
                  )}
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
                    navigate(
                      activeTab === "lift"
                        ? "/settings/lift-plan"
                        : "/settings/training"
                    );
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-muted transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <Settings2 className="size-5 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {activeTab === "lift"
                        ? "Edit lift plan"
                        : "Edit programme"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {activeTab === "lift"
                        ? "Focus, lift days, equipment, injuries, weekly volume"
                        : "Goal, nutrition, lifting, running, equipment, injuries"}
                    </span>
                  </span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
