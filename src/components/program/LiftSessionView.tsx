import { buildTimeBudgetSession } from "@/features/program/liftTimeBudget";
import { liftInProgress } from "@/lib/sessionsInFlight";
import InProgressStrip from "@/components/session/InProgressStrip";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useLongPress } from "@/hooks/useLongPress";
import { useBackDismiss } from "@/lib/backDismiss";
import { useNavigate } from "react-router-dom";
import {
  LIFT_DAY_STATUS_LABEL,
  liftDayStatus,
} from "@/features/program/liftDayStatus";
import { changeStands } from "@/features/program/programOutcome";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  generatedDayType,
  liftDayNameIn,
  liftDayTitle,
  liftWeekDayNames,
} from "@/lib/liftDayLabel";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import LiftPurpose from "@/components/program/LiftPurpose";
import OutgrownDayNotice from "@/components/program/OutgrownDayNotice";
import { hasOutgrown, outgrownDayKey } from "@/features/program/outgrownDay";
import { isLongDayKept, keepLongDay } from "@/lib/keptLongDays";
import { readJson, scopedKey, writeJson } from "@/lib/localStore";
import { pickLiftAdvice } from "@/lib/programNotices";
import ExerciseRowSummary from "@/components/program/ExerciseRowSummary";
import PlateauCoachingNotice from "@/components/program/PlateauCoachingNotice";
import SupersetBlock from "@/components/program/SupersetBlock";
import { pairRuns } from "@/features/program/pairSlot";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import ExerciseFormSheet from "@/components/program/ExerciseFormSheet";
import { formArtCutoutUrl, sessionLeadArt } from "@/lib/formArtCutouts";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import { aboutMinutes, liftHeroLine } from "@/lib/homeHero";
import { resolveLiftUnit } from "@/lib/liftLoad";
import SkipConfirmSheet from "@/components/program/SkipConfirmSheet";
import { estimateSessionMinutes } from "@/features/program/expressSession";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "@/features/program/programTypes";
import {
  buildEasierSession,
  summarizeEasier,
} from "@/features/program/easierToday";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import {
  MoreHorizontal,
  Plus,
  ArrowUp,
  ArrowDown,
  Repeat,
  Trash2,
} from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import type { Exercise } from "@/lib/exercises";
import type { Workout } from "@/lib/savedWorkouts";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
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
import { lastSetsBySlot } from "@/features/program/lastSets";
import type { LiftSession } from "@/features/program/useLiftSession";
import type { ProgramEngine } from "@/features/program/useProgramEngine";

/** What a lift session changes in the plan, from the programme engine. */
export type LiftSessionProgram = Pick<
  ProgramEngine,
  | "readiness"
  | "recentLayoff"
  | "recentRuns"
  | "setNextWorkout"
  | "skipWorkoutDay"
  | "reorderDayExercises"
  | "removeExerciseFromDay"
  | "addExercisesToDayCmd"
  | "replaceExerciseInDay"
  | "restoreRemovedExercise"
>;

interface LiftSessionViewProps {
  programState: ProgramState;
  program: LiftSessionProgram;
  /** Starting the session (`useLiftSession`), shared with the chooser and
   *  the workout screen the screen draws over itself. */
  session: LiftSession;
  /** The day's place in the week shown (Train's `?day=`). */
  dayIndex: number;
  /** The week shown: this week's days, or a past week's on Train. */
  workouts: WorkoutDay[];
  weekNumber: number;
  /** A past week: its days are records, not prescriptions. */
  viewingHistory?: boolean;
  /** The saved workouts read for the screen (`useWorkouts`): each row's
   *  last sets, and the record a finished day opens. */
  recentWorkouts: Workout[];
  /** The rows drag to a new order (Train's ⋯ and the page's header turn it
   *  on, and their Done off). */
  reorderMode: boolean;
  /** The side the day was reached from on Train's day pager: it comes in
   *  16 px from there. 0 draws it settled. */
  direction?: number;
  /** Train's week notices, between the day's card and its exercises, as
   *  Home's banners sit under its hero. */
  between?: ReactNode;
  /** Train's training block card, after the day's exercises. */
  after?: ReactNode;
  /** A week-level notice shows above: the day's own advice waits
   *  (`programNotices`). */
  weekAdvice?: boolean;
  /** After a skip, the session up next now. */
  onSkipped?: (nextUp: number) => void;
  /** Train's day pager on the day's column: its swipe edges and touch
   *  handlers. */
  pagerProps?: ComponentPropsWithoutRef<"div"> & {
    [data: `data-${string}`]: unknown;
  };
}

