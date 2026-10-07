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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import ExerciseRowSummary from "@/components/program/ExerciseRowSummary";
import LoweredLine from "@/components/program/LoweredLine";
import EditSetSheet from "@/components/workout/EditSetSheet";
import SetTypeChip from "@/components/workout/SetTypeChip";
import { sessionRecords } from "@/features/program/sessionRecords";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { motion, AnimatePresence } from "framer-motion";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { lastSetsByExercise } from "@/features/program/lastSets";
import { startingSetRows } from "@/features/program/setStartValues";
import { swappedForToday } from "@/features/program/sessionSwap";
import { followedWeight } from "@/features/program/sessionSets";
import { loadContextFrom } from "@/features/program/startingLoads";
import ExerciseMenuSheet from "@/components/workout/ExerciseMenuSheet";
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
import { restSecondsFor } from "@/features/program/restTime";
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
  type LiftRecords,
} from "@/lib/liftRecordsStore";
import { effortCueFor, rpeReserveWords } from "@/features/program/effortCue";
import Tooltip from "@/components/ui/Tooltip";
import PlateCalculatorSheet from "@/components/workout/PlateCalculatorSheet";
import { validateSet } from "@/lib/setValidation";
import { getExerciseById } from "@/lib/exercises";
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
import { platesPerSide } from "@/lib/plateMath";
import {
  useWorkoutDraft,
  computeDraftIdentity,
  createWorkoutCompletionId,
} from "@/hooks/useWorkoutDraft";
import { logger } from "@/lib/logger";
import { useScrollEdges } from "@/hooks/useScrollEdges";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import WorkoutProgress from "@/components/workout/WorkoutProgress";
import WorkoutRestTimer from "@/components/workout/WorkoutRestTimer";
import NewBestMoment, {
  type NewBest,
} from "@/components/workout/NewBestMoment";
import { elapsedSecondsSince } from "@/hooks/useElapsedSeconds";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { localDateString } from "@/lib/dateHelpers";
import type { SessionShareAction } from "@/lib/sessionPost";
import type { LiftCompletionReceipt } from "@/lib/liftCompletion";
import GuideHint from "@/components/guide/GuideHint";
import { FIRST_SET_BODY_NO_AUTO_REST } from "@/lib/firstGuide";
// Form guide is heavy (react-body-highlighter) — lazy-load so it only hydrates
// when the user opens the "How to" sheet mid-workout (D-LIFT-14).
const ExerciseFormContent = lazyRetry(
  () => import("@/components/ExerciseFormContent")
);
// The exercise list for "Swap for today", loaded when it is opened.
const ExercisePicker = lazyRetry(
  () => import("@/components/program/ExercisePicker")
);

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

/** "Set 2" → "set 2", for the middle of a sentence. */
const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** Last session's set as the Previous column shows it. */
function previousLabel(
  prev: { weight: number; reps: number } | undefined,
  timed: boolean,
  bodyweight: boolean
): string | null {
  if (!prev) return null;
  if (timed) return `${prev.reps} s`;
  if (prev.weight > 0) return `${prev.weight} × ${prev.reps}`;
  return bodyweight ? `BW × ${prev.reps}` : null;
}

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** How long a new best stays on screen: past the undo window (4 s), so
 *  the lifter can look up from the bar and still catch it. */
const NEW_BEST_MOMENT_MS = 6000;

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
  planContext?: { progress: string; next: string };
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
  programmeContext?: ProgrammeCompletionContext;
  /** Saves the session (`completeLift`) and hands back its receipt. */
  onCompleteDay: (
    dayIndex: number,
    sessionData: CompletedSessionData
  ) => Promise<LiftCompletionReceipt>;
  onClose: () => void;
  /** The account has never finished a workout: the guide's first-set hint
   *  may point at the first row (FV1). Train knows this; a saved routine
   *  doesn't pass it. */
  firstWorkout?: boolean;
  /** Whether a long or hard run finished in the 24 hours before a start
   *  (`useHardRunBefore`); the finish records it. Train passes it. */
  hardRunBefore?: (startedAt: number) => boolean;
}

