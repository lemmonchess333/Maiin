import {
  sessionExercise,
  sessionPrescription,
  type SessionPrescription,
} from "@/features/program/sessionCompletion";
import type { CompletedSessionData } from "@/features/program/useProgram";
import type { ProgrammeCompletionContext } from "@/lib/workoutCompletion";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { formatClock, formatDayMonthYear } from "@/utils/formatters";
import {
  showsRpeByDefault,
  toExperience,
} from "@/features/program/experienceModel";
import type { ProgramExercise } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { liftDayLine } from "@/lib/liftDayLabel";
import { haptic } from "@/lib/haptic";
import {
  Play,
  RotateCcw,
  Check,
  X,
  Trophy,
  Info,
  Disc,
  Timer,
  Trash2,
  Plus,
  MoreHorizontal,
  SkipForward,
} from "lucide-react";
import type { Exercise } from "@/lib/exercises";
import { exerciseAddedToday } from "@/features/program/sessionAdd";
import { generateInstanceId } from "@/features/program/programTypes";
import { workoutSourceForScope } from "@/features/program/emptyWorkout";
import {
  leaveSuperset,
  nextInSuperset,
  supersetAt,
  supersetWith,
  supersetWithNext,
} from "@/features/program/superset";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  FIELD_EDGE,
  SECONDARY_ON_CARD_EDGE,
} from "@/components/ui/buttonClasses";
import { Card } from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import ExerciseRowSummary from "@/components/program/ExerciseRowSummary";
import LoweredLine from "@/components/program/LoweredLine";
import StretchedLine from "@/components/program/StretchedLine";
import EditSetSheet from "@/components/workout/EditSetSheet";
import SetTypeChip from "@/components/workout/SetTypeChip";
import { sessionRecords } from "@/features/program/sessionRecords";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { motion, AnimatePresence } from "framer-motion";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import {
  lastSetsByExercise,
  lastSetsBySlot,
  type LastSet,
} from "@/features/program/lastSets";
import { startingSetRows } from "@/features/program/setStartValues";
import { swappedForToday } from "@/features/program/sessionSwap";
import { followedWeight } from "@/features/program/sessionSets";
import { loadContextFrom } from "@/features/program/startingLoads";
import KeepSwapSheet, {
  type SwapToKeep,
} from "@/components/workout/KeepSwapSheet";
import {
  buildInitialSetLogs,
  toCompletionSetLogs,
} from "@/features/program/warmupRamp";
import { formatRepTarget } from "@/features/program/repTarget";
import { isSetEligibleForStrengthPr } from "@/features/program/sessionSetPolicy";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { DEFAULT_REST_SECONDS } from "@/features/program/programTypes";
import {
  restSecondsFor,
  warmupRestSecondsFor,
} from "@/features/program/restTime";
import { useStreaks } from "@/features/streaks/useStreaks";
import {
  exercisesForLiftBadges,
  liftWeightMilestoneBadges,
} from "@/features/streaks/liftWeightMilestones";
import { toast } from "@/lib/toast";
import { track as trackLifecycleEvent } from "@/lib/lifecycleAnalytics";
import {
  beginCompletionWindow,
  flushCompletionSurfaces,
} from "@/lib/completionSurfaceCounter";
import {
  checkSetPR,
  exerciseBest,
  type SetPR,
  recordSetBest,
  checkVolumePR,
  exerciseSessionVolume,
  type PRMap,
  type RepBucket,
  type VolumeBestMap,
  getRepBucket,
} from "@/lib/prTracking";
import {
  commitLiftRecords,
  loadLiftRecords,
  markLiftRecordsStale,
  type LiftRecords,
} from "@/lib/liftRecordsStore";
import { effortCueFor, rpeReserveWords } from "@/features/program/effortCue";
import Tooltip from "@/components/ui/Tooltip";
import PlateCalculatorSheet from "@/components/workout/PlateCalculatorSheet";
import {
  needsLoad,
  validateSet,
  type SetValidationWarn,
} from "@/lib/setValidation";
import { getExerciseById, isBodyweightExerciseId } from "@/lib/exercises";
import {
  clampExerciseIndex,
  isExerciseDone,
  isSetOutstanding,
  nextIncompleteSet,
} from "@/features/program/sessionCursor";
import {
  SET_TYPE_COPY,
  SET_TYPE_ORDER,
  asSetType,
  countedSets,
  setBadge,
  setCounts,
  setName,
  setOrdinal,
  type SetType,
} from "@/features/program/setLabels";
import { platesInKit } from "@/lib/plateMath";
import {
  useWorkoutDraft,
  computeDraftIdentity,
  createWorkoutCompletionId,
  draftLayout,
} from "@/hooks/useWorkoutDraft";
import { logger } from "@/lib/logger";
import { useScrollEdges } from "@/hooks/useScrollEdges";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import WorkoutProgress from "@/components/workout/WorkoutProgress";
import WorkoutRestTimer from "@/components/workout/WorkoutRestTimer";
import SetCheck from "@/components/workout/SetCheck";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import NewBestMoment, {
  type NewBest,
} from "@/components/workout/NewBestMoment";
import { elapsedSecondsSince } from "@/hooks/useElapsedSeconds";
import { BottomSheet } from "@/components/ui/BottomSheet";
import ExerciseFormSheet from "@/components/program/ExerciseFormSheet";
import { IconButton } from "@/components/ui/IconButton";
import InlineNumerals from "@/components/ui/InlineNumerals";
import type { SessionShareAction } from "@/lib/sessionPost";
import {
  liftSessionDay,
  type LiftCompletionReceipt,
} from "@/lib/liftCompletion";
import GuideHint from "@/components/guide/GuideHint";
import { FIRST_SET_BODY_NO_AUTO_REST } from "@/lib/firstGuide";
import { liftUnitLabel, type LiftUnit } from "@/lib/liftLoad";
import {
  formatKitLoad,
  kitLoadIn,
  kitLoadToKg,
} from "@/features/program/loadSteps";
import { useLiftUnit } from "@/hooks/useLiftUnit";
// An exercise's menu (swap, skip, superset), loaded when it is first
// opened: the workout screen's chunk has no room to spare.
const ExerciseMenuSheet = lazyRetry(
  () => import("@/components/workout/ExerciseMenuSheet")
);
// The screen of a session with no exercises yet, which most never show.
const EmptySessionScreen = lazyRetry(
  () => import("@/components/workout/EmptySessionScreen")
);
// The exercise list for "Swap for today" and "Add exercise", loaded when
// it is opened.

const ExercisePicker = lazyRetry(
  () => import("@/components/program/ExercisePicker")
);

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

/** An exercise's rows, by its slot, or its place when it has none. */
const rowKey = (ex: { instanceId?: string }, index: number) =>
  ex.instanceId ?? `#${index}`;

/** "Set 2" → "set 2", for the middle of a sentence. */

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** Last session's set as the Previous column shows it, in the lifter's
 *  unit: "60 × 8", and on a bodyweight lift "+10 × 8" for load added
 *  (Pgm8 L6, as Train's "+10 kg") or "BW × 12" for none. */
function previousLabel(
  prev: { weight: number; reps: number } | undefined,
  timed: boolean,
  bodyweight: boolean,
  unit: LiftUnit,
  exerciseId: string | undefined
): string | null {
  if (!prev) return null;
  if (timed) return `${prev.reps} s`;
  if (prev.weight > 0)
    return `${bodyweight ? "+" : ""}${kitLoadIn(prev.weight, unit, exerciseId)} × ${prev.reps}`;
  return bodyweight ? `BW × ${prev.reps}` : null;
}

/** The load on the target line: " @ 60 kg", " @ Bodyweight", or a
 *  bodyweight lift's load added, which the plan follows, as
 *  " @ Bodyweight + 10 kg" (Pgm8 L6). */
function targetLoad(
  exercise: Pick<ProgramExercise, "exerciseId" | "weight">,
  unit: LiftUnit
): string {
  const bodyweight =
    getExerciseById(exercise.exerciseId)?.equipment === "Bodyweight";
  if (exercise.weight > 0)
    return ` @ ${bodyweight ? "Bodyweight + " : ""}${formatKitLoad(exercise.weight, unit, exercise.exerciseId)}`;
  return bodyweight ? " @ Bodyweight" : "";
}

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** What a set's weight is checked against before it logs (Lift16): today's
 *  plan, or a heavier weight already said yes to for this lift today, so
 *  the second set at a confirmed weight doesn't ask again. */
function weightToCheckAgainst(
  exercise: { weight: number },
  sets: readonly { completed: boolean; confirmedWeight?: number }[]
): number {
  return Math.max(
    exercise.weight,
    ...sets.map((set) => (set.completed ? (set.confirmedWeight ?? 0) : 0))
  );
}

/** How long a new best stays on screen: past the undo window (4 s), so
 *  the lifter can look up from the bar and still catch it. */
const NEW_BEST_MOMENT_MS = 6000;

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
  /** A weight the person said yes to when it was far past today's plan
   *  or their best (Lift16): the set counts at it, and isn't asked about
   *  again. */
  confirmedWeight?: number;
}

interface Props {
  day: WorkoutDay;
  dayIndex: number;
  /** The day as Train names it in its week ("Pull B", `liftDayNameIn`).
   *  `day.dayName` stays the stored name, which the draft and the save
   *  key on; without this the screen names the day without its week. */
  dayLabel?: string;
  planContext?: { next: string };
  /** LIFT-01 draft-identity scope: `"programme"` (default) for
   *  scheduled programme days, `"routine:<id>"` for saved-routine
   *  sessions so each routine gets its own draft isolation. */
  draftScope?: string;
  /** LIFT-01 draft-identity epoch: the programme `weekNumber` for
   *  programme days (invalidates a stale draft across week
   *  advancement). Defaults to 0 for scopes without an epoch. */
  draftEpoch?: string | number;
  /** PROGRAM-FLEX-01 / PROGRAM-ADAPT-01: present when the caller
   *  handed a reduced COPY of `day` (Express time budget, or Easier
   *  today). Threaded into the completion write and acknowledged on
   *  the complete screen. */
  sessionVariant?: "express45" | "express30" | "easier_today" | "time_budget";
  /** Backlog #4: true during a step-back (deload) week — the effort cue
   *  under the set counter switches to the step-back line. */
  deloadWeek?: boolean;
  /** The session length the plan is built for
   *  (`programState.sessionMinutes`): a 30-minute plan rests less. */
  sessionMinutes?: number;
  progressionBaseline?: ProgramExercise[];
  /** Every lift of the plan, each in its slot: a lift starts from the last
   *  session that ran its slot (`lastSetsBySlot`). Train passes it; a saved
   *  routine's lifts start from their exercise's last session. */
  planLifts?: readonly { exerciseId: string; instanceId?: string }[];
  programmeContext?: ProgrammeCompletionContext;
  /** Saves the session (`completeLift`) and hands back its receipt. */
  onCompleteDay: (
    dayIndex: number,
    sessionData: CompletedSessionData
  ) => Promise<LiftCompletionReceipt>;
  onClose: () => void;
  /** Open the exact saved record returned by the completion writer. */
  onViewWorkout?: (workoutId: string) => void;
  /** The account has never finished a workout: the guide's first-set hint
   *  may point at the first row (FV1). Train knows this; a saved routine
   *  doesn't pass it. */
  firstWorkout?: boolean;
  /** Whether a long or hard run finished in the 24 hours before a start
   *  (`useHardRunBefore`); the finish records it. Train passes it. */
  hardRunBefore?: (startedAt: number) => boolean;
  /** Opened from a Resume tap (the In progress strip): a draft found for
   *  this session carries on without asking "Resume workout?" again. */
  resumeDraft?: boolean;
}