/**
 * A lift session as a person looks it over and changes it (TrainWk1 call
 * 2): the day's card with its one action, why it is in the week, the
 * exercises (replace, add, remove, reorder), Short on time, Skip, and the
 * finished day's record. Train's Lift tab draws it under the day strip,
 * and a lift's own page (`/program/lift/:day`) draws it alone.
 */
export default function LiftSessionView({
  programState,
  program,
  session,
  dayIndex: idx,
  workouts: displayWorkouts,
  weekNumber: displayWeekNumber,
  viewingHistory: isViewingHistory = false,
  recentWorkouts,
  reorderMode,
  direction = 0,
  between,
  after,
  weekAdvice = false,
  onSkipped,
  pagerProps,
}: LiftSessionViewProps) {
  const navigate = useNavigate();
  const motionSafe = useMotionSafe();
  const {
    readiness,
    recentLayoff,
    recentRuns,
    setNextWorkout,
    skipWorkoutDay,
    reorderDayExercises,
    removeExerciseFromDay,
    addExercisesToDayCmd,
    replaceExerciseInDay,
    restoreRemovedExercise,
  } = program;
  const { user, profile, refreshProfile } = useAuth();
  // Today, from the shared day key: it moves at midnight and when the app
  // comes back, so a screen left open overnight names the new day.
  const todayKey = useLocalDateKey();
  const {
    todayIndex,
    easierRecommendation,
    sessionContext,
    usualBudget,
    planLifts,
    resumable,
  } = session;

  // Every counted set from the last session each lift of the plan ran in
  // its slot, for the rows' "Last:" line (`lastSetsBySlot`). The workout
  // screen and the session card's line read the same, as Home's hero does.
  const lastSetsOf = useMemo(
    () => lastSetsBySlot(recentWorkouts, planLifts),
    [recentWorkouts, planLifts]
  );

  // A long day kept on this visit ("Keep this day"), so the notice goes at
  // once; the device keeps it after (`keptLongDays`).
  const [keptDay, setKeptDay] = useState<string | null>(null);
  const [rebuildingDays, setRebuildingDays] = useState(false);

  const plateauStoreKey = user?.uid
    ? scopedKey("tropos-plateau-dismissed", user.uid)
    : null;
  const [dismissedByStore, setDismissedByStore] = useState<
    Record<string, string[]>
  >({});
  const dismissedPlateaus = useMemo(() => {
    if (!plateauStoreKey) return [];
    return (
      dismissedByStore[plateauStoreKey] ??
      readJson<string[]>(plateauStoreKey, [])
    );
  }, [dismissedByStore, plateauStoreKey]);
  const dismissPlateau = (key: string) => {
    if (!plateauStoreKey) return;
    setDismissedByStore((prev) => {
      const current =
        prev[plateauStoreKey] ?? readJson<string[]>(plateauStoreKey, []);
      if (current.includes(key)) return prev;
      const next = [...current, key].slice(-40);
      writeJson(plateauStoreKey, next);
      return { ...prev, [plateauStoreKey]: next };
    });
  };

  // Skip confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipTargetDay, setSkipTargetDay] = useState<number | null>(null);

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
  /* The exercise whose form guide a row's drawing opened. The name stays
     while the sheet closes, so its title does not blank on the way out. */
  const [formGuide, setFormGuide] = useState<{
    name: string;
    open: boolean;
  }>({ name: "", open: false });

  /* An exercise's menu: focus moves in and stays there, Escape and the
     device's Back close it, and focus goes back to the button that opened
     it (DESIGN_GUIDE §10). */
  const contextMenuRef = useFocusTrap<HTMLDivElement>(contextMenu !== null);
  useBackDismiss(contextMenu !== null, () => setContextMenu(null));
  useEffect(() => {
    if (contextMenu === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setContextMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contextMenu]);
  const [replaceTarget, setReplaceTarget] = useState<{
    dayIndex: number;
    exIndex: number;
  } | null>(null);
  // The drop's green flash, cleared if the page goes before it ends.
  const dropFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (dropFlashTimer.current) clearTimeout(dropFlashTimer.current);
    },
    []
  );

  // Exercise management helpers — accept dayIdx to work on any day (auto-save to Firestore)
  const removeExFromDay = async (dayIdx: number, exIndex: number) => {
    const removed = programState.workouts[dayIdx]?.exercises[exIndex];
    if (!removed?.instanceId) return;
    if (!(await removeExerciseFromDay(dayIdx, removed.instanceId))) return;
    // Exercise delete is destructive; offer an undo (parity with set-undo in
    // the workout session).
    //
    // P6: the undo is a SERVER command, not a client re-insert: a
    // client-supplied exercise is exactly what the command boundary's
    // validator refuses. The reducer soft-deletes instead, stashing the
    // original verbatim, so `restoreExercise` returns the same lift with its
    // history and load rather than a catalog rebuild of it.
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
    const old = programState.workouts[dayIdx].exercises[exIndex];
    if (!old?.instanceId) return false;
    // P6: through the boundary. The identity work — carry the role-level
    // prescription, re-infer the category, mint a new instance, reset a
    // reps<->seconds transition — lives in `replaceExerciseInDay` and in the
    // server reducer that is its authority.
    //
    // The one thing that could NOT simply move is the load: the reducer has no
    // profile, so it hard-coded 0. The calibrated weight is computed
    // client-side and sent as a bounded scalar; see the reducer's note.
    return replaceExerciseInDay(dayIdx, old.instanceId, newEx.id);
  };

  const addExercisesToDay = async (dayIdx: number, exercises: Exercise[]) => {
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
    return addExercisesToDayCmd(
      dayIdx,
      exercises.map((e) => e.id)
    );
  };

  /* An exercise row's long press opens its menu. A finger's tremor does
     not cancel it, and the tap iOS sends as the finger lifts does not
     also open the exercise's history under the menu. */
  const exercisePress = useLongPress<{ dayIndex: number; exIndex: number }>(
    (row, at) => {
      haptic("medium");
      setContextMenu({ ...row, ...at });
    }
  );

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
    if (!over || active.id === over.id) return;

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
    if (dropFlashTimer.current) clearTimeout(dropFlashTimer.current);
    dropFlashTimer.current = setTimeout(() => setJustDroppedId(null), 300);

    // P6: through the command boundary, not `saveProgram`. The reorder applies
    // optimistically first, so the drop still settles immediately; the server
    // is the authority for what actually persists.
    await reorderDayExercises(
      dayIndex,
      reordered.map((ex) => ex.instanceId ?? "")
    );
  };

  const selectedWorkout: WorkoutDay | undefined = displayWorkouts[idx];
  /* The week's days as the screen names them (Lift19): Push A … Legs B on
     a 6-day week. The stored names stay the engine's keys. */
  const weekDayNames = liftWeekDayNames(displayWorkouts.map((w) => w.dayName));
  const isSelectedToday = !isViewingHistory && idx === todayIndex;
  // Older saves have no explicit link. Only a unique current-week match is
  // safe; historical/ambiguous records retain the History fallback.
  const legacySavedMatches =
    !isViewingHistory && selectedWorkout
      ? recentWorkouts.filter(
          (workout) =>
            workout.date >= localWeekKey(parseLocalDate(todayKey)) &&
            workout.date <= todayKey &&
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

  // Session metadata. Every estimate here prices the rests the session's
  // timer will run (`restSecondsFor`): the person's fixed rest, or the
  // plan's, shorter in a plan built for 30 minutes.
  const restContext = sessionContext.rest;
  // The workout under way on this phone, on its own day's card.
  const liftStripOnCard =
    resumable !== null && !isViewingHistory && resumable.dayIndex === idx;
  const liftStrip = resumable
    ? liftInProgress(
        resumable,
        liftDayNameIn(
          programState.workouts.map((w) => w.dayName),
          resumable.dayIndex,
          programState.workouts[resumable.dayIndex].dayName
        )
      )
    : null;
  const usualPlan =
    selectedWorkout && usualBudget !== null
      ? buildTimeBudgetSession(selectedWorkout, usualBudget, restContext)
      : null;
  // One estimate, the chooser sheet's: a second copy of a shared rule is
  // the drift this repo keeps paying for.
  const estimatedMinutes =
    usualPlan?.estimatedMinutes ??
    estimateSessionMinutes(selectedWorkout?.exercises ?? [], restContext);
  // A day still to train that runs well past the length its plan is fitted
  // to (slice 4): said under the day's card, with the rebuild one tap away,
  // unless the person chose to keep this day as it is. A plan from before
  // plans were fitted to a length trims at Start instead (`usualPlan`).
  const fittedLength = programState?.sessionMinutes;
  const outgrownKey =
    selectedWorkout && fittedLength !== undefined
      ? outgrownDayKey(selectedWorkout, fittedLength)
      : null;
  const showOutgrown =
    outgrownKey !== null &&
    fittedLength !== undefined &&
    (status === "today" || status === "upcoming") &&
    hasOutgrown(estimatedMinutes, fittedLength) &&
    !isLongDayKept(user?.uid, outgrownKey) &&
    keptDay !== outgrownKey;

  /** "Rebuild for N min": the lift days built again for the length, saved
   *  through configurePlan as the lift plan editor saves, then the profile
   *  read back so Train shows the new days. Not before the programme has
   *  loaded, as the editor waits. The builder loads with the tap. */
  async function rebuildForLength(length: number) {
    if (rebuildingDays || readiness !== "ready") return;
    if (!profile || !programState) return;
    setRebuildingDays(true);
    try {
      const { rebuildLiftDaysFor } =
        await import("@/features/program/liftPlanRebuild");
      await rebuildLiftDaysFor(length, {
        profile,
        programState,
        recentLayoff,
        recentRuns,
      });
      try {
        await refreshProfile();
      } catch (refreshErr) {
        // Saved on the server already: say so and reload, as the editor
        // does, rather than invite a second rebuild.
        logger.warn("[Program] rebuilt but profile refresh failed", refreshErr);
        toast.success(`Lift days rebuilt for ${String(length)} min`);
        window.location.reload();
        return;
      }
      toast.success(`Lift days rebuilt for ${String(length)} min`);
    } catch (err) {
      logger.error("[Program] rebuild for length failed:", err);
      const { planSaveRejection } =
        await import("@/features/program/liftPlanRebuild");
      const rejection = planSaveRejection(
        err,
        "Your plan changed. Check it and try again."
      );
      if (rejection.refresh) {
        await refreshProfile().catch((error) =>
          logger.warn("Plan refresh failed", error)
        );
      }
      toast.error(rejection.message);
    } finally {
      setRebuildingDays(false);
    }
  }

  /* The session card's words and picture (DS3). A generated day is titled
     with its name in the week ("Pull B", Lift19) under the day's status. A
     name the person gave it splits at its dash, the category joining the
     status in the eyebrow, since set whole it broke at the dash on a
     phone. The picture is the day's main lift in its drawing, the one
     Home's Today card shows, and opens that lift's form guide; a day with
     no drawn lift falls back to the muscles it works. */
  const sessionTitle =
    selectedWorkout && generatedDayType(selectedWorkout.dayName)
      ? { category: null, title: weekDayNames[idx] }
      : liftDayTitle(selectedWorkout?.dayName ?? "");
  /* Which lift the day opens with, for the line under its name: the main
     lift, unless the person has moved another to the top. */
  const sessionFirstLift = selectedWorkout?.exercises[0]?.name;
  const sessionStatusLabel = LIFT_DAY_STATUS_LABEL[status];
  const sessionArt = sessionLeadArt(selectedWorkout?.exercises ?? []);
  const sessionMuscleCategories = (selectedWorkout?.exercises ?? []).map(
    (ex) => ex.movementCategory
  );

  /* DS3: one advice notice at a time (`programNotices`): the week's
     lighter-week offer, when Train shows it above, before today's lighter
     session. */
  const liftAdvice = pickLiftAdvice({
    deload: weekAdvice,
    easier:
      status === "today" &&
      !!selectedWorkout &&
      !selectedWorkout.completed &&
      !!easierRecommendation?.recommended,
  });

  // The session card's line, Home's (`liftHeroLine`), for a day still to
  // train; a done or missed day is its record, not a prescription. Last
  // time is the one the rows below list (`lastSetsOf`).
  const sessionLine =
    selectedWorkout && status !== "completed" && !missed
      ? liftHeroLine(
          selectedWorkout.exercises,
          resolveLiftUnit(profile?.liftingWeightUnit),
          lastSetsOf
        )
      : null;

  /* A new day comes in 16 px from the side it was reached from, over
     180 ms; the old day goes at once, as a setup step does, so a tap never
     waits on an exit. Not on the first paint (direction 0): the day opens
     settled. DESIGN_GUIDE §14h. */
  const dayEntrance = {
    initial:
      direction === 0 ? false : motionSafe({ opacity: 0, x: direction * 16 }),
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const },
  };

  return (
    <>
      <div className="space-y-3" {...pagerProps}>
        <m.div key={idx} {...dayEntrance}>
          {selectedWorkout && (
            <div className="space-y-3">
              {/* ── Session hero — shared command-card chrome
                    (SessionCommandCard sport="lift"), mirroring the Run
                    tab so both sports get the same "what's next" moment.
                    Cursor-aware eyebrow; the primary "Start workout" CTA
                    renders only on the startable cursor session
                    (terminal/upcoming days show status, no button). The
                    editable exercise list stays its own body below. */}
              <SessionCommandCard
                sport="lift"
                eyebrow={[sessionTitle.category, sessionStatusLabel]
                  .filter(Boolean)
                  .join(" · ")}
                title={sessionTitle.title}
                figure={
                  sessionArt ? (
                    <img
                      src={formArtCutoutUrl(sessionArt.cutout)}
                      alt=""
                      draggable={false}
                      decoding="async"
                      data-session-art={sessionArt.exerciseName}
                      className="h-24 w-28 object-contain object-right @max-[19em]:h-20 @max-[19em]:w-20"
                    />
                  ) : hasMuscleFigure(sessionMuscleCategories) ? (
                    <MiniMuscleFigure
                      categories={sessionMuscleCategories}
                      className="h-24 w-auto"
                    />
                  ) : undefined
                }
                onFigurePress={
                  sessionArt
                    ? () => {
                        haptic("light");
                        setFormGuide({
                          name: sessionArt.exerciseName,
                          open: true,
                        });
                      }
                    : undefined
                }
                figureLabel={
                  sessionArt
                    ? `How to do ${sessionArt.exerciseName}`
                    : undefined
                }
                /* Home's numbers line for the same session: the main
                   lift's weight and reps against last time, or a first
                   session's step (DS4). The first lift is the list's first
                   row, and the line is the reading Home gives. A day
                   without the line (no exercises) still names its first
                   lift. */
                line={sessionLine}
                description={
                  !sessionLine &&
                  sessionFirstLift &&
                  status !== "completed" &&
                  !missed
                    ? `Starts with ${sessionFirstLift}`
                    : undefined
                }
                meta={
                  status === "completed" || missed
                    ? []
                    : [aboutMinutes(estimatedMinutes)]
                }
                /* The card always carries the day's ONE action. Start on
                   the startable day; on an upcoming one "Make this next"
                   IS the action (you cannot start it), so it takes the
                   slot rather than floating in a row beneath. A completed
                   or skipped day has no action and the slot stays empty.
                   History weeks are records, not prescriptions — the same
                   gate the row used. */
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
                action={
                  liftStripOnCard && liftStrip && resumable ? (
                    <InProgressStrip
                      session={liftStrip}
                      onCard
                      onResume={() => session.resume(resumable)}
                    />
                  ) : undefined
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
                          // Begin means begin (operator call: the every-tap
                          // chooser was "too much choice"). Hevy / Strong /
                          // Fitbod all start on tap — the CLAUDE.md
                          // reference bar for surfacing an interstitial
                          // isn't met. The honest versions stay one tap
                          // away: the "Short on time?" link opens the
                          // chooser, and a signal-backed easier day
                          // surfaces as its own row below, so
                          // PROGRAM-ADAPT-01's never-auto-applied offer
                          // survives without taxing every session start.
                          session.start(idx);
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

              {/* The reason sits behind a tap, as "Why this run" does on
                  the Run tab, and on the same days: one still to train
                  this week. */}
              {/* Gives way to the week-level notice, as the level
                  suggestion does (`programNotices`): one notice under the
                  day at a time. */}
              {showOutgrown &&
                fittedLength !== undefined &&
                liftAdvice !== "deload" && (
                  <div className="px-3">
                    <OutgrownDayNotice
                      dayName={weekDayNames[idx] ?? selectedWorkout.dayName}
                      minutes={estimatedMinutes}
                      length={fittedLength}
                      rebuilding={rebuildingDays}
                      onRebuild={() => void rebuildForLength(fittedLength)}
                      onKeep={() => {
                        haptic("light");
                        keepLongDay(user?.uid, outgrownKey);
                        setKeptDay(outgrownKey);
                      }}
                    />
                  </div>
                )}
              {(status === "today" || status === "upcoming") && (
                <LiftPurpose
                  programme={programState}
                  day={selectedWorkout}
                  date={todayKey}
                  experience={profile?.experience}
                  className="px-3"
                />
              )}
            </div>
          )}
        </m.div>
        {/* Train's week notices sit under the day's session, as Home's
            banners sit under its hero (DS4, §14m rule 1: the session's top
            within 260pt). Outside the day's animation, so they hold still
            while the days are swiped, and are counted once. */}
        {between}
        <m.div key={idx} {...dayEntrance}>
          {selectedWorkout && (
            <div className="space-y-3">
              {/* PROGRAM-ADAPT-01, post-de-interception home: the
                  recommendation is VISIBLE before any tap, instead of
                  hiding inside an interstitial everyone paid for.
                  Rendered only when a real signal fired; tapping starts
                  the reduced session directly — the row names exactly
                  what it does. */}
              {/* Held back while a week-level notice shows: it is offered
                  on the same high-load signal that recommends a deload, so
                  the two said one thing twice (`programNotices`). */}
              {liftAdvice === "easier" && easierRecommendation?.recommended && (
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    session.startEasier(idx);
                  }}
                  className="w-full min-h-[44px] p-3 rounded-xl bg-muted text-left active:scale-[0.97] transition-transform chip-edge"
                >
                  <p className="text-sm font-semibold text-foreground">
                    Go easier today ·{" "}
                    {summarizeEasier(
                      buildEasierSession(selectedWorkout, restContext, {
                        smallPlates:
                          programState.settings?.smallPlates === true,
                        loadUnit: programState.settings?.loadUnit,
                      })
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recommended: {easierRecommendation.reason}
                  </p>
                </button>
              )}

              {/* The day's exercises, on screen rather than behind a tap.
                  The list IS the page: a card that states the session
                  above a control that hides it says one thing twice, and
                  the per-row Replace / Remove / Move menu lives nowhere
                  else — `DayActionSheet` is day-scoped and offers none of
                  the three. "Reorder exercises" is a header action, so it
                  needs rows on screen the moment it is tapped. */}
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
                            justDropped={justDroppedId === rowId(ex, idx, i)}
                            showHandle={true}
                          >
                            <div
                              data-swipe-card="true"
                              className="p-3 rounded-xl bg-card dark:card-shadow"
                            >
                              <ExerciseRowSummary
                                exercise={ex}
                                lastSets={lastSetsOf(ex)}
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
                     drawing (DS3). The drawing opens the exercise's form
                     guide over the list (owner: "click on these on the
                     left hand side to see form pics"). The rest of the
                     row still opens the exercise's page on its Form tab,
                     still swipes and long-presses to its manage menu, and
                     still has the "…" that opens that menu visibly. */
                  <div className="rounded-xl bg-card surface-flat overflow-hidden divide-y divide-border">
                    {pairRuns(selectedWorkout.exercises).map((run) => {
                      const row = (ex: ProgramExercise, i: number) => (
                        <div key={rowId(ex, idx, i)} data-swipe-card="true">
                          <SortableExerciseRow
                            id={rowId(ex, idx, i)}
                            label={ex.name}
                            showHandle={false}
                            onDelete={() => removeExFromDay(idx, i)}
                          >
                            {/* Removing an exercise was reachable only by
                              swipe or long-press (owner request). The "…"
                              opens the same manage menu (Replace / Remove
                              / Move) visibly; swipe and long-press stay. */}
                            <div className="@container/exrow flex items-center">
                              {/* Its own button, before the row's: a
                                button cannot hold another. It gives way
                                to the name where the summary's own
                                drawing did, at 10em of summary (14.5em of
                                row at the designed text size). */}
                              <button
                                type="button"
                                aria-label={`How to do ${ex.name}`}
                                onClick={() => {
                                  haptic("light");
                                  setFormGuide({
                                    name: ex.name,
                                    open: true,
                                  });
                                }}
                                className="flex shrink-0 items-center self-stretch pl-3 transition-opacity active:opacity-60 @max-[14.5em]/exrow:hidden"
                              >
                                <ExerciseThumb exerciseId={ex.exerciseId} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (exercisePress.swallowClick()) return;
                                  navigate(
                                    `/history/exercise/${encodeURIComponent(ex.name)}`,
                                    { state: { initialTab: "form" } }
                                  );
                                }}
                                className="flex-1 min-w-0 flex items-center p-3 text-left transition-colors active:bg-muted"
                                onTouchStart={(e) => {
                                  if (reorderMode) return;
                                  exercisePress.start(e, {
                                    dayIndex: idx,
                                    exIndex: i,
                                  });
                                }}
                                onTouchMove={exercisePress.move}
                                onTouchEnd={exercisePress.end}
                                onTouchCancel={exercisePress.end}
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
                                  lastSets={lastSetsOf(ex)}
                                  showNotes
                                  showThumb={false}
                                />
                              </button>
                              <IconButton
                                aria-label={`More options for ${ex.name}`}
                                aria-haspopup="menu"
                                aria-expanded={
                                  contextMenu?.dayIndex === idx &&
                                  contextMenu?.exIndex === i
                                }
                                icon={<MoreHorizontal className="size-5" />}
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
                          {!isViewingHistory &&
                            (ex.plateauCount ?? 0) >= 2 &&
                            !dismissedPlateaus.includes(
                              `${ex.exerciseId}:${ex.plateauCount}`
                            ) && (
                              <PlateauCoachingNotice
                                exerciseName={ex.name}
                                onSwap={() =>
                                  setReplaceTarget({
                                    dayIndex: idx,
                                    exIndex: i,
                                  })
                                }
                                onDismiss={() =>
                                  dismissPlateau(
                                    `${ex.exerciseId}:${ex.plateauCount}`
                                  )
                                }
                              />
                            )}
                        </div>
                      );
                      /* Lift22: a pair the plan wrote stands in its own
                         block, which says once what a superset is. */
                      return run.length === 2 ? (
                        <SupersetBlock key={rowId(run[0].ex, idx, run[0].i)}>
                          {run.map(({ ex, i }) => row(ex, i))}
                        </SupersetBlock>
                      ) : (
                        row(run[0].ex, run[0].i)
                      );
                    })}
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
                    className="w-full py-3 text-center active:scale-[0.97] transition-all flex items-center justify-center gap-2 bg-card rounded-xl text-foreground font-semibold text-sm dark:card-shadow"
                  >
                    <Plus className="size-4" /> Add exercise
                  </button>
                )}
              </div>

              {/* Session modifiers, BELOW the list rather than between it
                  and the card.

                  Both are judgements about work you have to have seen:
                  "short on time?" against five exercises and an estimate,
                  "skip session" against what skipping costs. Asking above
                  the list asks blind, and it put two secondary links
                  between the card that states the session and the rows
                  that ARE it.

                  Offered on the cursor day AND any upcoming day of the
                  CURRENT week (owner request: skipping the remaining days
                  is the deliberate, per-day path to the Advance button).
                  History weeks are records, not prescriptions. */}
              {(status === "today" || status === "upcoming") &&
                !isViewingHistory && (
                  <div className="flex items-center justify-center">
                    {/* The chooser is a menu you ASK for, not an
                        interception. Only on the startable day — express
                        variants execute today's session. */}
                    {status === "today" && !selectedWorkout.completed && (
                      /* `ghost` is the guide's variant for a
                         low-emphasis action: foreground contrast, a hover
                         tint and the focus-visible ring, with a
                         transparent background that does not compete
                         with the filled Start workout above. */
                      <Button
                        variant="ghost"
                        onClick={() => {
                          haptic("light");
                          session.openChooser(idx);
                        }}
                      >
                        Short on time?
                      </Button>
                    )}
                    {/* Ghost, like its neighbour, and a Button rather than
                        a hand-rolled one: a muted-foreground span reads as
                        disabled and gives a keyboard user no focus ring.
                        "Make this next" is not in this row — it takes the
                        card's own action slot. */}
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
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2 dark:card-shadow dark:border-transparent">
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
              {after}
            </div>
          )}
        </m.div>
      </div>

      {/* ── Context Menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <m.div
              initial={motionSafe({ opacity: 0 })}
              animate={{ opacity: 1 }}
              exit={motionSafe({ opacity: 0 })}
              className="fixed inset-0 z-[200]"
              onClick={() => setContextMenu(null)}
            />
            <m.div
              ref={contextMenuRef}
              role="menu"
              aria-label={`Options for ${
                displayWorkouts[contextMenu.dayIndex]?.exercises[
                  contextMenu.exIndex
                ]?.name ?? "exercise"
              }`}
              initial={motionSafe({ opacity: 0, scale: 0.95 })}
              animate={{ opacity: 1, scale: 1 }}
              exit={motionSafe({ opacity: 0, scale: 0.95 })}
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
                role="menuitem"
                onClick={() => {
                  setReplaceTarget({
                    dayIndex: contextMenu.dayIndex,
                    exIndex: contextMenu.exIndex,
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30"
              >
                <Repeat
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />{" "}
                Replace exercise
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  removeExFromDay(contextMenu.dayIndex, contextMenu.exIndex);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-destructive-strong hover:bg-muted transition-colors border-b border-border/30"
              >
                <Trash2 className="size-4" aria-hidden="true" /> Remove exercise
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  moveExercise(contextMenu.dayIndex, contextMenu.exIndex, -1);
                }}
                disabled={contextMenu.exIndex === 0}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted transition-colors border-b border-border/30 disabled:opacity-30"
              >
                <ArrowUp
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />{" "}
                Move up
              </button>
              <button
                type="button"
                role="menuitem"
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
                <ArrowDown
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />{" "}
                Move down
              </button>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {formGuide.name && (
        <ExerciseFormSheet
          exerciseName={formGuide.name}
          open={formGuide.open}
          onOpenChange={(open) => setFormGuide((g) => ({ ...g, open }))}
        />
      )}

      {/* Skip Confirmation Sheet */}
      <SkipConfirmSheet
        open={showSkipConfirm}
        /* The day as the card and the workout screen name it ("Pull B"),
           not its stored name, which the screen never shows. */
        sessionName={
          skipTargetDay !== null
            ? liftDayNameIn(
                displayWorkouts.map((w) => w.dayName),
                skipTargetDay,
                displayWorkouts[skipTargetDay]?.dayName ?? ""
              )
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
                onSkipped?.(nextUp);
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
          pickAction="Replace"
          currentExerciseId={
            programState.workouts[replaceTarget.dayIndex]?.exercises[
              replaceTarget.exIndex
            ]?.exerciseId
          }
          onSelect={(ex) =>
            replaceExercise(replaceTarget.dayIndex, replaceTarget.exIndex, ex)
          }
          onClose={() => setReplaceTarget(null)}
        />
      )}
    </>
  );
}