export default function WorkoutSession({
  day: incomingDay,
  dayIndex,
  planContext,
  draftScope,
  draftEpoch,
  sessionVariant,
  deloadWeek = false,
  sessionMinutes,
  progressionBaseline,
  programmeContext,
  onCompleteDay,
  onClose,
  firstWorkout = false,
  hardRunBefore,
}: Props) {
  const { user, profile } = useAuth();
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
        layout: initialDay.exercises.map((ex) => ({
          id: ex.exerciseId || ex.name,
          sets: ex.sets,
        })),
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
  const [showResumePrompt, setShowResumePrompt] = useState(
    initialDraft !== null && !initialDraft.completionPending
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
  // Set once each row has its start (`startingSetRows`); a resumed draft's
  // rows already have theirs.
  const rowsStarted = useRef(!!initialDraft?.setLogs);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() => {
    if (initialDraft?.setLogs) return initialDraft.setLogs as SetLog[][];
    // Backlog #12: pre-fill a warm-up ramp on the first loaded exercise per
    // body part (N7's scoping rule). They're ordinary rows carrying the
    // existing `warmup` type (N11), so every volume/PR/calorie path that
    // already filters on that type excludes them for free.
    return buildInitialSetLogs(day.exercises);
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
  const [keepQuestion, setKeepQuestion] = useState<{
    open: boolean;
    swaps: SwapToKeep[];
  }>({ open: false, swaps: [] });
  /** Last time's counted sets by exercise id, read with the Previous
   *  column, so a swapped-in exercise starts from its own. */
  const lastSetsById = useRef(
    new Map<string, { weight: number; reps: number }[]>()
  );
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
      | HTMLElement
      | undefined;
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
    if (!user?.uid || !day.exercises.length) return;

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
      // Last time's counted sets, as Train's "Last:" line lists them: the
      // Previous column and where each row starts both read these.
      const lastSets = new Map(
        [
          ...lastSetsByExercise(
            recent.filter(
              (data) => data.completionId !== completionIdRef.current
            )
          ),
        ].map(([id, sets]) => [
          id,
          sets.map(({ weightKg, reps }) => ({ weight: weightKg, reps })),
        ])
      );
      lastSetsById.current = lastSets;
      setPreviousSets(
        Object.fromEntries(
          day.exercises.flatMap((ex, i) => {
            const sets = lastSets.get(ex.exerciseId);
            return sets ? [[i, sets]] : [];
          })
        )
      );

      // Each row starts from what that set did last time (Lift4,
      // `startingSetRows`), once per session: a resumed draft's rows, and
      // anything typed since, hold what the person put there.
      if (!rowsStarted.current) {
        rowsStarted.current = true;
        setSetLogs((prev) =>
          prev.map((rows, i) => {
            const ex = day.exercises[i];
            if (!ex || rows.some((set) => set.completed)) return rows;
            return startingSetRows(rows, ex, lastSets.get(ex.exerciseId));
          })
        );
      }

      // The best-lift map, as stored or rebuilt from history
      // (liftRecordsStore.ts). If it cannot be read, this session celebrates
      // no bests and leaves the stored map alone.
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
  }, [user?.uid, day.exercises]);

  // Save on meaningful edits. Read elapsed time at the save itself, so a
  // draft stays accurate even when the phone has suspended display ticks.
  useEffect(() => {
    const hasProgress = setLogs.some((exSets) =>
      exSets.some((s) => s.completed)
    );
    if (!hasProgress) return;
    if (completionPendingRef.current) return;
    saveDraft({
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
  }, [
    setLogs,
    skippedRows,
    exerciseNotes,
    currentExIndex,
    dayIndex,
    day.dayName,
    saveDraft,
    prescription,
    originalStartedAt,
    sessionProgrammeContext,
    sessionStartedAt,
  ]);

  const formatElapsed = formatClock;

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
  const [showFinishEarly, setShowFinishEarly] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "queued" | "synced" | "needs-attention" | undefined
  >(initialDraft?.completionPending ? "needs-attention" : undefined);
  const [shareAction, setShareAction] = useState<
    SessionShareAction | undefined
  >();
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(
    initialDraft?.completionPending
      ? Math.round(initialDraft.elapsedSeconds / 60)
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
        const source = draftScope?.startsWith("routine:")
          ? "routine"
          : "programme";
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
      Math.round((Date.now() - sessionStartedAt) / 60000)
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

  // #985 — barbell plate breakdown for the prescribed weight. Read-only hint;
  // barbell-only (dumbbell/machine lifts don't load plates). The standard set
  // runs down to 1.25 kg a side, which is the plan's 2.5 kg step.
  const plateLoad = useMemo(() => {
    if (!currentExercise || currentExercise.weight <= 0) return null;
    if (getExerciseById(currentExercise.exerciseId)?.equipment !== "Barbell")
      return null;
    return platesPerSide(currentExercise.weight);
  }, [currentExercise]);

  const currentSets = setLogs[currentExIndex] ?? [];
  // Warm-ups are optional, so the session's progress counts the sets that
  // count, as the saved workout does.
  const countedInSession = countedSets(setLogs.flat());
  const totalSetsCompleted = countedInSession.filter((s) => s.completed).length;
  const totalSetsTotal = countedInSession.length;

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

  const startRest = useCallback(
    (exercise: ProgramExercise | undefined) => {
      setRest({
        id: ++restSequence.current,
        startedAt: Date.now(),
        target: exercise
          ? restSecondsFor(exercise, { fixedRest, sessionMinutes })
          : fixedRest && fixedRest > 0
            ? fixedRest
            : DEFAULT_REST_SECONDS,
      });
      haptic(50);
    },
    [fixedRest, sessionMinutes]
  );

  const stopRest = useCallback(() => setRest(null), []);

  /* A set's type can change after it is done, as in Hevy: a set logged as
     working and meant as a warm-up is corrected here rather than by undoing
     it. A done set has fed this session's bests, so they are worked out
     again from the corrected sets, as an edited set's are. */
  const changeSetType = (exIdx: number, setIdx: number, type: SetType) => {
    const set = setLogs[exIdx]?.[setIdx];
    if (!set || set.type === type) return;
    if (set.completed && (completionPendingRef.current || saved)) return;
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
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx][field] = value;
      return updated;
    });
  };

  // Row checkmarks and the primary CTA share validation, PRs, undo and
  // progression, including when a lifter completes sets out of order.
  const completeSet = async (setIdx = currentSetIndex) => {
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
    //   - warn   → still complete the set, but skip PR celebration
    //              and prompt for explicit confirmation. The
    //              implementation here takes the lighter path: we
    //              still mark the set complete (the user did the
    //              work), we just don't auto-persist it as a PR.
    //   - ok     → proceed.
    const exName = currentExercise.name;
    const repBucket = getRepBucket(set.reps || 0);
    const currentBucketPR = prMap[exName]?.[repBucket];
    const validation = validateSet({
      reps: set.reps,
      weight: set.weight,
      // Body-highlighter exercises map heuristically — for now we
      // treat any zero-weight set on an exercise the user is logging
      // as bodyweight. If a richer bodyweight-flag arrives via the
      // exercise registry it can plug in here.
      isBodyweight: (set.weight ?? 0) === 0 && !currentBucketPR,
      timed: currentExercise.repUnit === "seconds",
      currentBestForBucket: currentBucketPR?.weight,
    });

    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][setIdx].completed = true;
      return updated;
    });

    haptic(100);

    // PR detection — only fires when (a) the validator didn't warn
    // AND (b) checkSetPR identifies this as a PR. A `warn` from the
    // validator (huge jump) means the user types a suspect value;
    // we don't auto-celebrate it. They can confirm/re-enter from
    // the History view if it really IS a PR.
    let prContext: NonNullable<typeof lastCompleted>["pr"] | undefined;
    if (
      !validation.warn &&
      isSetEligibleForStrengthPr(set.type, currentExercise.repUnit)
    ) {
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
        date: localDateString(),
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
    } else if (validation.warn) {
      // Surface the warn message so the user knows why no PR
      // celebration fired. They can re-confirm via History edit.
      toast.message(validation.warn.message);
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

    if (isLastSet) {
      // Backlog #2 — session-volume PR (three-axis PR, Green/B1): most
      // total work for this exercise in one session. Quietly visible per
      // the presentation policy: one toast, no mechanism talk. Gated on
      // the validator like set PRs.
      if (
        !validation.warn &&
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
              date: localDateString(),
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
      if (!next) {
        completeSession();
      } else {
        setCurrentExIndex(next.exerciseIndex);
        setCurrentSetIndex(next.setIndex);
        if (autoRest) startRest(day.exercises[currentExIndex]);
      }
    } else {
      // Move to next set, start rest timer (unless auto-start is off)
      setCurrentSetIndex(next?.setIndex ?? 0);
      if (autoRest) startRest(day.exercises[currentExIndex]);
    }
  };

  const refreshRecords = (logs: SetLog[][]) => {
    const next = sessionRecords(
      recordBaseline.current,
      volumeBaseline.current,
      sessionCounts,
      day.exercises,
      logs,
      localDateString()
    );
    setPrMap(next.map);
    setPrResults(next.results);
    setFiredPRs(next.fired);
    setVolumeBest(next.volumeBest);
  };

  const saveSetCorrection = async (values: {
    weight: number;
    reps: number;
  }) => {
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
      isBodyweight: values.weight === 0 && !best,
      timed: exercise.repUnit === "seconds",
      currentBestForBucket: best?.weight,
    });
    if (!validation.ok) throw new Error(validation.message);
    const next = setLogs.map((sets, ei) =>
      sets.map((entry, si) =>
        ei === exIdx && si === setIdx ? { ...entry, ...values } : entry
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
    if (validation.warn) toast.message(validation.warn.message);
    else toast.success("Set updated");
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
          ? startingSetRows(buildInitialSetLogs([exercise])[0], exercise, last)
          : rows
      )
    );
    setLastCompleted(null);
    setCurrentExIndex(index);
    setCurrentSetIndex(0);
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
            if (queuedReceipt && (await queuedReceipt) !== "synced") return;
            if (auth.currentUser?.uid !== user.uid) return;
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
              date: localDateString(),
            });
          } catch {
            // Non-critical — map can be rebuilt from history
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
    // A fresh start drops the draft's swaps and skips with its sets.
    const planned = prescription.exercises.map((ex, i) =>
      swapAt(i) ? (plannedAt(i) ?? ex) : ex
    );
    setPrescription((current) => ({
      ...current,
      exercises: planned,
      swaps: [],
    }));
    setSkippedRows({});
    setSetLogs(buildInitialSetLogs(planned));
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

  // A day with no exercises cannot be logged, and every render path below
  // dereferences `currentExercise`. Clamping cannot save this case — there is
  // no valid index into an empty list — so bail to the caller rather than
  // throw the whole /program route into the error boundary. Placed AFTER every
  // hook: this file's own header warns that gated early returns flipping
  // between renders are the classic cause of React error #310.
  if (day.exercises.length === 0) {
    return null;
  }

  // Session complete screen
  if (sessionComplete) {
    return (
      <>
        <SessionCompleteScreen
          dayName={day.dayName}
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
          onSave={saveSetCorrection}
          onClose={() => setEditingSet(null)}
        />
      )}
      {showResumePrompt && initialDraft && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-xl"
          >
            <h3 className="text-lg font-bold text-foreground">
              Resume workout?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You left this workout in progress earlier.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
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
            <div className="mt-5 flex gap-2">
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
          </motion.div>
        </div>
      )}

      {/* Top Bar — the day named as Train and Home name it (DS3): "Pull ·
          Lat focus" rather than "Pull — Lat Focus". A routine's own name,
          with no separator, reads as written. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/50">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-foreground">
            {liftDayLine(day.dayName)}
          </p>
          <WorkoutProgress
            key={sessionStartedAt}
            startedAt={sessionStartedAt}
            completed={totalSetsCompleted}
            total={totalSetsTotal}
          />
        </div>
        <IconButton
          variant="ghost"
          aria-label="Close workout"
          onClick={onClose}
          icon={<X className="size-5 text-muted-foreground" />}
        />
      </div>

      {rest && (
        <WorkoutRestTimer
          key={rest.id}
          startedAt={rest.startedAt}
          initialTarget={rest.target}
          exerciseName={day.exercises[currentExIndex]?.name}
          onStop={stopRest}
        />
      )}

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{
            width: `${totalSetsTotal > 0 ? (totalSetsCompleted / totalSetsTotal) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Exercise navigation pills */}
      <div className="relative">
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
                {/* Two lines, not one: cut to one, "Barbell Row" and
                    "Barbell Curl" both read "Barbell…". */}
                <span
                  className={cn(
                    "line-clamp-2 w-full text-center text-xs leading-tight break-words",
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

      {/* Exercise name + set counter — always visible above scroll. DS3:
          the exercise's drawing beside its name, where a bare dumbbell
          icon sat. Under 16em of row (larger text on the phone) the drawing
          gives its room to the name, which beside it pushed the form
          guide's button off the screen, and the name's two buttons drop
          under it when beside it they would squeeze a word ("Bench" at 2x
          on a 320px phone) out of its box. Wide-first. */}
      <div className="@container flex items-start gap-3 px-4 pt-2 pb-3 border-b border-border/30">
        {currentExercise && (
          <ExerciseThumb
            exerciseId={currentExercise.exerciseId}
            size="lg"
            className="@max-[16em]:hidden"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 @max-[16em]:flex-wrap">
            <h2 className="min-w-0 text-h3 font-bold leading-tight tracking-tight text-foreground text-balance">
              {currentExercise?.name}
            </h2>
            {currentExercise?.name && (
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  aria-label={`How to do ${currentExercise.name}`}
                  variant="ghost"
                  size="sm"
                  icon={<Info className="size-5 text-muted-foreground" />}
                  onClick={() => {
                    haptic("light");
                    setShowFormGuide(true);
                  }}
                />
                <IconButton
                  aria-label={`More for ${currentExercise.name}`}
                  variant="ghost"
                  size="sm"
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
                  <span className="font-mono tabular-nums">{counts.total}</span>{" "}
                  ·{" "}
                  <span className="font-mono tabular-nums">{counts.done}</span>{" "}
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

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
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

        {/* D-LIFT-16: with auto-start off, rests are opt-in — offer the
            manual start where the ring appears, once there's a completed
            set to rest from. */}
        {!isResting && !autoRest && currentSets.some((st) => st.completed) && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              leftIcon={<Timer className="size-4" aria-hidden="true" />}
              onClick={() => {
                haptic("light");
                startRest(day.exercises[currentExIndex]);
              }}
            >
              Start rest timer
            </Button>
          </div>
        )}

        {/* Set logging grid — the screen's one big thing (DS3). A row is
            the set's badge (its number, or W, D or F, and the way into its
            type), the same set last time, weight, reps and the tick. A
            done set's row turns green, as the tick it carries.

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
            const isBWExercise = currentExercise
              ? getExerciseById(currentExercise.exerciseId)?.equipment ===
                "Bodyweight"
              : false;
            const isTimedExercise = currentExercise?.repUnit === "seconds";
            const columns =
              "grid grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1.25fr)_minmax(0,1fr)_44px] @max-[19em]:grid-cols-[44px_minmax(0,1.25fr)_minmax(0,1fr)_44px] items-center gap-x-[8px]";

            return (
              <>
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
                    kg
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
                    isBWExercise
                  );
                  const canFill = prior != null && priorLabel != null;
                  const isBest = [...prResults.values()].some(
                    (result) =>
                      result.kind === "best" &&
                      result.setKey === `${currentExIndex}:${setIdx}`
                  );
                  return (
                    <div key={setIdx}>
                      <div
                        className={cn(
                          columns,
                          "border-t border-border/40 px-3 py-1.5 transition-colors",
                          set.completed
                            ? "bg-success/10"
                            : setIdx === currentSetIndex && "bg-primary/10"
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
                              canFill && !set.completed
                                ? "text-lifting-strong active:opacity-70"
                                : "text-muted-foreground"
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
                          value={set.weight || ""}
                          placeholder={
                            set.weight === 0 ? (isBWExercise ? "BW" : "0") : ""
                          }
                          aria-label={`${name} weight`}
                          onChange={(e) =>
                            updateSetLog(
                              currentExIndex,
                              setIdx,
                              "weight",
                              Number(e.target.value) || 0
                            )
                          }
                          disabled={set.completed}
                          className="min-h-[44px] w-full rounded-lg bg-muted px-1 text-center text-lg font-semibold font-mono tabular-nums text-foreground placeholder:text-muted-foreground disabled:bg-transparent disabled:opacity-100! disabled:[-webkit-text-fill-color:currentColor]"
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
                          className="min-h-[44px] w-full rounded-lg bg-muted px-1 text-center text-lg font-semibold font-mono tabular-nums text-foreground disabled:bg-transparent disabled:opacity-100! disabled:[-webkit-text-fill-color:currentColor]"
                        />
                        {set.completed ? (
                          <button
                            type="button"
                            aria-label={`Edit completed ${lowerFirst(name)}`}
                            onClick={() => {
                              haptic();
                              setEditingSet({
                                exIdx: currentExIndex,
                                setIdx,
                              });
                            }}
                            className="mx-auto flex min-h-[44px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
                          >
                            <span className="flex size-[32px] items-center justify-center rounded-lg bg-success text-success-foreground">
                              <Check
                                className="size-4"
                                strokeWidth={3}
                                aria-hidden="true"
                              />
                            </span>
                            {isBest && (
                              <span className="text-caption font-semibold leading-none text-achievement-strong">
                                PR
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Mark set complete"
                            data-guide-anchor={
                              firstWorkout &&
                              currentExIndex === 0 &&
                              setIdx === currentSetIndex
                                ? "first-set"
                                : undefined
                            }
                            onClick={() => void completeSet(setIdx)}
                            className="group mx-auto flex size-[44px] items-center justify-center active:scale-90"
                          >
                            <span className="size-[32px] rounded-lg border-2 border-border transition-colors group-hover:border-primary/60" />
                          </button>
                        )}
                      </div>
                      {/* Pick effort before completion so it reaches the
                          progression call made when the final set is logged. */}
                      {showRPE && !set.completed && set.type !== "warmup" && (
                        <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 border-t border-border/30 bg-muted/30">
                          <span className="text-xs text-muted-foreground mr-1 self-center">
                            RPE:
                          </span>
                          {RPE_OPTIONS.map((rpe) => (
                            <button
                              type="button"
                              key={rpe}
                              onClick={() => {
                                haptic(10);
                                updateSetRPE(currentExIndex, setIdx, rpe);
                              }}
                              className={cn(
                                "min-h-11 px-2.5 rounded text-xs font-mono tabular-nums transition-colors",
                                set.rpe === rpe
                                  ? "bg-primary-strong text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {rpe}
                            </button>
                          ))}
                          {typeof set.rpe === "number" && (
                            <span className="w-full pl-1 pt-0.5 text-xs text-muted-foreground">
                              <span className="font-mono tabular-nums">
                                {set.rpe}
                              </span>{" "}
                              · {rpeReserveWords(set.rpe)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}

          <div className="border-t border-border/40 p-3">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => addSet(currentExIndex)}
            >
              Add set
            </Button>
          </div>
        </Card>

        {/* Today's note, under the sets (DS3): an empty field above the
            table pushed the last set below the fold on a small phone. */}
        <input
          ref={notesInputRef}
          type="text"
          placeholder="Notes (e.g. Level 8, 6.0 incline)"
          aria-label="Exercise notes"
          value={exerciseNotes[currentExIndex] || ""}
          onChange={(e) =>
            setExerciseNotes((prev) => ({
              ...prev,
              [currentExIndex]: e.target.value,
            }))
          }
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

        {/* RPE toggle — through the primitive for its 44px floor; the
            hand-rolled pill was 28px tall. */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setShowRPE(!showRPE)}
          >
            {showRPE ? "Hide RPE" : "Show RPE"}
          </Button>
        </div>

        {/* Prescription hint */}
        {currentExercise && (
          <p className="text-xs text-muted-foreground text-center">
            Target: {currentExercise.sets}&times;
            {formatRepTarget(currentExercise)}
            {currentExercise.weight > 0
              ? ` @ ${currentExercise.weight} kg`
              : getExerciseById(currentExercise.exerciseId)?.equipment ===
                  "Bodyweight"
                ? " @ Bodyweight"
                : ""}
          </p>
        )}
        {currentExercise && (
          <LoweredLine
            exercise={currentExercise}
            className="text-xs text-muted-foreground text-center"
          />
        )}

        {/* #985 — plate breakdown per side (barbell only). */}
        {plateLoad && plateLoad.perSide.length > 0 && (
          <p className="mt-0.5 text-center text-caption font-mono tabular-nums text-muted-foreground">
            Per side:{" "}
            {plateLoad.perSide
              .flatMap(({ plateKg, count }) =>
                Array<number>(count).fill(plateKg)
              )
              .join(" + ")}
            {plateLoad.remainderKg > 0 &&
              ` · ${plateLoad.remainderKg} kg short`}
          </p>
        )}
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
        {!isResting &&
          nextIncompleteSet(setLogs) &&
          setLogs.some((sets) =>
            sets.some((set) => set.completed && set.type !== "warmup")
          ) && (
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowFinishEarly(true)}
            >
              Finish early
            </Button>
          )}
      </div>

      <ConfirmDialog
        open={showFinishEarly}
        title="Finish with unfinished sets?"
        description="Only completed working sets will be saved. Unfinished sets will not count toward your workout totals."
        confirmLabel="Review completed work"
        cancelLabel="Keep training"
        onCancel={() => setShowFinishEarly(false)}
        onConfirm={() => {
          setShowFinishEarly(false);
          completeSession();
        }}
      />

      {menuFor !== null && day.exercises[menuFor] && (
        <ExerciseMenuSheet
          open
          onClose={() => setMenuFor(null)}
          exerciseName={day.exercises[menuFor].name}
          nothingDone={!(setLogs[menuFor] ?? []).some((set) => set.completed)}
          swappedFor={swapAt(menuFor) ? plannedAt(menuFor)?.name : undefined}
          skipped={skippedRows[menuFor] !== undefined}
          onSwap={() => setSwapFor(menuFor)}
          onSwapBack={() => {
            const planned = plannedAt(menuFor);
            if (planned) swapForToday(menuFor, planned.exerciseId);
          }}
          onSkip={() => skipExercise(menuFor)}
          onUnskip={() => unskipExercise(menuFor)}
        />
      )}
      {swapFor !== null && day.exercises[swapFor] && (
        <Suspense fallback={null}>
          <ExercisePicker
            open
            headerTitle={`Swap ${day.exercises[swapFor].name} for today`}
            pickAction="Swap for today"
            onSelect={(picked) => {
              swapForToday(swapFor, picked.id);
              setSwapFor(null);
            }}
            onClose={() => setSwapFor(null)}
          />
        </Suspense>
      )}

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
        <BottomSheet
          open={showFormGuide}
          onOpenChange={setShowFormGuide}
          title={currentExercise.name}
        >
          <div className="px-4 pb-6">
            <Suspense
              fallback={
                <div className="py-10 flex justify-center">
                  <Spinner />
                </div>
              }
            >
              <ExerciseFormContent
                exerciseName={currentExercise.name}
                active={showFormGuide}
              />
            </Suspense>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