export default function WorkoutSession({
  day: incomingDay,
  dayIndex,
  dayLabel,
  planContext,
  draftScope,
  draftEpoch,
  sessionVariant,
  deloadWeek = false,
  sessionMinutes,
  progressionBaseline,
  planLifts,
  programmeContext,
  onCompleteDay,
  onClose,
  onViewWorkout,
  firstWorkout = false,
  hardRunBefore,
  resumeDraft = false,
}: Props) {
  const { user, profile } = useAuth();
  // Loads are stored in kg; the lifter reads and types them in this unit.
  const liftUnit = useLiftUnit();
  const [initialDay] = useState(incomingDay);
  const { awardEventBadge, awardEventBadges } = useStreaks();
  // LIFT-01: bind the draft to this exact session — scope + epoch +
  // day metadata + executable exercise layout. setLogs/exerciseNotes
  // are positional over day.exercises, so a draft from a different
  // layout must never be offered for resume here.
  const draftIdentity = useMemo(
    () =>
      computeDraftIdentity({
        scope: draftScope ?? "programme",
        epoch: draftEpoch ?? 0,
        dayIndex,
        dayName: initialDay.dayName,
        layout: draftLayout(initialDay.exercises),
      }),
    [draftScope, draftEpoch, dayIndex, initialDay.dayName, initialDay.exercises]
  );
  const {
    load: loadDraft,
    save: saveDraft,
    clear: clearDraft,
  } = useWorkoutDraft(user?.uid, dayIndex, draftIdentity);
  // Captured once on mount — stable across renders via the stable hook callbacks.
  const initialDraft = useMemo(() => loadDraft(), [loadDraft]);
  const hasRecoveryDraft = useRef(initialDraft !== null);
  const hasEnteredValues = useRef(false);
  // One completion id per session (packet 15). Resumed from the draft when
  // present so a retry/resume targets the SAME workout doc; persisted into
  // every draft save below. Never regenerated per Finish click.
  const [initialCompletionId] = useState(
    () => initialDraft?.completionId ?? createWorkoutCompletionId()
  );
  const completionIdRef = useRef(initialCompletionId);
  // Packet 18 program-command receipt key — session-stable, never regenerated
  // per Finish. Defaults to the completion id for a fresh session.
  const completionCommandIdRef = useRef(
    initialDraft?.completionCommandId ?? initialCompletionId
  );
  const [prescription, setPrescription] = useState<SessionPrescription>(
    () =>
      initialDraft?.prescription ??
      sessionPrescription(initialDay, initialCompletionId, progressionBaseline)
  );
  const [sessionProgrammeContext] = useState(
    initialDraft?.programmeContext ?? programmeContext
  );
  const day = useMemo(
    () => ({ ...initialDay, exercises: prescription.exercises }),
    [initialDay, prescription]
  );
  const [originalStartedAt, setOriginalStartedAt] = useState(
    () => initialDraft?.startedAt ?? Date.now()
  );
  /** The day the workout is saved under (Lift3: the day it started), and
   *  so the day its records are dated: dated as each set was logged, a
   *  best set at 00:05 in a session begun at 23:40 sat on a day the
   *  workout is not. */
  const sessionDay = liftSessionDay(originalStartedAt);
  const [showResumePrompt, setShowResumePrompt] = useState(
    initialDraft !== null && !initialDraft.completionPending && !resumeDraft
  );
  // CIRCLE-SESSION-01 — explicit Circle share from the completion
  // screen. The sheet mounts ONLY while open so its Circle reads
  // never fire unless the user taps "Share to circle".
  const resumeCursor = initialDraft
    ? nextIncompleteSet(initialDraft.setLogs, initialDraft.currentExIndex)
    : null;
  const [currentExIndex, setCurrentExIndex] = useState(
    resumeCursor?.exerciseIndex ?? initialDraft?.currentExIndex ?? 0
  );
  const [currentSetIndex, setCurrentSetIndex] = useState(
    resumeCursor?.setIndex ?? 0
  );
  /* The rows still to start from what they did last time
     (`startingSetRows`), by their exercise's slot: the session's own at
     first (a resumed draft's rows already have theirs), and any exercise
     added, or set out again by Start fresh, before last time is read.
     Started when it is (`history`, below), from the session as it is
     then. */
  const rowsToStart = useRef(
    new Set<string>(
      initialDraft?.setLogs
        ? []
        : initialDay.exercises.map((ex, i) => rowKey(ex, i))
    )
  );
  /* Exercises added before last time was read: their first weight was a
     first guess, and follows what they were last lifted at once it is. */
  const weightsToFollow = useRef(new Set<string>());
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() => {
    if (initialDraft?.setLogs) return initialDraft.setLogs as SetLog[][];
    // Backlog #12: pre-fill a warm-up ramp on the first loaded exercise per
    // body part (N7's scoping rule). They're ordinary rows carrying the
    // existing `warmup` type (N11), so every volume/PR/calorie path that
    // already filters on that type excludes them for free.
    return buildInitialSetLogs(day.exercises, liftUnit);
  });
  /* The rows a skipped exercise set aside (Lift4 (11)), by its place in the
     session: out of the counts and the cursor's way until "Don't skip"
     brings them back. */
  const [skippedRows, setSkippedRows] = useState<Record<number, SetLog[]>>(
    () => initialDraft?.skippedRows ?? {}
  );
  /* The exercise whose menu is open, the one being swapped, and Finish's
     question about today's swaps. */
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  /* "Add exercise" (Mob1 call 1): the picker, open to add to today. */
  const [adding, setAdding] = useState(false);
  const [keepQuestion, setKeepQuestion] = useState<{
    open: boolean;
    swaps: SwapToKeep[];
  }>({ open: false, swaps: [] });
  /** Last time's counted sets by exercise id, on any day, so a
   *  swapped-in exercise starts from its own. */
  const lastSetsById = useRef(
    new Map<string, { weight: number; reps: number }[]>()
  );
  /** Last time, once it has been read: each lift's sets in its own slot
   *  (or its exercise's, `lastSetsBySlot`). Null until then. */
  const [history, setHistory] = useState<{
    lastOf: (
      ex: ProgramExercise
    ) => { weight: number; reps: number }[] | undefined;
  } | null>(null);
  /** Bumped when rows are queued to start once `history` is in hand. */
  const [rowsQueued, setRowsQueued] = useState(0);
  // Earned complexity (experienceModel.ts): RPE is a genuinely useful tool
  // for someone who can calibrate it and noise-plus-jargon for someone who
  // cannot, so an advanced lifter opens the session with it on and everyone
  // else opts in. This was `useState(false)` with no gate at all, against a
  // presentation policy that lists RPE under "experience-gated".
  const [showRPE, setShowRPE] = useState(() =>
    showsRpeByDefault(toExperience(profile?.experience))
  );
  // D-LIFT-14: form guide reachable mid-workout (no more exit → History → Form).
  const [showFormGuide, setShowFormGuide] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>(
    initialDraft?.exerciseNotes ?? {}
  );
  const [previousNotes, setPreviousNotes] = useState<
    Record<number, { text: string; date: string }>
  >({});
  /* Last session's sets per exercise, for the Previous column: the saved
     sets are the ones that counted (warm-ups are never saved), so the
     n-th of them is the n-th counted set today. */
  const [previousSets, setPreviousSets] = useState<
    Record<number, { weight: number; reps: number }[]>
  >({});
  const notesInputRef = useRef<HTMLInputElement>(null);
  const completionPendingRef = useRef(initialDraft?.completionPending ?? false);
  /* The same flag as state, for what the screen draws (the finish screen's
     Edit): the ref serves the handlers that must see it synchronously. */
  const [completionPending, setCompletionPending] = useState(
    initialDraft?.completionPending ?? false
  );
  /* The set whose type sheet is open: tapping a set's badge opens it, as
     tapping the set number does in Hevy and MacroFactor. */
  const [typeSheet, setTypeSheet] = useState<number | null>(null);
  // Exercise-rail scroller: `tabsRef` drives both the active-pill
  // scrollIntoView and the overflow-aware edge fades (atStart/atEnd) below.
  const {
    ref: tabsRef,
    atStart: railAtStart,
    atEnd: railAtEnd,
    measure: measureRail,
  } = useScrollEdges<HTMLDivElement>();
  // Resuming continues the saved training time; a closed-app gap is excluded.
  const [sessionStartedAt, setSessionStartedAt] = useState(() =>
    initialDraft
      ? initialDraft.completionPending && initialDraft.startedAt !== undefined
        ? initialDraft.startedAt
        : Date.now() - initialDraft.elapsedSeconds * 1000
      : Date.now()
  );

  // Auto-scroll exercise tabs when active exercise changes
  useEffect(() => {
    const container = tabsRef.current;
    const activeBtn = container?.children[currentExIndex] as
      HTMLElement | undefined;
    /* No `behavior`: the default defers to the computed
       `scroll-behavior`, which Reduce Motion turns to `auto`. An
       explicit "smooth" would animate the rail regardless. */
    activeBtn?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
    // Re-measure the edge fades after the programmatic scroll settles (the
    // scroll event also fires, but this covers the no-op/cut-short cases).
    const t = setTimeout(measureRail, 350);
    return () => clearTimeout(t);
  }, [currentExIndex, measureRail, tabsRef]);

  // Multi-rep-range PR tracking
  const [prMap, setPrMap] = useState<PRMap>({});
  const recordBaseline = useRef<PRMap>({});
  /** The map as loaded: what this session's records are committed over. */
  const loadedRecordsRef = useRef<LiftRecords | null>(null);
  const volumeBaseline = useRef<VolumeBestMap>({});
  const [editingSet, setEditingSet] = useState<{
    exIdx: number;
    setIdx: number;
  } | null>(null);
  // Backlog #2 (three-axis PR): best single-session volume per exercise.
  // Loaded with the PR map; persisted undo-safe from final setLogs.
  const [volumeBest, setVolumeBest] = useState<VolumeBestMap>({});
  const firedVolumePRs = useRef<Set<string>>(new Set());
  const [showPlates, setShowPlates] = useState(false);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>(
    {}
  );
  const [firedPRs, setFiredPRs] = useState<Map<string, RepBucket[]>>(new Map());
  const [prResults, setPrResults] = useState<Map<string, SetPR>>(new Map());

  // Pre-fill weights/reps from most recent previous session + build PR map
  useEffect(() => {
    // An empty workout reads last time too: what it adds starts from there.
    if (!user?.uid) return;

    const fetchPreviousWeights = async () => {
      // The 50 newest workouts, including one finished on this phone that
      // has not synced yet: it is the last session even offline.
      const recent = await fetchSavedWorkouts(user.uid, { latest: 50 });

      const notes: Record<number, { text: string; date: string }> = {};

      recent.forEach((data) => {
        if (data.completionId === completionIdRef.current) return;
        day.exercises.forEach((exercise, index) => {
          if (notes[index]) return;
          const text = data.exercises
            .find(
              (entry) =>
                (entry.exerciseId && exercise.exerciseId
                  ? entry.exerciseId === exercise.exerciseId
                  : entry.exerciseName === exercise.name) && entry.notes?.trim()
            )
            ?.notes?.trim();
          if (text) notes[index] = { text, date: data.date };
        });
      });
      setPreviousNotes(notes);
      const done = recent.filter(
        (data) => data.completionId !== completionIdRef.current
      );
      const asRows = (sets: readonly LastSet[]) =>
        sets.map(({ weightKg, reps }) => ({ weight: weightKg, reps }));
      const byExercise = lastSetsByExercise(done);
      lastSetsById.current = new Map(
        [...byExercise].map(([id, sets]) => [id, asRows(sets)])
      );
      // Last time's counted sets, as Train's "Last:" line lists them: the
      // Previous column and where each row starts both read these.
      const lastOf = planLifts
        ? lastSetsBySlot(done, planLifts)
        : (ex: { exerciseId: string }) => byExercise.get(ex.exerciseId);
      const lastSets = day.exercises.map((ex) => {
        const sets = lastOf(ex);
        return sets && asRows(sets);
      });
      setPreviousSets(
        Object.fromEntries(
          lastSets.flatMap((sets, i) => (sets ? [[i, sets]] : []))
        )
      );

      // Each row starts from what that set did last time (Lift4,
      // `startingSetRows`), once: the effect below starts the rows still
      // waiting, from the session as it is by then.
      setHistory({
        lastOf: (ex) => {
          const sets = lastOf(ex);
          return sets && asRows(sets);
        },
      });

      // The best-lift map, as stored or rebuilt from history
      // (liftRecordsStore.ts). If it cannot be read, this session celebrates
      // no bests and leaves the stored map alone. Read once: the list
      // changing under the session (a swap, an added exercise) read it
      // again, and the bests already set this session went with it.
      if (loadedRecordsRef.current) return;
      try {
        const records = await loadLiftRecords(user.uid, recent);
        loadedRecordsRef.current = records;
        recordBaseline.current = records.map;
        setPrMap(records.map);
        setSessionCounts(records.sessionCounts);
        volumeBaseline.current = records.volumeBest;
        setVolumeBest(records.volumeBest);
      } catch (error) {
        logger.warn("[WorkoutSession] best-lift map unavailable", error);
      }
    };

    fetchPreviousWeights();
  }, [user?.uid, day.exercises, planLifts]);

  /* The rows waiting to start, started once last time is read: from the
     session as it is now, so an exercise added while the read was out
     starts from its own last sets too, with the weight it was last lifted
     at. A row with a set done, or a resumed draft's, holds what is
     there. */
  useEffect(() => {
    if (!history || rowsToStart.current.size === 0) return;
    const waiting = new Set(rowsToStart.current);
    rowsToStart.current.clear();
    const exercises = prescription.exercises;
    const untouched = (i: number) =>
      !(setLogs[i] ?? []).some((set) => set.completed);
    const followed = exercises.map((ex, i) => {
      const key = rowKey(ex, i);
      if (!waiting.has(key) || !weightsToFollow.current.has(key)) return ex;
      weightsToFollow.current.delete(key);
      if (!untouched(i)) return ex;
      const last = lastSetsById.current.get(ex.exerciseId);
      const weight = last ? followedWeight(last) : null;
      return weight && weight > 0 ? { ...ex, weight } : ex;
    });
    const rebuilt = buildInitialSetLogs(followed, liftUnit);
    const byKey = new Map(followed.map((ex, i) => [rowKey(ex, i), ex]));
    if (followed.some((ex, i) => ex !== exercises[i]))
      setPrescription((current) => ({
        ...current,
        exercises: current.exercises.map(
          (ex, i) => byKey.get(rowKey(ex, i)) ?? ex
        ),
      }));
    setSetLogs((logs) =>
      logs.map((rows, i) => {
        const ex = followed[i];
        if (!ex || !waiting.has(rowKey(ex, i))) return rows;
        if (rows.some((set) => set.completed)) return rows;
        const base: SetLog[] = ex !== exercises[i] ? rebuilt[i] : rows;
        return startingSetRows(base, ex, history.lastOf(ex));
      })
    );
    // The session as it is when last time arrives is all this reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, rowsQueued]);

  // Save on meaningful edits. Read elapsed time at the save itself, so a
  // draft stays accurate even when the phone has suspended display ticks.
  useEffect(() => {
    const hasProgress = setLogs.some((exSets) =>
      exSets.some((s) => s.completed)
    );
    // Once a draft exists, Undo must also persist zero completed sets.
    // Keep the entered values, notes and session choices with that reversal.
    // Entered values and notes count before the first completed set too.
    // A session changed from how it was set out (an exercise added, a
    // superset, a swap) is kept before any set is done: an empty workout
    // with its exercises added is a workout to come back to.
    const reshaped =
      prescription.exercises.length !== initialDay.exercises.length ||
      (prescription.supersets?.length ?? 0) > 0 ||
      (prescription.swaps?.length ?? 0) > 0;
    if (
      !hasProgress &&
      !reshaped &&
      !hasRecoveryDraft.current &&
      !hasEnteredValues.current
    )
      return;
    if (completionPendingRef.current) return;
    const stored = saveDraft({
      dayIndex,
      dayName: day.dayName,
      setLogs,
      exerciseNotes,
      elapsedSeconds: elapsedSecondsSince(sessionStartedAt),
      currentExIndex,
      completionId: completionIdRef.current,
      completionCommandId: completionCommandIdRef.current,
      startedAt: originalStartedAt,
      prescription,
      skippedRows,
      programmeContext: sessionProgrammeContext,
    });
    if (stored) hasRecoveryDraft.current = true;
  }, [
    setLogs,
    skippedRows,
    exerciseNotes,
    currentExIndex,
    dayIndex,
    day.dayName,
    saveDraft,
    prescription,
    initialDay.exercises.length,
    originalStartedAt,
    sessionProgrammeContext,
    sessionStartedAt,
  ]);

  const formatElapsed = formatClock;

  /* Leaving keeps a workout that has a draft, and Home and Train offer it
     back with Resume, so every way out says so, once, and a close does not
     read as a discard: Close, the device's Back (Train closes the session
     over it; a routine's page is left), and anything else that takes the
     screen away. The screen going is the one moment they all share, so it
     is said here and nowhere else. Nothing is said for a workout finished
     or waiting for the server, for one started afresh with nothing done
     since, or once its account has signed out. */
  const sessionUid = user?.uid;
  const onScreen = useRef(false);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
      // Development runs each cleanup once at mount and sets the effect up
      // again at once, so the screen has gone only if nothing set it up by
      // the time this runs.
      queueMicrotask(() => {
        if (onScreen.current) return;
        if (!hasRecoveryDraft.current || completionPendingRef.current) return;
        if (!sessionUid || auth.currentUser?.uid !== sessionUid) return;
        // A programme day's and a routine's alike: both are offered back.
        toast.message("Workout kept", {
          description: "Resume it from Home or Train.",
        });
      });
    };
  }, [sessionUid]);

  // Rest timer: the rest fixed in Settings → Workout preferences, or the
  // plan's suggestion by role and reps, shorter in a plan built for 30
  // minutes (`restSecondsFor`, Lift4 (5)).
  const fixedRest =
    typeof profile?.defaultRestSeconds === "number"
      ? profile.defaultRestSeconds
      : undefined;
  const [rest, setRest] = useState<{
    id: number;
    startedAt: number;
    target: number;
  } | null>(null);
  const restSequence = useRef(0);
  const isResting = rest !== null;
  const reduceMotion = useReducedMotion();
  // D-LIFT-16: the Settings → "Auto-start rest timer" toggle existed but was
  // never read here — the same dead-setting class PR E fixed for
  // defaultRestSeconds. Default ON (unset/legacy profiles keep today's
  // behaviour); when OFF, completing a set doesn't lock the user into a rest
  // and the manual "Start rest" affordance below the grid takes over.
  const autoRest = profile?.autoRestTimer !== false;

  // B0: one `session_started` per opening of the session surface. No
  // `offPlan` here — a lift day has no planned date to be off (ADR-0002
  // pins lifts as split-ordered), so the field is absent rather than
  // guessed. A resumed draft still counts: the user opened a session.
  useEffect(() => {
    trackLifecycleEvent("session_started", { kind: "lift" });
    // Flush on unmount rather than on a Done handler: abandoning the
    // completion screen is a real exit, and a window left open would keep
    // counting unrelated toasts into the next session's total.
    return () => {
      const surfaces = flushCompletionSurfaces();
      if (surfaces !== null) {
        trackLifecycleEvent("completion_surfaces", { count: surfaces });
      }
    };
  }, []);

  // Session state
  const [sessionComplete, setSessionComplete] = useState(
    initialDraft?.completionPending ?? false
  );
  /* Lift16: a set far past today's plan or the best for its reps waits
     for a yes. Kept after the question closes so the dialog's words
     hold while it animates out. */
  const [jumpQuestion, setJumpQuestion] = useState<{
    exIdx: number;
    setIdx: number;
    warn: SetValidationWarn;
  } | null>(null);
  const [askingJump, setAskingJump] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "queued" | "synced" | "needs-attention" | undefined
  >(initialDraft?.completionPending ? "needs-attention" : undefined);
  const [shareAction, setShareAction] = useState<
    SessionShareAction | undefined
  >();
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(
    initialDraft?.completionPending
      ? Math.max(1, initialDraft.elapsedSeconds) / 60
      : 0
  );
  useEffect(() => {
    if (!initialDraft?.completionPending || !user?.uid || !navigator.onLine)
      return;
    let cancelled = false;
    const uid = user.uid;
    // A server acknowledgement may have arrived while this view was closed.
    // Only a server read can discharge the recovery record after a restart.
    void (async () => {
      try {
        const { doc, getDocFromServer } = await import("firebase/firestore");
        const source = workoutSourceForScope(draftScope);
        const snapshot = await getDocFromServer(
          doc(
            db,
            "users",
            uid,
            "workouts",
            `${source}-${initialDraft.completionId}`
          )
        );
        if (
          cancelled ||
          auth.currentUser?.uid !== uid ||
          !snapshot.exists() ||
          snapshot.data().completionId !== initialDraft.completionId
        )
          return;
        clearDraft(initialDraft.completionId);
        setSavedWorkoutId(snapshot.id);
        setSaved(true);
        setSaveStatus("synced");
      } catch {
        // A missing server acknowledgement never removes the recovery copy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraft, user?.uid, draftScope, clearDraft]);

  /**
   * End the session — stamp its duration, THEN show the complete screen.
   *
   * These two were separate statements and only the auto-complete-on-last-set
   * path performed both; the green "Finish workout" button flipped
   * `sessionComplete` alone, so duration kept its `useState(0)` initial and
   * the completion screen read "0m". That 0 does not stay cosmetic: it is
   * sent in the save payload, where `useProgram` substitutes a fabricated
   * `completedSetCount * 3`, which then feeds the calorie estimate and the
   * training-load series. One entry point makes the pair un-droppable.
   */
  const completeSession = useCallback(() => {
    // Opened before the completion screen renders, so everything the finish
    // puts on screen from here on is inside the window.
    beginCompletionWindow();
    setSessionDurationMinutes(
      // A measured short session must stay positive: the writer reserves
      // zero for sessions without a clock and estimates their duration.
      Math.max(1, (Date.now() - sessionStartedAt) / 1000) / 60
    );
    setSessionComplete(true);
  }, [sessionStartedAt]);

  // Undo last set. PR E: extended with optional PR-context so undo
  // can revert the prMap mutation AND firedPRs entry, not just the
  // setLogs[].completed flag (pre-PR-E undo would leave a fat-
  // fingered PR persisted to profile even after the user undid the
  // set).
  const [lastCompleted, setLastCompleted] = useState<{
    exIdx: number;
    setIdx: number;
    pr?: {
      exName: string;
      bucket: RepBucket;
      // Previous PR value for this exercise+bucket, captured at
      // completeSet time. `null` means there was no prior PR.
      previousPR: { weight: number; reps: number; date: string } | null;
      previousResult: SetPR | undefined;
      previousFired: RepBucket[];
    };
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* DS3's new-best moment: a set that beat the lifter's best is said on
     the spot, in gold, above the bottom bar, for a few seconds. Undoing
     or correcting that set takes it away with the record it announced;
     the finish screen still lists every best the session kept. */
  const [newBest, setNewBest] = useState<NewBest | null>(null);
  const newBestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNewBest = (moment: NewBest) => {
    if (newBestTimeoutRef.current) clearTimeout(newBestTimeoutRef.current);
    setNewBest(moment);
    newBestTimeoutRef.current = setTimeout(
      () => setNewBest(null),
      NEW_BEST_MOMENT_MS
    );
  };
  const dismissNewBest = (setKey: string) => {
    if (newBest?.setKey !== setKey) return;
    if (newBestTimeoutRef.current) clearTimeout(newBestTimeoutRef.current);
    setNewBest(null);
  };

  // The cursor can outrun the list: `currentExIndex` is component state while
  // `day.exercises` is a prop that can shrink under an open session (a
  // re-trimmed express/easier plan, a removed slot, a snapshot from another
  // device). Reading past the end yields an undefined exercise, which renders
  // as a nameless "Set 1 of 0" and then throws on the first
  // `currentExercise.name` — the 09:16 pair of screenshots on 2026-08-04.
  const safeExIndex = clampExerciseIndex(currentExIndex, day.exercises.length);
  // Pull the cursor back while rendering (React's adjust-state-in-render
  // pattern), so no committed frame holds an index past the end.
  if (safeExIndex !== currentExIndex) setCurrentExIndex(safeExIndex);

  const currentExercise = day.exercises[safeExIndex];
  /* "Superset with Push-Ups" under the exercise's name, in one. */
  const supersetLine = supersetWith(
    day.exercises,
    prescription.supersets,
    safeExIndex
  );

  // Plates belong to a barbell only: the per-side hint and the plate
  // calculator both read this, so a cable or dumbbell lift offers neither.
  const isBarbell = currentExercise
    ? getExerciseById(currentExercise.exerciseId)?.equipment === "Barbell"
    : false;
  // Barbell plate breakdown for the prescribed weight, a read-only hint. The
  // standard set runs down to 1.25 kg a side, which is the plan's 2.5 kg step.
  const plateLoad = useMemo(() => {
    if (!currentExercise || currentExercise.weight <= 0 || !isBarbell)
      return null;
    return platesInKit(currentExercise.weight, liftUnit);
  }, [currentExercise, isBarbell, liftUnit]);

  const currentSets = setLogs[currentExIndex] ?? [];
  // Warm-ups are optional, so the session's progress counts the sets that
  // count, as the saved workout does.
  const countedInSession = countedSets(setLogs.flat());
  const totalSetsCompleted = countedInSession.filter((s) => s.completed).length;
  const totalSetsTotal = countedInSession.length;
  // Finishing early: once a working set is done, while sets remain.
  const finishEarlyOffered =
    nextIncompleteSet(setLogs) !== null &&
    setLogs.some((sets) =>
      sets.some((set) => set.completed && set.type !== "warmup")
    );

  /* The exercise after this one that still has sets left (DS3 "Up next"):
     session order from the next exercise, wrapping, so one skipped earlier
     still comes round. Undefined once only this exercise has sets left. */
  const upNext = (() => {
    if (setLogs.length === 0) return undefined;
    const next = nextIncompleteSet(setLogs, (safeExIndex + 1) % setLogs.length);
    return next && next.exerciseIndex !== safeExIndex
      ? day.exercises[next.exerciseIndex]
      : undefined;
  })();

  /* haptic comes from `@/lib/haptic` which routes through
     Capacitor's Haptics plugin in the iOS/Android shell. The
     prior inline `navigator.vibrate(pattern)` was a no-op on iOS
     Safari — the Vibrate API has never shipped there. */

  /* A warm-up is briefly rested (`WARMUP_REST_SECONDS`), as the plan's
     session length counts it; a working set gets the lift's full rest. */
  const startRest = useCallback(
    (exercise: ProgramExercise | undefined, afterWarmup = false) => {
      setRest({
        id: ++restSequence.current,
        startedAt: Date.now(),
        target: exercise
          ? afterWarmup
            ? warmupRestSecondsFor(exercise, { fixedRest, sessionMinutes })
            : restSecondsFor(exercise, { fixedRest, sessionMinutes })
          : fixedRest && fixedRest > 0
            ? fixedRest
            : DEFAULT_REST_SECONDS,
      });
      haptic(50);
    },
    [fixedRest, sessionMinutes]
  );

  const stopRest = useCallback(() => setRest(null), []);

  /* What the rest timer says to a screen reader, held here in a region
     that is always on the page (the card's own would arrive with its
     words in it). Each line is a node of its own, so a second rest of the
     same length is still read out. */
  const [restWords, setRestWords] = useState({ line: 0, words: "" });
  const announceRest = useCallback(
    (words: string) =>
      setRestWords((spoken) => ({ line: spoken.line + 1, words })),
    []
  );

  /* The set being logged stays on screen. Ticking a set moves the current
     one down the table while the rest card (and a new best) dock under
     it, so on a phone the next set went below the fold: after a squat's
     four warm-ups, 393 × 715 showed the four done rows and not "Set 2 of
     4". The list scrolls only as far as the row needs, and not at all
     while it is in view; the row's scroll margin keeps a little of the
     list around it, and set 1 brings the table's head. Instant on the
     first render (Pol1: what is there on arrival does not move); after
     that no `behavior`, so it takes the list's `scroll-behavior`, smooth
     unless Reduce Motion, as the exercise strip's scroll does. Another
     exercise starts at its head, its name and set count in the list
     above its sets, at once: the whole list has changed under it. */
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const placedOnce = useRef(false);
  const shownExercise = useRef(currentExIndex);
  const bestDocked = newBest?.setKey ?? null;
  useLayoutEffect(() => {
    const row = contentRef.current?.querySelector<HTMLElement>(
      `[data-set-row="${currentSetIndex}"]`
    );
    if (!row) return;
    if (shownExercise.current !== currentExIndex) {
      shownExercise.current = currentExIndex;
      headerRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
    row.scrollIntoView(
      placedOnce.current
        ? { block: "nearest" }
        : { block: "nearest", behavior: "instant" }
    );
    placedOnce.current = true;
  }, [currentExIndex, currentSetIndex, isResting, bestDocked]);

  /* A set's type can change after it is done, as in Hevy: a set logged as
     working and meant as a warm-up is corrected here rather than by undoing
     it. A done set has fed this session's bests, so they are worked out
     again from the corrected sets, as an edited set's are. */
  const changeSetType = (exIdx: number, setIdx: number, type: SetType) => {
    const set = setLogs[exIdx]?.[setIdx];
    if (!set || set.type === type) return;
    if (set.completed && (completionPendingRef.current || saved)) return;
    hasEnteredValues.current = true;
    const next = setLogs.map((sets, ei) =>
      sets.map((entry, si) =>
        ei === exIdx && si === setIdx ? { ...entry, type } : entry
      )
    );
    setSetLogs(next);
    if (set.completed) {
      refreshRecords(next);
      dismissNewBest(`${exIdx}:${setIdx}`);
      setLastCompleted(null);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    }
  };

  const updateSetRPE = (
    exIdx: number,
    setIdx: number,
    rpe: number | undefined
  ) => {
    hasEnteredValues.current = true;
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      if (rpe === undefined) delete updated[exIdx][setIdx].rpe;
      else updated[exIdx][setIdx].rpe = rpe;
      return updated;
    });
  };

  const addSet = (exIdx: number) => {
    hasEnteredValues.current = true;
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

  /* "Add set" had no inverse. A mis-tap left an uncompleted set that the
     session then counted as outstanding work, so finishing the sets the
     programme actually prescribed still routed the lifter through "Finish
     early" — a warning about their own accidental tap.

     Removal is deliberately narrow. Only the LAST set of an exercise
     qualifies: taking one from the middle renumbers every set after it and
     moves the completion cursor under the lifter. Only an EXTRA qualifies —
     a working set beyond the prescribed count — because removing a
     prescribed set is a change to the prescription, not a correction. And
     only an UNCOMPLETED one: a completed set has already fed PR tracking,
     progression and volume, and reversing those is the accumulator problem
     ADR-0012 handles for deletion, not something to fold in here. */
  const extraSetIndex = (exIdx: number): number | null => {
    const sets = setLogs[exIdx];
    if (!sets || sets.length === 0) return null;
    const planned = day.exercises[exIdx]?.sets ?? 0;
    const working = sets.filter((set) => set.type === "working").length;
    if (working <= planned) return null;
    const last = sets.length - 1;
    if (sets[last].completed || sets[last].type !== "working") return null;
    return last;
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    hasEnteredValues.current = true;
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx].splice(setIdx, 1);
      return updated;
    });
    setCurrentSetIndex((idx) => Math.min(idx, Math.max(0, setIdx - 1)));
  };

  const updateSetLog = (
    exIdx: number,
    setIdx: number,
    field: "reps" | "weight",
    value: number
  ) => {
    // History may still be loading when someone starts typing. From this
    // edit onward the exercise belongs to them, just as a completed set
    // does; a late history read must not replace the numbers they entered.
    hasEnteredValues.current = true;
    const exercise = day.exercises[exIdx];
    if (exercise) {
      const key = rowKey(exercise, exIdx);
      rowsToStart.current.delete(key);
      weightsToFollow.current.delete(key);
    }
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx][field] = value;
      return updated;
    });
  };

  // Row checkmarks and the primary CTA share validation, PRs, undo and
  // progression, including when a lifter completes sets out of order.
  const completeSet = async (setIdx = currentSetIndex, confirmed = false) => {
    const set = currentSets[setIdx];
    if (!set) return;
    /* A set already marked complete is done. Completing it again re-ran
       the last-set path below — the volume-PR check and `onLogExercise`,
       which mints a fresh commandId per call, so the server's receipt
       dedupe never saw it as a retry — and progressed the exercise twice.
       Reachable from the exercise pills: returning to a finished exercise
       lands the cursor on set 1. Undo (handleUndo) is how a set reopens. */
    if (set.completed) return;

    // PR E (audit P0 #4): central validator gates PR detection and
    // confetti. Pre-PR-E `checkSetPR` ran directly on unvalidated
    // input — negative weight, decimal reps, or a fat-fingered
    // 200kg over a 100kg PR all became permanent state.
    //
    // The validator decides:
    //   - block  → toast the message and bail; the set stays
    //              incomplete so the user can fix the value.
    //   - warn   → ask first (Lift16): more than twice today's plan,
    //              or 25% past the best for these reps. A set it
    //              completes moves the plan, which follows the load
    //              lifted, so a typo can't just skip the PR. A yes
    //              completes it and it counts like any other set.
    //   - ok     → proceed.
    const exName = currentExercise.name;
    const repBucket = getRepBucket(set.reps || 0);
    const currentBucketPR = prMap[exName]?.[repBucket];
    const validation = validateSet({
      reps: set.reps,
      weight: set.weight,
      // The catalog says what the lift is: a bodyweight lift completes
      // at 0 kg, and a barbell, dumbbell, machine, cable or kettlebell
      // lift asks for a weight first.
      isBodyweight: isBodyweightExerciseId(currentExercise.exerciseId),
      equipment: getExerciseById(currentExercise.exerciseId)?.equipment,
      timed: currentExercise.repUnit === "seconds",
      currentBestForBucket: currentBucketPR?.weight,
      plannedWeight: weightToCheckAgainst(currentExercise, currentSets),
      unit: liftUnit,
    });

    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (validation.warn && !confirmed && set.confirmedWeight !== set.weight) {
      setJumpQuestion({
        exIdx: currentExIndex,
        setIdx,
        warn: validation.warn,
      });
      setAskingJump(true);
      return;
    }

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][setIdx].completed = true;
      if (validation.warn)
        updated[currentExIndex][setIdx].confirmedWeight = set.weight;
      return updated;
    });

    haptic(100);

    // PR detection: a set past the validator's warn reaches here only
    // once the person has said its weight is right.
    let prContext: NonNullable<typeof lastCompleted>["pr"] | undefined;
    if (isSetEligibleForStrengthPr(set.type, currentExercise.repUnit)) {
      const prResult = checkSetPR(
        exName,
        set.weight,
        set.reps,
        prMap,
        sessionCounts,
        3
      );
      const prBucket = getRepBucket(set.reps);
      const nextMap = recordSetBest(prMap, exName, {
        weight: set.weight,
        reps: set.reps,
        date: sessionDay,
      });
      if (nextMap !== prMap || prResult) {
        prContext = {
          exName,
          bucket: prBucket,
          previousPR: prMap[exName]?.[prBucket] ?? null,
          previousResult: prResults.get(`${exName}:${prBucket}`),
          previousFired: firedPRs.get(exName) ?? [],
        };
        setPrMap(nextMap);
        if (prResult) {
          const bestBeforeSession = exerciseBest(
            recordBaseline.current,
            exName
          );
          setPrResults((previous) =>
            new Map(previous).set(`${exName}:${prBucket}`, {
              ...prResult,
              setKey: `${currentExIndex}:${setIdx}`,
              bestBeforeSession,
            })
          );
          if (prResult.kind === "best") {
            setFiredPRs((previous) =>
              new Map(previous).set(exName, [
                ...new Set([...(previous.get(exName) ?? []), prBucket]),
              ])
            );
            haptic(50);
            showNewBest({
              setKey: `${currentExIndex}:${setIdx}`,
              exerciseId: currentExercise.exerciseId,
              exerciseName: exName,
              result: prResult,
            });
          }
        }
      }
    }

    // Track for undo. PR E: includes the prContext when this set
    // produced a PR, so handleUndo can revert prMap + firedPRs in
    // addition to setLogs.
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setLastCompleted({
      exIdx: currentExIndex,
      setIdx,
      pr: prContext,
    });
    undoTimeoutRef.current = setTimeout(() => setLastCompleted(null), 4000);

    const updatedLogs = setLogs.map((sets, exIndex) =>
      sets.map((st, setIndex) =>
        exIndex === currentExIndex && setIndex === setIdx
          ? { ...st, completed: true }
          : st
      )
    );
    const isLastSet = isExerciseDone(updatedLogs[currentExIndex]);
    const next = nextIncompleteSet(updatedLogs, currentExIndex);
    /* In a superset (Mob1 call 2) the next set is the next exercise's in
       the group, A1 → B1 → A2 → B2, and the rest waits for the end of the
       round: it runs after the group's last exercise, before its first
       comes round again. A warm-up keeps to its exercise until its ramp
       is done. Once the group has nothing left, the session moves on as
       it does from any exercise. */
    const members = supersetAt(
      day.exercises,
      prescription.supersets,
      currentExIndex
    );
    const turn = members
      ? nextInSuperset(
          updatedLogs,
          members,
          currentExIndex,
          set.type === "warmup"
        )
      : null;
    const takeTurn = (to: NonNullable<typeof turn>) => {
      setCurrentExIndex(to.exerciseIndex);
      setCurrentSetIndex(to.setIndex);
      if (!to.rest) stopRest();
      else if (autoRest)
        startRest(day.exercises[currentExIndex], set.type === "warmup");
    };

    if (isLastSet) {
      // Backlog #2 — session-volume PR (three-axis PR, Green/B1): most
      // total work for this exercise in one session. Quietly visible per
      // the presentation policy: one toast, no mechanism talk.
      if (
        isSetEligibleForStrengthPr(set.type, currentExercise.repUnit) &&
        !firedVolumePRs.current.has(exName)
      ) {
        const sessionVolume = exerciseSessionVolume(
          currentSets
            .map((st, i) => (i === setIdx ? { ...set, completed: true } : st))
            .filter((st) => st.completed && st.type !== "warmup")
            .map((st) => ({ weightKg: st.weight, reps: st.reps }))
        );
        if (checkVolumePR(exName, sessionVolume, volumeBest, sessionCounts)) {
          firedVolumePRs.current.add(exName);
          setVolumeBest((prev) => ({
            ...prev,
            [exName]: {
              volume: sessionVolume,
              date: sessionDay,
            },
          }));
        }
      }

      // Log exercise performance from the last set that is ELIGIBLE to drive
      // progression — not simply the last set. (RPE drives autoregulation in
      // applyProgression, D-LIFT-6.)
      //
      // D3: this used to pass `set` unconditionally, so a lifter who finished
      // an exercise with a drop set or a back-off set logged
      // `actualWeight < exercise.weight`, which `applyProgression` then scored
      // as a failure — every single session. Three sessions of that and the
      // backoff cut the load 5%, indefinitely (now that the plan follows the
      // load lifted, it would drop to the drop set's load instead). The
      // volume-PR check twenty lines above was already type-aware; the
      // progression call was not.
      //
      // Falling back to the last eligible WORKING set is the right answer
      // rather than skipping: the drop set is bonus volume after the top-end
      // effort, and the top-end effort is exactly what progression should read.
      // If nothing is eligible (an exercise logged as warm-ups only, or a lone
      // drop set) we skip entirely — there is no working-set evidence, and
      // inventing some would be worse than waiting for the next session.
      if (turn) {
        takeTurn(turn);
      } else if (!next) {
        completeSession();
      } else {
        setCurrentExIndex(next.exerciseIndex);
        setCurrentSetIndex(next.setIndex);
        if (autoRest)
          startRest(day.exercises[currentExIndex], set.type === "warmup");
      }
    } else if (turn) {
      takeTurn(turn);
    } else {
      // Move to next set, start rest timer (unless auto-start is off)
      setCurrentSetIndex(next?.setIndex ?? 0);
      if (autoRest)
        startRest(day.exercises[currentExIndex], set.type === "warmup");
    }
  };

  /* Supersets (Mob1 call 2), from an exercise's menu: with the exercise
     after it, or out of its group again. */
  const regroup = (index: number, withNext: boolean) =>
    setPrescription((current) => ({
      ...current,
      supersets: (withNext ? supersetWithNext : leaveSuperset)(
        current.exercises,
        current.supersets,
        index
      ),
    }));

  const refreshRecords = (logs: SetLog[][]) => {
    const next = sessionRecords(
      recordBaseline.current,
      volumeBaseline.current,
      sessionCounts,
      day.exercises,
      logs,
      sessionDay
    );
    setPrMap(next.map);
    setPrResults(next.results);
    setFiredPRs(next.fired);
    setVolumeBest(next.volumeBest);
  };

  /** Saves an edited set, or hands back the question to ask first when
   *  the new weight is far past the plan or the best (Lift16). */
  const saveSetCorrection = async (
    values: { weight: number; reps: number },
    confirmed: boolean
  ): Promise<SetValidationWarn | undefined> => {
    if (!editingSet || completionPendingRef.current || saved)
      throw new Error("This workout is already being saved.");
    const correctionUid = user?.uid;
    const { exIdx, setIdx } = editingSet;
    const exercise = day.exercises[exIdx];
    const set = setLogs[exIdx]?.[setIdx];
    if (!exercise || !set?.completed)
      throw new Error("This set is no longer available to edit.");
    const best =
      recordBaseline.current[exercise.name]?.[getRepBucket(values.reps)];
    const validation = validateSet({
      ...values,
      isBodyweight: isBodyweightExerciseId(exercise.exerciseId),
      equipment: getExerciseById(exercise.exerciseId)?.equipment,
      timed: exercise.repUnit === "seconds",
      currentBestForBucket: best?.weight,
      plannedWeight: weightToCheckAgainst(exercise, setLogs[exIdx] ?? []),
      unit: liftUnit,
    });
    if (!validation.ok) throw new Error(validation.message);
    if (validation.warn && !confirmed && set.confirmedWeight !== values.weight)
      return validation.warn;
    const next = setLogs.map((sets, ei) =>
      sets.map((entry, si) =>
        ei === exIdx && si === setIdx
          ? {
              ...entry,
              ...values,
              ...(validation.warn ? { confirmedWeight: values.weight } : {}),
            }
          : entry
      )
    );
    if (correctionUid && auth.currentUser?.uid !== correctionUid)
      throw new Error("Your account changed. Reopen your workout to continue.");
    setSetLogs(next);
    refreshRecords(next);
    dismissNewBest(`${exIdx}:${setIdx}`);
    setLastCompleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    haptic();
    toast.success("Set updated");
    return undefined;
  };

  const handleUndo = () => {
    if (!lastCompleted) return;
    const { exIdx, setIdx } = lastCompleted;
    const next = setLogs.map((sets, ei) =>
      sets.map((set, si) =>
        ei === exIdx && si === setIdx ? { ...set, completed: false } : set
      )
    );
    setSetLogs(next);
    refreshRecords(next);
    dismissNewBest(`${exIdx}:${setIdx}`);
    setCurrentExIndex(exIdx);
    setCurrentSetIndex(setIdx);
    stopRest();
    if (sessionComplete) setSessionComplete(false);
    setLastCompleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  // Cleanup the undo and new-best timeouts
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (newBestTimeoutRef.current) clearTimeout(newBestTimeoutRef.current);
    };
  }, []);

  /* Lift4 (11): "Swap for today" and "Skip", from an exercise's menu. */
  const swapAt = (index: number) =>
    prescription.swaps?.find((swap) => swap.index === index);

  /** The planned exercise at a place in the session, as it was set out. */
  const plannedAt = (index: number): ProgramExercise | undefined => {
    const ex = initialDay.exercises[index];
    return ex ? sessionExercise(ex, initialCompletionId) : undefined;
  };

  /** Another exercise in a planned one's place today, or the planned one
   *  back. Its rows start from what it did last time. */
  const swapForToday = (index: number, replacementId: string) => {
    const planned = plannedAt(index);
    if (!planned) return;
    const back = replacementId === planned.exerciseId;
    const last = lastSetsById.current.get(replacementId);
    const exercise = back
      ? planned
      : swappedForToday(planned, replacementId, {
          lastWeight: (last && followedWeight(last)) ?? undefined,
          loadContext: loadContextFrom(profile),
        });
    setPrescription((current) => ({
      ...current,
      exercises: current.exercises.map((ex, i) =>
        i === index ? exercise : ex
      ),
      swaps: [
        ...(current.swaps ?? []).filter((swap) => swap.index !== index),
        ...(back ? [] : [{ index }]),
      ],
    }));
    setSetLogs((logs) =>
      logs.map((rows, i) =>
        i === index
          ? startingSetRows(
              buildInitialSetLogs([exercise], liftUnit)[0],
              exercise,
              last
            )
          : rows
      )
    );
    setLastCompleted(null);
    setCurrentExIndex(index);
    setCurrentSetIndex(0);
  };

  /**
   * "Add exercise" (Mob1 call 1): the exercises picked join the end of the
   * session, for today, with the numbers and first weights an added lift
   * takes (`exerciseAddedToday`), each set starting from what it did last
   * time. They are saved with the session and leave the plan as it is.
   * The session moves on to the first of them.
   */
  const addExercises = (picked: readonly Exercise[]) => {
    if (picked.length === 0) return;
    const start = day.exercises.length;
    const experience = toExperience(profile?.experience);
    const loadContext = loadContextFrom(profile);
    // Before last time is read, an added exercise starts from a first
    // guess, and its rows wait to start (`rowsToStart`).
    const known = history !== null;
    const added = picked.map((exercise) => {
      const last = known ? lastSetsById.current.get(exercise.id) : undefined;
      return exerciseAddedToday(exercise.id, {
        instanceId: generateInstanceId(),
        goal: profile?.primaryGoal,
        experience,
        loadContext,
        lastWeight: last ? followedWeight(last) : null,
      });
    });
    // The warm-up ramp goes to the first loaded lift for each body part,
    // so the rows are built as part of the whole session.
    const rows = buildInitialSetLogs([...day.exercises, ...added], liftUnit)
      .slice(start)
      .map((built, k) =>
        known
          ? startingSetRows(
              built,
              added[k],
              lastSetsById.current.get(added[k].exerciseId)
            )
          : built
      );
    if (!known)
      added.forEach((ex, k) => {
        const key = rowKey(ex, start + k);
        rowsToStart.current.add(key);
        weightsToFollow.current.add(key);
      });
    setPrescription((current) => ({
      ...current,
      exercises: [...current.exercises, ...added],
    }));
    setSetLogs((logs) => [...logs, ...rows]);
    setLastCompleted(null);
    setCurrentExIndex(start);
    setCurrentSetIndex(0);
    haptic("light");
  };

  /** Skipping keeps the sets done and sets the rest aside. */
  const skipExercise = (index: number) => {
    const next = setLogs.map((rows, i) =>
      i === index ? rows.filter((set) => set.completed) : rows
    );
    setSkippedRows((current) => ({
      ...current,
      [index]: (setLogs[index] ?? []).filter((set) => !set.completed),
    }));
    setSetLogs(next);
    setLastCompleted(null);
    const cursor = nextIncompleteSet(next, (index + 1) % next.length);
    if (cursor) {
      setCurrentExIndex(cursor.exerciseIndex);
      setCurrentSetIndex(cursor.setIndex);
    }
  };

  const unskipExercise = (index: number) => {
    const rows = [...(setLogs[index] ?? []), ...(skippedRows[index] ?? [])];
    setSetLogs((logs) => logs.map((r, i) => (i === index ? rows : r)));
    setSkippedRows(({ [index]: _back, ...rest }) => rest);
    setLastCompleted(null);
    setCurrentExIndex(index);
    const first = rows.findIndex((_, i) => isSetOutstanding(rows, i));
    setCurrentSetIndex(first >= 0 ? first : 0);
  };

  /** The swaps Finish asks about: those not decided yet with a set done. */
  const swapsToAsk = (finishing: SessionPrescription) =>
    (finishing.swaps ?? []).filter(
      (swap) =>
        swap.keep === undefined &&
        (setLogs[swap.index] ?? []).some(
          (set) => set.completed && set.type !== "warmup"
        )
    );

  /** Finish's one answer about today's swaps, then the save. */
  const decideSwaps = async (keep: boolean) => {
    const asked = new Set(swapsToAsk(prescription).map((swap) => swap.index));
    const decided: SessionPrescription = {
      ...prescription,
      swaps: (prescription.swaps ?? []).map((swap) =>
        asked.has(swap.index) ? { ...swap, keep } : swap
      ),
    };
    setPrescription(decided);
    setKeepQuestion((question) => ({ ...question, open: false }));
    await handleFinish(decided);
  };

  const finishPending = useRef(false);
  const handleFinish = async (decided?: SessionPrescription) => {
    if (finishPending.current || saved) return;
    const finishing = decided ?? prescription;
    // Asked once, before the save: whether to keep today's swaps.
    const asks = swapsToAsk(finishing);
    if (asks.length > 0) {
      setKeepQuestion({
        open: true,
        swaps: asks.map((swap) => ({
          today: day.exercises[swap.index]?.name ?? "",
          planned: plannedAt(swap.index)?.name ?? "",
        })),
      });
      return;
    }
    finishPending.current = true;
    setCompleting(true);
    const completionUid = user?.uid;

    try {
      completionPendingRef.current = true;
      setCompletionPending(true);
      const recoveryStored = saveDraft({
        dayIndex,
        dayName: day.dayName,
        setLogs,
        exerciseNotes,
        elapsedSeconds: sessionDurationMinutes * 60,
        currentExIndex,
        completionId: completionIdRef.current,
        completionCommandId: completionCommandIdRef.current,
        completionPending: true,
        startedAt: originalStartedAt,
        prescription: finishing,
        skippedRows,
        programmeContext: sessionProgrammeContext,
      });
      if (navigator.onLine === false && !recoveryStored) {
        throw new Error("Offline recovery storage is unavailable.");
      }
      // Pass the wall-clock duration + per-set logs so the saved workout
      // record reflects actual execution instead of planned placeholders.
      // The stable completionId makes a retry target the SAME workout doc.
      // Backlog #12: warm-ups are NOT logged work — see toCompletionSetLogs
      // for why this boundary matters and why it lives in a pure module.
      // Computed once: the command carries it, and the Plate-Club check
      // below scores exactly what the server will build from it.
      const completionLogs = toCompletionSetLogs(setLogs);
      const receipt = await onCompleteDay(dayIndex, {
        completionId: completionIdRef.current,
        completionCommandId: completionCommandIdRef.current,
        durationMinutes: sessionDurationMinutes,
        setLogs: completionLogs,
        sessionVariant,
        // Lift3: the doc is dated by when the session STARTED (draft-resume
        // aware — sessionStartedAt is backdated by the draft's elapsed time).
        startedAt: originalStartedAt,
        prescription: finishing,
        programmeContext: sessionProgrammeContext,
        ...(hardRunBefore?.(originalStartedAt) ? { afterHardRun: true } : {}),
        // These were written to the resume draft and dropped on Finish, so
        // they survived closing a session and were lost by completing one.
        // The draft is deleted the moment the workout commits, so Finish was
        // the last point at which they still existed.
        exerciseNotes,
      });

      // A callback from an outgoing account must never recreate its draft
      // after sign-out, mark the next user's session saved, or award a badge.
      if (completionUid && auth.currentUser?.uid !== completionUid) return;
      setSavedWorkoutId(receipt.workoutId);
      const queuedReceipt =
        receipt.syncStatus === "queued" ? receipt.sync : null;
      const acknowledge = () => {
        clearDraft(completionIdRef.current);
        setSaved(true);
        setSaveStatus("synced");
        if (firedPRs.size > 0) awardEventBadge("first_pr");
        // Plate-Club (60 / 100 / 140 kg on a compound) is decided here, on
        // the same completed sets the command just carried, so the seal
        // cracks now rather than after onWorkoutCreated's round-trip —
        // which was long enough for the owner to have left the screen. The
        // server still awards it; the transaction behind awardEventBadges
        // makes the second arrival a no-op whichever side that is.
        const lifts = liftWeightMilestoneBadges(
          exercisesForLiftBadges(day.exercises, completionLogs)
        );
        if (lifts.length > 0) awardEventBadges(lifts);
      };
      if (queuedReceipt) {
        setSaved(true);
        setSaveStatus("queued");
        void queuedReceipt.then((outcome) => {
          if (completionUid && auth.currentUser?.uid !== completionUid) return;
          if (outcome === "synced") acknowledge();
          else {
            setSaved(false);
            setSaveStatus("needs-attention");
            setShareAction(undefined);
          }
        });
      } else acknowledge();

      // Persist the best-lift map for history beyond the recent window.
      // Best-effort — the workout already committed above.
      const loadedRecords = loadedRecordsRef.current;
      if (user?.uid && loadedRecords && Object.keys(prMap).length > 0) {
        void (async () => {
          try {
            // Saved on this phone, not yet on the server: the commit is a
            // transaction, which cannot run offline, and waiting here for
            // the sync dies with the app. Closed first, the map stayed
            // complete without this session, so the next one celebrated a
            // best below a lift already logged. Marked stale now, it is
            // rebuilt from the whole history, which holds the queued
            // workout (`fetchSavedWorkouts` includes this phone's queue).
            if (auth.currentUser?.uid !== user.uid) return;
            if (queuedReceipt) {
              await markLiftRecordsStale(user.uid);
              return;
            }
            // From the FINAL set logs, so an undone set never inflates a
            // record. Warm-ups are not volume, and an exercise with none
            // of its working sets done was not trained.
            await commitLiftRecords(user.uid, loadedRecords, {
              map: prMap,
              lifts: setLogs.map((exSets, exIdx) => ({
                name: day.exercises[exIdx]?.name ?? "",
                repUnit: day.exercises[exIdx]?.repUnit,
                sets: exSets
                  .filter((s2) => s2.completed && s2.type !== "warmup")
                  .map((s2) => ({ weightKg: s2.weight, reps: s2.reps })),
              })),
              date: sessionDay,
            });
          } catch (err) {
            // The workout is saved; its records are not. The map would
            // stay complete at the revision the next session loads, which
            // would build on it without this session's sets, so it is
            // marked stale and rebuilt from the whole history instead.
            logger.warn("[WorkoutSession] lift records not saved", err);
            if (auth.currentUser?.uid !== user.uid) return;
            await markLiftRecordsStale(user.uid).catch((staleErr) =>
              logger.warn(
                "[WorkoutSession] lift records not marked stale",
                staleErr
              )
            );
          }
        })();
      }

      setShareAction(receipt.share);
    } catch (error) {
      // The core save failed. Do NOT clear the draft, reset set logs, close
      // the session, or mint a new completion id — the user taps the (now
      // re-enabled) Save button again and hits the exact same workout doc.
      logger.error("[WorkoutSession] finish failed:", error);
      setSaveStatus("needs-attention");
      toast.error(
        "Couldn't save your workout. Your completed session is still here, so try again."
      );
    } finally {
      finishPending.current = false;
      setCompleting(false);
    }
  };

  const handleStartFresh = () => {
    hasRecoveryDraft.current = false;
    hasEnteredValues.current = false;
    // A fresh start is the session as it was set out: the draft's swaps,
    // skips, added exercises and supersets go with its sets and notes, so
    // an empty workout starts empty again.
    const fresh = sessionPrescription(
      initialDay,
      initialCompletionId,
      progressionBaseline
    );
    setPrescription(fresh);
    setSkippedRows({});
    setSetLogs(buildInitialSetLogs(fresh.exercises, liftUnit));
    // Its rows start from last time, as a new session's do.
    weightsToFollow.current.clear();
    rowsToStart.current = new Set(
      fresh.exercises.map((ex, i) => rowKey(ex, i))
    );
    setRowsQueued((n) => n + 1);

    setExerciseNotes({});
    setCurrentExIndex(0);
    setCurrentSetIndex(0);
    const freshStart = Date.now();
    setSessionStartedAt(freshStart);
    setOriginalStartedAt(freshStart);
    stopRest();
    clearDraft();
    completionPendingRef.current = false;
    setCompletionPending(false);
    setShowResumePrompt(false);
  };

  /* The picker for "Add exercise", in add mode: as many as are ticked. */
  const addPicker = adding && (
    <Suspense fallback={null}>
      <ExercisePicker
        open
        headerTitle="Add exercise"
        onSelect={(picked) => addExercises([picked])}
        onMultiSelect={addExercises}
        onClose={() => setAdding(false)}
      />
    </Suspense>
  );
  const openAddPicker = () => {
    haptic("light");
    setAdding(true);
  };

  // A session with no exercises yet: an empty workout (Mob1 call 1), or a
  // day with nothing in it. Every render path below dereferences
  // `currentExercise`, so it has a screen of its own, whose one action is
  // to add the first exercise. Placed AFTER every hook: this file's own
  // header warns that gated early returns flipping between renders are the
  // classic cause of React error #310.
  if (day.exercises.length === 0) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 bg-background pt-[var(--safe-top)]" />
        }
      >
        <EmptySessionScreen
          title={dayLabel ?? liftDayLine(day.dayName)}
          onClose={onClose}
          onAdd={openAddPicker}
        >
          {addPicker}
        </EmptySessionScreen>
      </Suspense>
    );
  }

  // Session complete screen
  if (sessionComplete) {
    return (
      <>
        <SessionCompleteScreen
          dayName={dayLabel ?? day.dayName}
          exercises={day.exercises}
          setLogs={setLogs}
          firedPRs={firedPRs}
          prResults={prResults}
          sessionDurationMinutes={sessionDurationMinutes}
          sessionVariant={sessionVariant}
          completing={completing}
          saved={saved}
          saveStatus={saveStatus}
          planContext={planContext}
          share={shareAction}
          onFinish={() => void handleFinish()}
          onEdit={
            !completionPending ? () => setSessionComplete(false) : undefined
          }
          onClose={onClose}
          onViewWorkout={
            savedWorkoutId && onViewWorkout
              ? () => onViewWorkout(savedWorkoutId)
              : undefined
          }
        />
        <KeepSwapSheet
          open={keepQuestion.open}
          swaps={keepQuestion.swaps}
          onDecide={decideSwaps}
          onClose={() =>
            setKeepQuestion((question) => ({ ...question, open: false }))
          }
        />
      </>
    );
  }

  const draftCompletedSets = initialDraft
    ? initialDraft.setLogs.reduce(
        (sum, exSets) => sum + exSets.filter((s) => s.completed).length,
        0
      )
    : 0;

  // The guide's first-set hint (FV1): an account's first workout, before
  // any set is done, while nothing sits over the rows.
  const anySetDone = setLogs.some((sets) => sets.some((set) => set.completed));

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[var(--safe-top)] safe-area-pb">
      <GuideHint
        id="first-set"
        layer="session"
        placement="bottom"
        when={
          firstWorkout &&
          currentExIndex === 0 &&
          !anySetDone &&
          !showResumePrompt &&
          !editingSet &&
          !rest
        }
        body={autoRest ? undefined : FIRST_SET_BODY_NO_AUTO_REST}
      />
      {editingSet && (
        <EditSetSheet
          set={setLogs[editingSet.exIdx][editingSet.setIdx]}
          setName={lowerFirst(
            setName(setLogs[editingSet.exIdx], editingSet.setIdx)
          )}
          timed={day.exercises[editingSet.exIdx]?.repUnit === "seconds"}
          unit={liftUnit}
          exerciseId={day.exercises[editingSet.exIdx]?.exerciseId}
          onSave={saveSetCorrection}
          onClose={() => setEditingSet(null)}
        />
      )}
      {showResumePrompt && initialDraft && (
        <Dialog
          open
          onClose={onClose}
          title="Resume workout?"
          description="You left this workout in progress earlier."
          size="md"
          position="bottom"
          overlayClassName="z-[60]"
          className="z-[60] max-h-[calc(100dvh-2rem)] overflow-y-auto"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-mono tabular-nums">
                {draftCompletedSets}
              </span>{" "}
              sets logged
            </span>
            <span>·</span>
            <span>
              <span className="font-mono tabular-nums">
                {formatElapsed(initialDraft.elapsedSeconds)}
              </span>{" "}
              elapsed
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => setShowResumePrompt(false)}
            >
              Resume
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleStartFresh}
            >
              Start fresh
            </Button>
          </div>
        </Dialog>
      )}

      {/* Top Bar — the day named as Train names it ("Pull B"), never its
          stored name. A routine's own name reads as written. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/50">
        <div className="min-w-0">
          {/* The session's title is the screen's heading, so a screen
              reader finds where it is from. A heading by role rather than
              an h1 element: the global h1 rule in index.css is unlayered,
              so it would beat this line's own leading and tracking. */}
          <p
            role="heading"
            aria-level={1}
            className="truncate text-base font-bold text-foreground"
          >
            {dayLabel ?? liftDayLine(day.dayName)}
          </p>
          <WorkoutProgress
            key={sessionStartedAt}
            startedAt={sessionStartedAt}
            completed={totalSetsCompleted}
            total={totalSetsTotal}
          />
        </div>
        {/* Finish sits by Close, as Hevy and Strong put it (an owner
            call, DESIGN_GUIDE §8): under the set action it took a row
            from the list on every set after the first. Offered once a working set is
            done and while sets remain; when none remain, the bar's own
            "Finish workout" takes over, so there is one Finish at a
            time. It goes straight to the review, which is the check: the
            review counts the sets left unticked and has Edit workout to go
            back for them, so a dialog asking first was a second check on a
            step that can be undone. */}
        <div className="flex shrink-0 items-center gap-1">
          {finishEarlyOffered && (
            <Button
              variant="secondary"
              className={SECONDARY_ON_CARD_EDGE}
              aria-label="Finish workout"
              onClick={completeSession}
            >
              Finish
            </Button>
          )}
          <IconButton
            variant="ghost"
            aria-label="Close workout"
            onClick={onClose}
            icon={<X className="size-5 text-muted-foreground" />}
          />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{
            width: `${totalSetsTotal > 0 ? (totalSetsCompleted / totalSetsTotal) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Exercise navigation pills: the last of the fixed part, so its
          edge is where the list scrolls under. */}
      <div className="relative border-b border-border/30">
        <div
          ref={tabsRef}
          data-no-page-swipe
          className="flex gap-2 px-4 py-2 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {day.exercises.map((ex, i) => {
            const setsForEx = setLogs[i] ?? [];
            const skipped = skippedRows[i] !== undefined;
            const done = !skipped && isExerciseDone(setsForEx);
            const active = i === currentExIndex;
            /* DS3: the session's exercises as their drawings, in order.
               The current one is ringed, a finished one carries a check,
               and the full name is the button's name for assistive tech
               however the label below truncates. */
            return (
              <button
                type="button"
                key={i}
                aria-label={
                  skipped
                    ? `${ex.name}, skipped`
                    : done
                      ? `${ex.name}, done`
                      : ex.name
                }
                aria-current={active ? "step" : undefined}
                onClick={() => {
                  haptic(10);
                  setCurrentExIndex(i);
                  const nextIncomplete = setsForEx.findIndex((_, si) =>
                    isSetOutstanding(setsForEx, si)
                  );
                  setCurrentSetIndex(nextIncomplete >= 0 ? nextIncomplete : 0);
                }}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl pb-1 pt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className={cn(
                    "relative rounded-xl",
                    active &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                >
                  <ExerciseThumb
                    exerciseId={ex.exerciseId}
                    className={cn((done || skipped) && !active && "opacity-60")}
                  />
                  {done && (
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary-strong text-primary-foreground ring-2 ring-background">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  {skipped && (
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background">
                      <SkipForward className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                {/* Up to three lines: cut to one, "Barbell Row" and
                    "Barbell Curl" both read "Barbell…", and cut to two,
                    "Straight-Arm Pulldown" reads "Straight-Arm…". */}
                <span
                  className={cn(
                    "line-clamp-3 w-full text-center text-xs leading-tight break-words",
                    active
                      ? "font-bold text-foreground"
                      : "font-medium text-muted-foreground"
                  )}
                >
                  {ex.name}
                </span>
              </button>
            );
          })}
        </div>
        {/* Overflow-aware edge fades (visual-audit wave1 #5). The left fade
            appears once the rail has been scrolled away from the start; the
            right fade hints at more pills off-screen and hides at the end.
            Both stay hidden when the rail fits. Opacity toggle only animates
            for motion-safe users. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-background to-transparent motion-safe:transition-opacity",
            railAtStart ? "opacity-0" : "opacity-100"
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent motion-safe:transition-opacity",
            railAtEnd ? "opacity-0" : "opacity-100"
          )}
        />
      </div>

      {/* Main content area */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 motion-safe:scroll-smooth"
      >
        {/* Exercise name + set counter, at the head of the list (an
            owner call, DESIGN_GUIDE §8): fixed above it, they took about
            110 px of a phone from the sets for the whole session. They scroll away as the
            sets below are reached, and an exercise change brings them
            back. DS3: the exercise's drawing beside its name, where a bare
            dumbbell icon sat. Under 19em of row (a 320px phone, or larger
            text on the phone), the drawing gives its room to the name, which beside it pushed
            the form guide's button off the screen, and the name's two
            buttons drop under it when beside it they would squeeze a word
            ("Bench" at 2x on a 320px phone) out of its box. Wide-first. */}
        <div ref={headerRef} className="@container flex items-start gap-3 pt-3">
          {currentExercise && (
            <ExerciseThumb
              exerciseId={currentExercise.exerciseId}
              size="lg"
              className="@max-[19em]:hidden"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 @max-[19em]:flex-wrap">
              <h2 className="min-w-0 text-h3 font-bold leading-tight tracking-tight text-foreground text-balance">
                {currentExercise?.name}
              </h2>
              {currentExercise?.name && (
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    aria-label={`How to do ${currentExercise.name}`}
                    variant="ghost"
                    icon={<Info className="size-5 text-muted-foreground" />}
                    onClick={() => {
                      haptic("light");
                      setShowFormGuide(true);
                    }}
                  />
                  <IconButton
                    aria-label={`More for ${currentExercise.name}`}
                    variant="ghost"
                    icon={
                      <MoreHorizontal className="size-5 text-muted-foreground" />
                    }
                    onClick={() => {
                      haptic("light");
                      setMenuFor(safeExIndex);
                    }}
                  />
                </div>
              )}
            </div>
            {supersetLine && (
              <p className="text-sm font-medium text-lifting-strong">
                {supersetLine}
              </p>
            )}
            {skippedRows[safeExIndex] !== undefined && (
              <p className="text-sm text-muted-foreground">Skipped today</p>
            )}
            {currentSets[currentSetIndex] &&
              (() => {
                /* Counted within its kind: "Warm-up 2 of 3" during the ramp,
                   then "Set 1 of 3", not "Set 4 of 6". */
                const counts = setCounts(currentSets, currentSetIndex);
                const warm = currentSets[currentSetIndex].type === "warmup";
                return (
                  <p className="text-sm text-muted-foreground">
                    {warm ? "Warm-up" : "Set"}{" "}
                    <span className="font-mono tabular-nums">
                      {setOrdinal(currentSets, currentSetIndex)}
                    </span>{" "}
                    of{" "}
                    <span className="font-mono tabular-nums">
                      {counts.total}
                    </span>{" "}
                    ·{" "}
                    <span className="font-mono tabular-nums">
                      {counts.done}
                    </span>{" "}
                    done
                  </p>
                );
              })()}
            {/* Backlog #4 — effort cue as words (operator-approved copy set).
              Reserve cue expands via Tooltip; push/deload cues are plain
              lines. Guidance lives BEFORE the set, never as a verdict after
              it (voice doc: never shame). */}
            {(() => {
              if (!currentExercise) return null;
              const lastCounted = currentSets.reduce(
                (last, set, i) => (set.type !== "warmup" ? i : last),
                -1
              );
              const cue = effortCueFor(currentExercise, {
                isLastSet: currentSetIndex >= lastCounted,
                deloadWeek,
              });
              if (!cue) return null;
              if (cue.tooltip) {
                return (
                  <Tooltip content={<p>{cue.tooltip}</p>}>
                    <button
                      type="button"
                      className="min-h-11 -mb-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
                    >
                      {cue.text}
                    </button>
                  </Tooltip>
                );
              }
              return (
                <p className="mt-1 text-xs text-muted-foreground">{cue.text}</p>
              );
            })()}
          </div>
        </div>

        {/* The last note on this exercise stays above the sets: it is
            usually a setting to read before lifting ("Level 8, 6.0
            incline"). Today's note is written under the sets. */}
        {previousNotes[currentExIndex] && (
          <div className="text-sm text-muted-foreground">
            <p className="text-xs">
              Last note ·{" "}
              <InlineNumerals>
                {formatDayMonthYear(
                  new Date(`${previousNotes[currentExIndex].date}T12:00:00`)
                )}
              </InlineNumerals>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {previousNotes[currentExIndex].text}
            </p>
            {!exerciseNotes[currentExIndex]?.trim() && (
              <Button
                variant="ghost"
                onClick={() => {
                  hasEnteredValues.current = true;
                  setExerciseNotes((prev) => ({
                    ...prev,
                    [currentExIndex]: previousNotes[currentExIndex].text,
                  }));
                  notesInputRef.current?.focus();
                }}
              >
                Use and edit note
              </Button>
            )}
          </div>
        )}

        {/* Set logging grid — the screen's one big thing (DS3). A row is
            the set's badge (its number, or W, D or F, and the way into its
            type), the same set last time, weight, reps and the tick. A
            done set says so with its green tick, on the card's own colour,
            and the row being logged is the table's one tinted row (an
            owner call, in DESIGN_GUIDE's set-table note: a table of green
            rows was the loudest thing on the screen, and done sets are the
            least of what it asks for).

            Under 19em of card (larger text on the phone, and a 320px phone
            already at the designed size) the five columns do not fit:
            "Previous" cut "80 × 8" to "80 …" and the weight to "32.".
            There the row keeps four columns and the same
            set last time goes on a line of its own under the weight and
            reps, still a tap to fill. Wide-first, so a browser without
            container queries keeps the five. The badge, the tick and the
            plate button stay 44px, as iOS keeps a control's size, which
            leaves the larger figures their room. */}
        <Card padded={false} className="@container overflow-hidden">
          {(() => {
            const lastSets = previousSets[currentExIndex];
            const lastPerformance = currentExercise?.lastPerformance;
            const equipment = currentExercise
              ? getExerciseById(currentExercise.exerciseId)?.equipment
              : undefined;
            const isBWExercise = equipment === "Bodyweight";
            const isTimedExercise = currentExercise?.repUnit === "seconds";
            // An empty weight on a loaded lift is a blank to fill, not a
            // 0 to accept: the tick asks for a weight there.
            const emptyWeight = isBWExercise
              ? "BW"
              : needsLoad(equipment) && !isTimedExercise
                ? "–"
                : "0";
            const columns =
              "grid grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1.25fr)_minmax(0,1fr)_44px] @max-[19em]:grid-cols-[44px_minmax(0,1.25fr)_minmax(0,1fr)_44px] items-center gap-x-[8px]";

            return (
              <>
                {/* Column headers keep capitals, one of the two places
                    DESIGN_GUIDE §4 sets text in them. */}
                <div
                  className={cn(
                    columns,
                    "px-3 pt-3 pb-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  <div className="text-center">Set</div>
                  <div className="min-w-0 text-center @max-[19em]:hidden">
                    Previous
                  </div>
                  <div className="flex items-center justify-center">
                    {liftUnitLabel(liftUnit)}
                    {isBarbell && (
                      <button
                        type="button"
                        aria-label="Plate calculator"
                        onClick={() => {
                          haptic("light");
                          setShowPlates(true);
                        }}
                        className="-my-3 flex size-[44px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Disc className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="text-center">
                    {isTimedExercise ? "Seconds" : "Reps"}
                  </div>
                  <div className="sr-only">Done</div>
                </div>
                {currentSets.map((set, setIdx) => {
                  const type = asSetType(set.type);
                  const name = setName(currentSets, setIdx);
                  /* PREVIOUS is the same counted set last session. A warm-up
                     has none: captioned with a working set, each ramp row
                     invited loading the top set as the first warm-up. With
                     no saved session yet, the programme's last figure
                     stands in for every working row. */
                  const prior =
                    type === "warmup"
                      ? undefined
                      : lastSets
                        ? lastSets[setOrdinal(currentSets, setIdx) - 1]
                        : (lastPerformance ?? undefined);
                  const priorLabel = previousLabel(
                    prior,
                    isTimedExercise,
                    isBWExercise,
                    liftUnit,
                    currentExercise.exerciseId
                  );
                  const canFill = prior != null && priorLabel != null;
                  const isBest = [...prResults.values()].some(
                    (result) =>
                      result.kind === "best" &&
                      result.setKey === `${currentExIndex}:${setIdx}`
                  );
                  return (
                    <div
                      key={setIdx}
                      data-set-row={setIdx}
                      className={
                        setIdx === 0
                          ? "scroll-mt-12 scroll-mb-4"
                          : "scroll-my-4"
                      }
                    >
                      <div
                        className={cn(
                          columns,
                          "border-t border-border/40 px-3 py-1.5 transition-colors",
                          !set.completed &&
                            setIdx === currentSetIndex &&
                            "bg-primary/10"
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`${name}${
                            type === "dropset" || type === "failure"
                              ? `, ${lowerFirst(SET_TYPE_COPY[type].name)}`
                              : ""
                          }. Change set type`}
                          aria-haspopup="dialog"
                          onClick={() => {
                            haptic(10);
                            setTypeSheet(setIdx);
                          }}
                          className="mx-auto flex size-[44px] items-center justify-center rounded-xl transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
                        >
                          <SetTypeChip
                            type={type}
                            label={setBadge(currentSets, setIdx)}
                            className="h-[32px] w-auto min-w-[32px] px-1"
                          />
                        </button>
                        {priorLabel === null ? (
                          <span
                            className="block text-center text-small text-muted-foreground @max-[19em]:hidden"
                            aria-hidden="true"
                          >
                            —
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Last time ${priorLabel}. Use it for ${lowerFirst(name)}`}
                            onClick={() => {
                              if (!canFill || set.completed || !prior) return;
                              haptic(10);
                              if (!isTimedExercise && prior.weight > 0) {
                                updateSetLog(
                                  currentExIndex,
                                  setIdx,
                                  "weight",
                                  prior.weight
                                );
                              }
                              updateSetLog(
                                currentExIndex,
                                setIdx,
                                "reps",
                                prior.reps
                              );
                            }}
                            disabled={set.completed || !canFill}
                            className={cn(
                              "min-h-[44px] w-full truncate text-center text-small font-mono tabular-nums",
                              // Its own line under the weight and reps.
                              "@max-[19em]:col-span-2 @max-[19em]:col-start-2 @max-[19em]:row-start-2 @max-[19em]:min-h-[32px] @max-[19em]:text-left",
                              // Grey like the rest of the row's history, not
                              // a column of purple: still a tap to fill.
                              "text-muted-foreground",
                              canFill && !set.completed && "active:opacity-70"
                            )}
                          >
                            <span className="hidden @max-[19em]:inline font-sans">
                              Last{" "}
                            </span>
                            {priorLabel}
                          </button>
                        )}
                        {/* A done set's numbers stay at full strength: they
                            are the record of the set. The global rule dims
                            every disabled input to half (the trailing `!`
                            outranks it, since it sits outside the layers)
                            and iOS greys disabled text, so both are undone
                            on these two inputs. */}
                        <input
                          type="number"
                          inputMode="decimal"
                          value={
                            kitLoadIn(
                              set.weight,
                              liftUnit,
                              currentExercise.exerciseId
                            ) || ""
                          }
                          placeholder={set.weight === 0 ? emptyWeight : ""}
                          aria-label={`${name} weight`}
                          onChange={(e) =>
                            updateSetLog(
                              currentExIndex,
                              setIdx,
                              "weight",
                              kitLoadToKg(
                                Number(e.target.value) || 0,
                                liftUnit,
                                currentExercise.exerciseId
                              )
                            )
                          }
                          disabled={set.completed}
                          className={cn(
                            FIELD_EDGE,
                            "min-h-[44px] w-full rounded-lg bg-muted px-1 text-center text-lg font-semibold font-figure tabular-nums text-foreground placeholder:text-muted-foreground disabled:bg-transparent disabled:opacity-100! disabled:[-webkit-text-fill-color:currentColor] disabled:border-transparent"
                          )}
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.reps || ""}
                          aria-label={`${name} ${
                            isTimedExercise ? "seconds" : "reps"
                          }`}
                          onChange={(e) =>
                            updateSetLog(
                              currentExIndex,
                              setIdx,
                              "reps",
                              Number(e.target.value) || 0
                            )
                          }
                          disabled={set.completed}
                          className={cn(
                            FIELD_EDGE,
                            "min-h-[44px] w-full rounded-lg bg-muted px-1 text-center text-lg font-semibold font-figure tabular-nums text-foreground disabled:bg-transparent disabled:opacity-100! disabled:[-webkit-text-fill-color:currentColor] disabled:border-transparent"
                          )}
                        />
                        {/* Keyed by exercise as well as set: a return to an
                            earlier exercise remounts its checks, so only a
                            set ticked on screen pops (Pol1). */}
                        <SetCheck
                          key={`${currentExIndex}:${setIdx}`}
                          completed={set.completed}
                          editLabel={`Edit completed ${lowerFirst(name)}`}
                          best={isBest}
                          guideAnchor={
                            firstWorkout &&
                            currentExIndex === 0 &&
                            setIdx === currentSetIndex
                              ? "first-set"
                              : undefined
                          }
                          onComplete={() => void completeSet(setIdx)}
                          onEdit={() => {
                            haptic();
                            setEditingSet({
                              exIdx: currentExIndex,
                              setIdx,
                            });
                          }}
                        />
                      </div>
                      {/* Pick effort before completion so it reaches the
                          progression call made when the final set is logged. */}
                      {showRPE && !set.completed && set.type !== "warmup" && (
                        /* Ratings keep full touch targets and wrap as text
                           grows. Revealing them records no effort until
                           the lifter chooses one. */
                        <div
                          data-rpe-row
                          className="space-y-1 border-t border-border/30 bg-muted/30 px-3 py-1.5"
                        >
                          <SegmentedControl
                            ariaLabel={`RPE for ${lowerFirst(name)}`}
                            value={set.rpe ?? null}
                            layout="wrap"
                            tone="lifting"
                            options={RPE_OPTIONS.map((rpe) => ({
                              value: rpe,
                              label: rpe,
                            }))}
                            onChange={(rpe) => {
                              haptic(10);
                              updateSetRPE(currentExIndex, setIdx, rpe);
                            }}
                            className="grid grid-cols-5 gap-1 @max-[14rem]:grid-cols-3 [&_button]:min-w-[44px] [&_button]:px-1 [&_button]:text-xs [&_button]:font-mono [&_button]:tabular-nums"
                          />
                          {typeof set.rpe === "number" && (
                            <div className="flex flex-wrap items-center justify-between gap-x-2">
                              <span className="pl-1 text-xs text-muted-foreground">
                                <span className="font-mono tabular-nums">
                                  {set.rpe}
                                </span>{" "}
                                · {rpeReserveWords(set.rpe)}
                              </span>{" "}
                              <Button
                                variant="ghost"
                                className="px-2 text-xs text-muted-foreground"
                                aria-label={`Clear RPE for ${lowerFirst(name)}`}
                                onClick={(event) => {
                                  haptic(10);
                                  event.currentTarget
                                    .closest("[data-rpe-row]")
                                    ?.querySelector<HTMLButtonElement>(
                                      '[role="radio"]'
                                    )
                                    ?.focus();
                                  updateSetRPE(
                                    currentExIndex,
                                    setIdx,
                                    undefined
                                  );
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}

          {/* The table's two controls share its foot: a set to add, and
              the RPE row under each set. They wrap rather than squeeze a
              label at larger text sizes. */}
          <div className="flex flex-wrap gap-2 border-t border-border/40 p-3">
            <Button
              variant="secondary"
              size="sm"
              className={cn("min-w-fit flex-1", SECONDARY_ON_CARD_EDGE)}
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => addSet(currentExIndex)}
            >
              Add set
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => setShowRPE(!showRPE)}
            >
              {showRPE ? "Hide RPE" : "Show RPE"}
            </Button>
          </div>
        </Card>

        {/* What the plan asks of this exercise, as the table's caption:
            under it, at its left edge, in one block. Centred at the
            bottom of the list, under Up next, these lines read as loose
            notes rather than the numbers for the sets above. */}
        {currentExercise && (
          <div className="-mt-2 space-y-0.5 px-1 text-xs text-muted-foreground">
            <p>
              Target: {currentExercise.sets}&times;
              {formatRepTarget(currentExercise)}
              {targetLoad(currentExercise, liftUnit)}
            </p>
            <LoweredLine exercise={currentExercise} />
            <StretchedLine exercise={currentExercise} />
            {/* The plates for each side of the bar, in the lifter's unit. */}
            {plateLoad && plateLoad.perSide.length > 0 && (
              <p className="font-mono tabular-nums">
                {plateLoad.perSide
                  .flatMap(({ plate, count }) =>
                    Array<number>(count).fill(plate)
                  )
                  .join(" + ")}{" "}
                {liftUnitLabel(liftUnit)} a side
                {plateLoad.remainder > 0 &&
                  ` · ${plateLoad.remainder} ${liftUnitLabel(liftUnit)} short`}
              </p>
            )}
          </div>
        )}

        {/* Today's note, under the sets (DS3): an empty field above the
            table pushed the last set below the fold on a small phone. */}
        <input
          ref={notesInputRef}
          type="text"
          placeholder="Add a note for next time"
          aria-label="Exercise notes"
          value={exerciseNotes[currentExIndex] || ""}
          onChange={(e) => {
            hasEnteredValues.current = true;
            setExerciseNotes((prev) => ({
              ...prev,
              [currentExIndex]: e.target.value,
            }));
          }}
          className="ds-input min-h-11 w-full text-sm"
        />

        {/* A set's type, as Hevy and MacroFactor ask it: tap the set's
            badge and pick. Each type says what it does here, because the
            letters alone told nobody why a W row was there. */}
        {typeSheet !== null && currentSets[typeSheet] && (
          <BottomSheet
            open
            onOpenChange={(open) => {
              if (!open) setTypeSheet(null);
            }}
            title="Set type"
            description={setName(currentSets, typeSheet)}
            className="z-[70]"
            overlayClassName="z-[60]"
          >
            <div className="space-y-1 px-2 pb-4">
              {SET_TYPE_ORDER.map((type) => {
                const selected =
                  asSetType(currentSets[typeSheet].type) === type;
                const preview = currentSets.map((entry, i) =>
                  i === typeSheet ? { ...entry, type } : entry
                );
                return (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={selected}
                    onClick={() => {
                      changeSetType(currentExIndex, typeSheet, type);
                      setTypeSheet(null);
                      haptic(10);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted",
                      // An outline, not a fill: the working set's chip is the
                      // muted fill, and vanished into a muted row.
                      selected &&
                        "bg-primary/5 ring-1 ring-inset ring-primary/40"
                    )}
                  >
                    <SetTypeChip
                      type={type}
                      label={setBadge(preview, typeSheet)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-foreground">
                        {SET_TYPE_COPY[type].name}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {SET_TYPE_COPY[type].detail}
                      </span>
                    </span>
                    {selected && (
                      <Check
                        className="mt-1.5 size-5 shrink-0 text-primary-strong"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
              {/* The inverse of "Add set", in the sheet that set already
                  has. Offered only for a removable extra, so the normal
                  case gains no control. */}
              {extraSetIndex(currentExIndex) === typeSheet && (
                <button
                  type="button"
                  onClick={() => {
                    removeSet(currentExIndex, typeSheet);
                    setTypeSheet(null);
                    haptic(10);
                  }}
                  className="flex w-full min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-semibold text-destructive-strong transition-colors hover:bg-muted"
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                  Remove set
                </button>
              )}
            </div>
          </BottomSheet>
        )}

        {/* Undo last set. Deliberately NOT the warning register: `--warning`
            resolves to amber in dark and to within one RGB unit of the
            nutrition/food identity orange in light, so painting undo with it
            put a food colour on a lifting surface AND told the user something
            had gone wrong. Undoing a mis-tapped set is a benign low-emphasis
            action — `secondary` per the Button-variant table, routed through
            the primitive so it inherits the 44px floor, the focus ring and the
            0.97 press instead of hand-rolling them. */}
        <AnimatePresence>
          {lastCompleted && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-auto"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUndo}
                leftIcon={<RotateCcw className="size-3.5" />}
              >
                Undo last set
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* What comes after this exercise (DS3): the next one with sets
            left, in session order from here, so the lifter can set up for
            it during the last rest. Nothing when this is the last. */}
        {upNext && (
          <Card size="compact" tone="muted" className="space-y-2">
            <SectionLabel>Up next</SectionLabel>
            <ExerciseRowSummary exercise={upNext} thumbSize="sm" />
          </Card>
        )}

        {/* Another exercise, for today only (Mob1 call 1): it joins the
            end of the session and leaves the plan as it is. */}
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={openAddPicker}
        >
          Add exercise
        </Button>
      </div>

      {/* Docked above the bar, not in the scroll: it takes its room from
          the bottom of the list, so it is whole on screen however long
          the table is, and nothing above it moves under the thumb that
          just ticked the set. */}
      <NewBestMoment
        moment={newBest}
        onUndo={
          newBest &&
          lastCompleted &&
          `${lastCompleted.exIdx}:${lastCompleted.setIdx}` === newBest.setKey
            ? handleUndo
            : undefined
        }
        className="mx-4 mb-3"
      />

      {/* The rest timer docks here too, under the new best when a set
          earns one (Pol1). A row in the header would push the exercise strip
          and the set table down 61 px the moment a set is ticked. One key
          for every rest, so a set completed during a rest swaps the
          countdown inside the card rather than sending one card out as
          another comes in. With auto-start off (D-LIFT-16) the manual
          start waits in the same place, so starting a rest moves nothing
          either. */}
      <p role="status" className="sr-only">
        <span key={restWords.line}>{restWords.words}</span>
      </p>
      <AnimatePresence initial={false}>
        {rest ? (
          <motion.div
            key="rest"
            initial={reduceMotion ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="mx-4 mb-3 shrink-0"
          >
            <WorkoutRestTimer
              key={rest.id}
              startedAt={rest.startedAt}
              initialTarget={rest.target}
              exerciseName={day.exercises[currentExIndex]?.name}
              onStop={stopRest}
              onAnnounce={announceRest}
            />
          </motion.div>
        ) : !autoRest && currentSets.some((st) => st.completed) ? (
          <div key="start-rest" className="mx-4 mb-3 flex justify-center">
            <Button
              variant="secondary"
              leftIcon={<Timer className="size-4" aria-hidden="true" />}
              onClick={() => {
                haptic("light");
                // The rest after the set just done: the last ticked row.
                const lastDone = [...currentSets]
                  .reverse()
                  .find((st) => st.completed);
                startRest(
                  day.exercises[currentExIndex],
                  lastDone?.type === "warmup"
                );
              }}
            >
              Start rest timer
            </Button>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        {(() => {
          const allSetsComplete = isExerciseDone(currentSets);
          const next = nextIncompleteSet(setLogs, currentExIndex);

          /* DS3: the bar's three states through the Button primitive, in
             sentence case. Finish is the lifting CTA like the other two:
             green is for status (a done set's check), not for actions. */
          if (allSetsComplete && !next) {
            return (
              <Button
                size="lg"
                fullWidth
                // Everything skipped with nothing done leaves nothing to save.
                disabled={
                  !setLogs.some((sets) =>
                    sets.some((set) => set.completed && set.type !== "warmup")
                  )
                }
                onClick={completeSession}
                leftIcon={<Trophy className="size-4" aria-hidden="true" />}
              >
                Finish workout
              </Button>
            );
          }
          if (allSetsComplete) {
            return (
              <Button
                size="lg"
                fullWidth
                onClick={() => {
                  if (next) {
                    setCurrentExIndex(next.exerciseIndex);
                    setCurrentSetIndex(next.setIndex);
                  }
                }}
                leftIcon={<Play className="size-4" aria-hidden="true" />}
              >
                Next exercise
              </Button>
            );
          }
          return (
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                stopRest();
                void completeSet();
              }}
              disabled={
                !currentSets[currentSetIndex] ||
                currentSets[currentSetIndex]?.completed
              }
              leftIcon={<Check className="size-4" aria-hidden="true" />}
            >
              {/* One span, so the Button's gap cannot open between the
                  words and the number. */}
              {currentSets[currentSetIndex] ? (
                <span>
                  Complete{" "}
                  {currentSets[currentSetIndex].type === "warmup"
                    ? "warm-up"
                    : "set"}{" "}
                  <span className="font-mono tabular-nums">
                    {setOrdinal(currentSets, currentSetIndex)}
                  </span>
                </span>
              ) : (
                "Complete set"
              )}
            </Button>
          );
        })()}
      </div>

      <ConfirmDialog
        open={askingJump}
        title={jumpQuestion?.warn.title ?? ""}
        description={jumpQuestion?.warn.message}
        confirmLabel={jumpQuestion?.warn.confirmLabel}
        cancelLabel="Change it"
        onCancel={() => {
          setAskingJump(false);
          if (jumpQuestion?.exIdx === currentExIndex)
            setCurrentSetIndex(jumpQuestion.setIdx);
        }}
        onConfirm={() => {
          setAskingJump(false);
          if (jumpQuestion?.exIdx === currentExIndex)
            void completeSet(jumpQuestion.setIdx, true);
        }}
      />

      {menuFor !== null && day.exercises[menuFor] && (
        <Suspense fallback={null}>
          <ExerciseMenuSheet
            open
            onClose={() => setMenuFor(null)}
            exerciseName={day.exercises[menuFor].name}
            nothingDone={!(setLogs[menuFor] ?? []).some((set) => set.completed)}
            swappedFor={swapAt(menuFor) ? plannedAt(menuFor)?.name : undefined}
            skipped={skippedRows[menuFor] !== undefined}
            // An exercise added today stands in for nothing: there is no
            // planned lift to swap it for.
            onSwap={plannedAt(menuFor) ? () => setSwapFor(menuFor) : undefined}
            onSwapBack={() => {
              const planned = plannedAt(menuFor);
              if (planned) swapForToday(menuFor, planned.exerciseId);
            }}
            onSkip={() => skipExercise(menuFor)}
            session={{
              exercises: day.exercises,
              supersets: prescription.supersets,
              index: menuFor,
            }}
            onSuperset={(withNext) => regroup(menuFor, withNext)}
            onUnskip={() => unskipExercise(menuFor)}
          />
        </Suspense>
      )}

      {swapFor !== null && day.exercises[swapFor] && (
        <Suspense fallback={null}>
          <ExercisePicker
            open
            headerTitle={`Swap ${day.exercises[swapFor].name} for today`}
            pickAction="Swap for today"
            currentExerciseId={day.exercises[swapFor].exerciseId}
            onSelect={(picked) => {
              swapForToday(swapFor, picked.id);
              setSwapFor(null);
            }}
            onClose={() => setSwapFor(null)}
          />
        </Suspense>
      )}
      {addPicker}

      <PlateCalculatorSheet
        open={showPlates}
        onClose={() => setShowPlates(false)}
        weightKg={
          currentSets[currentSetIndex]?.weight ||
          currentSets.find((st) => st.weight > 0)?.weight ||
          0
        }
      />

      {currentExercise?.name && (
        <ExerciseFormSheet
          exerciseName={currentExercise.name}
          open={showFormGuide}
          onOpenChange={setShowFormGuide}
          compactGuide
        />
      )}
    </div>
  );
}
