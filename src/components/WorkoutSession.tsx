import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import type { ProgramExercise } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import {
  Play,
  RotateCcw,
  Check,
  X,
  Dumbbell,
  Trophy,
  Info,
  TrendingUp,
  Disc,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import { toast } from "@/lib/toast";
import {
  buildPRMap,
  checkSetPR,
  repBucketLabel,
  type PRMap,
  type RepBucket,
  getRepBucket,
} from "@/lib/prTracking";
import {
  suggestNextLoad,
  type ProgressionSuggestion,
} from "@/lib/progressionSuggestion";
import PlateCalculatorSheet from "@/components/workout/PlateCalculatorSheet";
import { validateSet } from "@/lib/setValidation";
import { getExerciseById } from "@/lib/exercises";
import { platesPerSide } from "@/lib/plateCalculator";
import { useWorkoutDraft, computeDraftIdentity } from "@/hooks/useWorkoutDraft";
import { useScrollEdges } from "@/hooks/useScrollEdges";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import RestTimerRing from "@/components/workout/RestTimerRing";
import StallModal from "@/components/workout/StallModal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
// Form guide is heavy (react-body-highlighter) — lazy-load so it only hydrates
// when the user opens the "How to" sheet mid-workout (D-LIFT-14).
const ExerciseFormContent = lazy(
  () => import("@/components/ExerciseFormContent")
);
const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 523;
    osc2.frequency.value = 659;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available
  }
}

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

type SetType = "working" | "warmup" | "dropset" | "failure";

const SET_TYPE_CONFIG: Record<
  SetType,
  { label: string; color: string; bg: string }
> = {
  working: { label: "W", color: "text-foreground", bg: "" },
  warmup: {
    label: "W",
    color: "text-yellow-600",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
  },
  dropset: {
    label: "D",
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
  },
  failure: {
    label: "F",
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
};

const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "dropset", "failure"];

const TYPE_COLORS: Record<SetType, string> = {
  working: "#a3a3a3",
  warmup: "#FFA94D",
  dropset: "#B197FC",
  failure: "#FF6B6B",
};

const TYPE_LABELS: Record<SetType, string> = {
  working: "Working",
  warmup: "Warmup",
  dropset: "Drop",
  failure: "Failure",
};

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
  /** LIFT-01 draft-identity scope: `"programme"` (default) for
   *  scheduled programme days, `"routine:<id>"` for saved-routine
   *  sessions so each routine gets its own draft isolation. */
  draftScope?: string;
  /** LIFT-01 draft-identity epoch: the programme `weekNumber` for
   *  programme days (invalidates a stale draft across week
   *  advancement). Defaults to 0 for scopes without an epoch. */
  draftEpoch?: string | number;
  onLogExercise: (
    dayIndex: number,
    exIndex: number,
    reps: number,
    weight: number,
    rpe?: number
  ) => Promise<void>;
  onCompleteDay: (
    dayIndex: number,
    sessionData?: {
      durationMinutes: number;
      setLogs: Array<
        Array<{ weight: number; reps: number; completed: boolean }>
      >;
    }
  ) => Promise<void>;
  onClose: () => void;
}

export default function WorkoutSession({
  day,
  dayIndex,
  draftScope,
  draftEpoch,
  onLogExercise,
  onCompleteDay,
  onClose,
}: Props) {
  const { user, profile } = useAuth();
  const { awardEventBadge } = useStreaks();
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
        dayName: day.dayName,
        layout: day.exercises.map((ex) => ({
          id: ex.exerciseId || ex.name,
          sets: ex.sets,
        })),
      }),
    [draftScope, draftEpoch, dayIndex, day.dayName, day.exercises]
  );
  const {
    load: loadDraft,
    save: saveDraft,
    clear: clearDraft,
  } = useWorkoutDraft(user?.uid, dayIndex, draftIdentity);
  // Captured once on mount — stable across renders via the stable hook callbacks.
  const initialDraft = useMemo(() => loadDraft(), [loadDraft]);
  const [showResumePrompt, setShowResumePrompt] = useState(
    initialDraft !== null
  );
  const [currentExIndex, setCurrentExIndex] = useState(
    initialDraft?.currentExIndex ?? 0
  );
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(
    () =>
      (initialDraft?.setLogs as SetLog[][]) ??
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
  // D-LIFT-14: form guide reachable mid-workout (no more exit → History → Form).
  const [showFormGuide, setShowFormGuide] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>(
    initialDraft?.exerciseNotes ?? {}
  );
  const [typePopover, setTypePopover] = useState<number | null>(null);
  const popoverPosRef = useRef<{ top: number; left: number; bottom: number }>({
    top: 0,
    left: 0,
    bottom: 0,
  });
  // Exercise-rail scroller: `tabsRef` drives both the active-pill
  // scrollIntoView and the overflow-aware edge fades (atStart/atEnd) below.
  const {
    ref: tabsRef,
    atStart: railAtStart,
    atEnd: railAtEnd,
    measure: measureRail,
  } = useScrollEdges<HTMLDivElement>();
  const sessionStartRef = useRef(0);

  // a11y: the set-type popover dismisses on backdrop click (mouse) — give
  // keyboard users Escape to close it so it isn't a keyboard trap (#842).
  useEffect(() => {
    if (typePopover === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTypePopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typePopover]);
  useEffect(() => {
    // Backdate session start on resume so sessionDurationMinutes reflects
    // actual training time, not wall-clock from when the user returned.
    sessionStartRef.current = initialDraft
      ? Date.now() - initialDraft.elapsedSeconds * 1000
      : Date.now();
  }, [initialDraft]);

  // Auto-scroll exercise tabs when active exercise changes
  useEffect(() => {
    const container = tabsRef.current;
    const activeBtn = container?.children[currentExIndex] as
      | HTMLElement
      | undefined;
    activeBtn?.scrollIntoView({
      behavior: "smooth",
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
  /* Double-progression nudges per exercise index (2026-07 audit). Computed
     alongside the prefill from the SAME previous-session data; the chip
     only renders while the exercise is untouched this session. */
  const [suggestions, setSuggestions] = useState<
    Record<number, ProgressionSuggestion>
  >({});
  const [showPlates, setShowPlates] = useState(false);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>(
    {}
  );
  const [firedPRs, setFiredPRs] = useState<Map<string, RepBucket[]>>(new Map());

  // Pre-fill weights/reps from most recent previous session + build PR map
  useEffect(() => {
    if (!user?.uid || !day.exercises.length) return;

    const fetchPreviousWeights = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(
        query(workoutsRef, orderBy("date", "desc"), limit(50))
      );

      const prevWeights: Record<string, { weight: number; reps: number }[]> =
        {};

      snap.docs.forEach((d) => {
        const data = d.data();
        (data.exercises || []).forEach(
          (ex: {
            exerciseName: string;
            sets?: { weightKg?: number; reps?: number }[];
          }) => {
            const name = ex.exerciseName;
            if (!prevWeights[name] && ex.sets?.length && ex.sets.length > 0) {
              prevWeights[name] = ex.sets.map((s) => ({
                weight: s.weightKg || 0,
                reps: s.reps || 0,
              }));
            }
          }
        );
      });

      // Double-progression suggestions from the same history the prefill
      // uses (one fetch, two consumers).
      const nextSuggestions: Record<number, ProgressionSuggestion> = {};
      day.exercises.forEach((ex, i) => {
        const prevSets = prevWeights[ex.name];
        if (!prevSets) return;
        const suggestion = suggestNextLoad({
          prevSets,
          targetReps: ex.reps,
        });
        if (suggestion && suggestion.kind === "increase") {
          nextSuggestions[i] = suggestion;
        }
      });
      setSuggestions(nextSuggestions);

      setSetLogs((prev) => {
        const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
        day.exercises.forEach((ex, i) => {
          const name = ex.name;
          const prevSets = prevWeights[name];
          if (prevSets && updated[i]) {
            updated[i] = updated[i].map((set, si) => ({
              ...set,
              weight:
                set.weight ||
                (prevSets[si]?.weight ?? prevSets[0]?.weight ?? 0),
              reps: set.reps || (prevSets[si]?.reps ?? prevSets[0]?.reps ?? 0),
            }));
          }
        });
        return updated;
      });

      // Load persisted PR map, or build from history if not available
      let prMapLoaded = false;
      try {
        const { doc: fbDoc, getDoc: fbGetDoc } =
          await import("firebase/firestore");
        const prMapDoc = await fbGetDoc(
          fbDoc(db, "users", user.uid, "stats", "prMap")
        );
        if (prMapDoc.exists()) {
          const data = prMapDoc.data();
          setPrMap(data.map as PRMap);
          if (data.sessionCounts) {
            setSessionCounts(data.sessionCounts as Record<string, number>);
            prMapLoaded = true;
          }
        }
      } catch {
        // Fall through to rebuild from history
      }

      if (!prMapLoaded) {
        // Fall back to building from last 50 workouts
        const history = snap.docs.map((d) => {
          const data = d.data();
          return {
            date: data.date as string,
            exercises: (data.exercises || []).map(
              (ex: {
                exerciseName: string;
                sets: { weightKg: number; reps: number }[];
              }) => ({
                exerciseName: ex.exerciseName,
                sets: (ex.sets || []).map((s) => ({
                  weightKg: s.weightKg || 0,
                  reps: s.reps || 0,
                })),
              })
            ),
          };
        });
        setPrMap(buildPRMap(history));

        // Count sessions per exercise for 3-session minimum filter
        const counts: Record<string, number> = {};
        for (const w of history) {
          const seen = new Set<string>();
          for (const ex of w.exercises) {
            if (!seen.has(ex.exerciseName)) {
              counts[ex.exerciseName] = (counts[ex.exerciseName] || 0) + 1;
              seen.add(ex.exerciseName);
            }
          }
        }
        setSessionCounts(counts);
      }
    };

    fetchPreviousWeights();
  }, [user?.uid, day.exercises]);

  // Elapsed workout timer
  const [elapsedSeconds, setElapsedSeconds] = useState(
    initialDraft?.elapsedSeconds ?? 0
  );
  useEffect(() => {
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-save in-progress workout to localStorage so abandoned sessions can
  // be resumed. Saves on meaningful state change (set logs, notes, exercise
  // nav); elapsedSeconds is snapshotted via ref so we don't write every
  // second. Only persists once the user has completed at least one set.
  const elapsedSecondsRef = useRef(elapsedSeconds);
  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);
  useEffect(() => {
    const hasProgress = setLogs.some((exSets) =>
      exSets.some((s) => s.completed)
    );
    if (!hasProgress) return;
    saveDraft({
      dayIndex,
      dayName: day.dayName,
      setLogs,
      exerciseNotes,
      elapsedSeconds: elapsedSecondsRef.current,
      currentExIndex,
    });
  }, [
    setLogs,
    exerciseNotes,
    currentExIndex,
    dayIndex,
    day.dayName,
    saveDraft,
  ]);

  const formatElapsed = (s: number): string => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0)
      return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  // Rest timer. PR E (audit P1 #13): pre-PR-E the target was
  // hardcoded to 90s and never read profile.defaultRestSeconds —
  // the Settings → Workout Preferences slider had no effect on
  // the actual session. Now the default is sourced from the
  // profile with a 90s fallback for users who haven't set one.
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTarget, setRestTarget] = useState(
    typeof profile?.defaultRestSeconds === "number" &&
      profile.defaultRestSeconds > 0
      ? profile.defaultRestSeconds
      : 90
  );
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chimeFiredRef = useRef(false);
  // D-LIFT-16: the Settings → "Auto-start rest timer" toggle existed but was
  // never read here — the same dead-setting class PR E fixed for
  // defaultRestSeconds. Default ON (unset/legacy profiles keep today's
  // behaviour); when OFF, completing a set doesn't lock the user into a rest
  // and the manual "Start rest" affordance below the grid takes over.
  const autoRest = profile?.autoRestTimer !== false;

  // Session state
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(0);

  // Stall detection
  const [stallExercise, setStallExercise] = useState<{
    name: string;
    weight: number;
  } | null>(null);

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
    };
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentExercise = day.exercises[currentExIndex];

  // #985 — barbell plate breakdown for the prescribed weight. Read-only hint;
  // barbell-only (dumbbell/machine lifts don't load plates). Standard plates;
  // micro-plate awareness via the microloading setting is a follow-up.
  const plateLoad = useMemo(() => {
    if (!currentExercise || currentExercise.weight <= 0) return null;
    if (getExerciseById(currentExercise.exerciseId)?.equipment !== "Barbell")
      return null;
    return platesPerSide(currentExercise.weight);
  }, [currentExercise]);

  const currentSets = setLogs[currentExIndex] ?? [];
  const completedSetsInExercise = currentSets.filter((s) => s.completed).length;
  const totalSetsCompleted = setLogs.flat().filter((s) => s.completed).length;
  const totalSetsTotal = setLogs.flat().length;

  /* haptic comes from `@/lib/haptic` which routes through
     Capacitor's Haptics plugin in the iOS/Android shell. The
     prior inline `navigator.vibrate(pattern)` was a no-op on iOS
     Safari — the Vibrate API has never shipped there. */

  // Timer logic
  const startRest = useCallback(() => {
    setRestSeconds(0);
    setIsResting(true);
    chimeFiredRef.current = false;
    haptic(50);
  }, []);

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
    if (isResting && restSeconds >= restTarget && !chimeFiredRef.current) {
      chimeFiredRef.current = true;
      haptic([200, 100, 200]);
      playChime();
    }
  }, [isResting, restSeconds, restTarget]);

  const setSetType = (exIdx: number, setIdx: number, type: SetType) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].type = type;
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

  // Complete a specific set inline (from tapping the DONE circle)
  const completeInlineSet = (setIdx: number) => {
    if (setIdx === currentSetIndex) {
      completeSet();
    } else {
      haptic(50);
      setSetLogs((prev) => {
        const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
        updated[currentExIndex][setIdx].completed = true;
        return updated;
      });
    }
  };

  const completeSet = async () => {
    const set = currentSets[currentSetIndex];
    if (!set) return;

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
      currentBestForBucket: currentBucketPR?.weight,
    });

    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][currentSetIndex].completed = true;
      return updated;
    });

    haptic(100);

    // PR detection — only fires when (a) the validator didn't warn
    // AND (b) checkSetPR identifies this as a PR. A `warn` from the
    // validator (huge jump) means the user types a suspect value;
    // we don't auto-celebrate it. They can confirm/re-enter from
    // the History view if it really IS a PR.
    let prContext: NonNullable<typeof lastCompleted>["pr"] | undefined;
    if (!validation.warn) {
      const prBucket = checkSetPR(
        exName,
        set.weight,
        set.reps,
        prMap,
        sessionCounts,
        3
      );
      const alreadyFired = firedPRs.get(exName) || [];
      if (prBucket && !alreadyFired.includes(prBucket)) {
        // Capture the previous PR for this bucket BEFORE we mutate it
        // so undo can restore. `null` means there was no prior PR.
        const previousPR = prMap[exName]?.[prBucket] ?? null;
        prContext = { exName, bucket: prBucket, previousPR };

        setFiredPRs((prev) => {
          const updated = new Map(prev);
          updated.set(exName, [...(prev.get(exName) || []), prBucket]);
          return updated;
        });
        setPrMap((prev) => {
          const updated = { ...prev };
          if (!updated[exName])
            updated[exName] = {
              "1rm": null,
              "3rm": null,
              "5rm": null,
              "8rm": null,
              "10rm": null,
            };
          updated[exName] = {
            ...updated[exName],
            [prBucket]: {
              weight: set.weight,
              reps: set.reps,
              date: new Date().toISOString().split("T")[0],
            },
          };
          return updated;
        });
        lazyConfetti().then((confetti) => {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          setTimeout(
            () =>
              confetti({
                particleCount: 30,
                spread: 90,
                origin: { y: 0.65 },
                startVelocity: 15,
              }),
            200
          );
        });
        haptic(50);
        toast.success(
          `New ${repBucketLabel(prBucket)}! ${set.weight}kg × ${set.reps} on ${exName}`
        );
      }
    } else {
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
      setIdx: currentSetIndex,
      pr: prContext,
    });
    undoTimeoutRef.current = setTimeout(() => setLastCompleted(null), 4000);

    const isLastSet = currentSetIndex >= currentSets.length - 1;
    const isLastExercise = currentExIndex >= day.exercises.length - 1;

    if (isLastSet) {
      // Log exercise performance (use last set's reps/weight/RPE — the latter
      // drives RPE autoregulation in applyProgression, D-LIFT-6).
      await onLogExercise(
        dayIndex,
        currentExIndex,
        set.reps,
        set.weight,
        set.rpe
      );

      if (isLastExercise) {
        setSessionDurationMinutes(
          Math.round((Date.now() - sessionStartRef.current) / 60000)
        );
        setSessionComplete(true);
      } else {
        // Move to next exercise
        setCurrentExIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
        if (autoRest) startRest();
      }
    } else {
      // Move to next set, start rest timer (unless auto-start is off)
      setCurrentSetIndex((prev) => prev + 1);
      if (autoRest) startRest();
    }
  };

  const handleUndo = () => {
    if (!lastCompleted) return;
    const { exIdx, setIdx, pr } = lastCompleted;

    // PR E (audit P0 #4): if completeSet recorded a PR, undo MUST
    // revert that PR mutation. Pre-PR-E undo only flipped
    // setLogs[].completed, leaving the false PR persisted in
    // prMap + firedPRs AND in Firestore on the next auto-save.
    if (pr) {
      setPrMap((prev) => {
        const updated = { ...prev };
        if (updated[pr.exName]) {
          updated[pr.exName] = {
            ...updated[pr.exName],
            [pr.bucket]: pr.previousPR,
          };
        }
        return updated;
      });
      setFiredPRs((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(pr.exName) || [];
        updated.set(
          pr.exName,
          existing.filter((b) => b !== pr.bucket)
        );
        return updated;
      });
    }

    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].completed = false;
      return updated;
    });
    setCurrentExIndex(exIdx);
    setCurrentSetIndex(setIdx);
    stopRest();
    if (sessionComplete) setSessionComplete(false);
    setLastCompleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  // Cleanup undo timeout
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // Stall detection on session completion
  useEffect(() => {
    if (!sessionComplete || !user?.uid) return;

    const checkStalls = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(
        query(workoutsRef, orderBy("date", "desc"), limit(20))
      );
      const history = snap.docs.map((d) => d.data());

      for (const ex of day.exercises) {
        // Check localStorage cooldown
        const cooldownKey = `tropos_stall_${ex.name}`;
        const lastPopup = localStorage.getItem(cooldownKey);
        if (lastPopup && Date.now() - Number(lastPopup) < 3 * 7 * 86400000)
          continue; // 3 weeks cooldown

        const lastThree = history
          .filter((w) =>
            (w.exercises || []).some(
              (e: { exerciseName: string }) => e.exerciseName === ex.name
            )
          )
          .slice(0, 3);

        if (lastThree.length < 3) continue;

        const weights = lastThree.map((w) => {
          const found = (w.exercises || []).find(
            (e: { exerciseName: string }) => e.exerciseName === ex.name
          );
          return (
            found?.sets
              ?.map((s: { weightKg?: number }) => s.weightKg)
              .join(",") || ""
          );
        });

        if (
          weights[0] &&
          weights[0] === weights[1] &&
          weights[1] === weights[2]
        ) {
          const w =
            lastThree[0].exercises.find(
              (e: { exerciseName: string }) => e.exerciseName === ex.name
            )?.sets?.[0]?.weightKg || 0;
          setStallExercise({ name: ex.name, weight: w });
          break;
        }
      }
    };

    checkStalls();
  }, [sessionComplete, user?.uid, day.exercises]);

  const handleFinish = async () => {
    setCompleting(true);
    // Pass the wall-clock duration + per-set logs so the saved workout
    // record reflects actual execution instead of planned placeholders.
    // sessionDurationMinutes is finalised in completeSession at the moment
    // the last set is marked done (see line 404); setLogs is the source of
    // truth for which sets were completed with what weight/reps.
    await onCompleteDay(dayIndex, {
      durationMinutes: sessionDurationMinutes,
      setLogs: setLogs.map((exSets) =>
        exSets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          completed: s.completed,
        }))
      ),
    });

    // Persist PR map to Firestore for history beyond 50-session window
    if (user?.uid && Object.keys(prMap).length > 0) {
      try {
        const { doc: fbDoc } = await import("firebase/firestore");
        const { Timestamp } = await import("firebase/firestore");
        await setDocGuarded(
          fbDoc(db, "users", user.uid, "stats", "prMap"),
          {
            map: prMap,
            sessionCounts,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch {
        // Non-critical — map can be rebuilt from history
      }
    }

    // Clear the draft only after the workout is saved. If onCompleteDay
    // throws above, the draft survives so the user can retry the finish.
    clearDraft();

    // first_pr badge — a genuine PR fired this session (checkSetPR: beat a
    // previous best after ≥3 sessions with that exercise). Event-based, so
    // awarded here at the moment it happens; idempotent + celebration via the
    // standard queue. firedPRs is the same signal SessionCompleteScreen counts.
    if (firedPRs.size > 0) awardEventBadge("first_pr");

    // Streak-priming trigger (audit #10): completing a workout — post
    // celebration — is the ONLY moment the streak-reminder priming modal may
    // surface. The global modal listens for this event; it no longer fires on
    // app-open or page mount, so landing on the Programme page never pops it.
    try {
      window.dispatchEvent(new CustomEvent("tropos:workout-completed"));
    } catch {
      // CustomEvent unsupported / SSR — priming simply won't prompt; harmless.
    }

    setCompleting(false);
    onClose();
  };

  const handleStartFresh = () => {
    setSetLogs(
      day.exercises.map((ex) =>
        Array.from({ length: ex.sets }, () => ({
          reps: ex.reps,
          weight: ex.weight,
          completed: false,
          type: "working" as SetType,
        }))
      )
    );
    setExerciseNotes({});
    setElapsedSeconds(0);
    setCurrentExIndex(0);
    setCurrentSetIndex(0);
    sessionStartRef.current = Date.now();
    clearDraft();
    setShowResumePrompt(false);
  };

  // Session complete screen
  if (sessionComplete) {
    return (
      <>
        <SessionCompleteScreen
          dayName={day.dayName}
          dayType={day.dayType}
          exercises={day.exercises}
          setLogs={setLogs}
          firedPRs={firedPRs}
          sessionDurationMinutes={sessionDurationMinutes}
          completing={completing}
          onFinish={handleFinish}
          onClose={onClose}
        />
        {stallExercise && (
          <StallModal
            exercise={stallExercise}
            onClose={() => setStallExercise(null)}
          />
        )}
      </>
    );
  }

  const draftCompletedSets = initialDraft
    ? initialDraft.setLogs.reduce(
        (sum, exSets) => sum + exSets.filter((s) => s.completed).length,
        0
      )
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-area-pb">
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

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <p className="text-sm font-semibold text-foreground">{day.dayName}</p>
          <p className="text-xs text-muted-foreground">
            {totalSetsCompleted}/{totalSetsTotal} sets ·{" "}
            {formatElapsed(elapsedSeconds)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Close workout"
        >
          <X className="size-5 text-muted-foreground" />
        </button>
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

      {/* Exercise navigation pills */}
      <div className="relative">
        <div
          ref={tabsRef}
          data-no-page-swipe
          className="flex gap-1.5 px-4 py-3 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {day.exercises.map((ex, i) => {
            const setsForEx = setLogs[i] ?? [];
            const done = setsForEx.every((s) => s.completed);
            const active = i === currentExIndex;
            return (
              <button
                type="button"
                key={i}
                onClick={() => {
                  haptic(10);
                  setCurrentExIndex(i);
                  const nextIncomplete = setsForEx.findIndex(
                    (s) => !s.completed
                  );
                  setCurrentSetIndex(nextIncomplete >= 0 ? nextIncomplete : 0);
                }}
                className={cn(
                  "min-h-11 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                  done
                    ? "bg-success text-success-foreground font-medium"
                    : active
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {done ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-3" />
                    {ex.name}
                  </span>
                ) : (
                  ex.name
                )}
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

      {/* Exercise name + set counter — always visible above scroll */}
      <div className="text-center px-4 pt-2 pb-2 border-b border-border/30">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Dumbbell className="size-5 text-lifting" />
          <h2 className="text-lg font-bold text-foreground">
            {currentExercise?.name}
          </h2>
          {currentExercise?.name && (
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
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Set {currentSetIndex + 1} of {currentSets.length} ·{" "}
          {completedSetsInExercise} done
        </p>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Notes input */}
        <div>
          <input
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
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Rest Timer - circular */}
        <AnimatePresence>
          {isResting && (
            <RestTimerRing
              restSeconds={restSeconds}
              restTarget={restTarget}
              onStop={stopRest}
              onChangeTarget={setRestTarget}
            />
          )}
        </AnimatePresence>

        {/* D-LIFT-16: with auto-start off, rests are opt-in — offer the
            manual start where the ring appears, once there's a completed
            set to rest from. */}
        {!isResting && !autoRest && currentSets.some((st) => st.completed) && (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              startRest();
            }}
            className="mx-auto flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-xs font-medium bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
          >
            <Timer className="size-3.5" /> Start rest timer
          </button>
        )}

        {/* Double-progression nudge — only while this exercise is untouched
            this session (a mid-session flip would be noise), and only the
            "increase" case (prefill already covers "repeat"). Apply sets
            every set's weight in one tap. */}
        {suggestions[currentExIndex] &&
          !currentSets.some((st) => st.completed) && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-lifting/10">
              <TrendingUp
                className="size-4 shrink-0 text-lifting"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-xs text-foreground leading-relaxed">
                All sets hit{" "}
                <span className="font-mono tabular-nums font-semibold">
                  {suggestions[currentExIndex].targetReps}
                </span>{" "}
                reps at{" "}
                <span className="font-mono tabular-nums font-semibold">
                  {suggestions[currentExIndex].lastWeightKg} kg
                </span>{" "}
                last time — try{" "}
                <span className="font-mono tabular-nums font-semibold">
                  {suggestions[currentExIndex].weightKg} kg
                </span>
                .
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  haptic("light");
                  const target = suggestions[currentExIndex].weightKg;
                  setSetLogs((prev) => {
                    const updated = prev.map((sets) =>
                      sets.map((st) => ({ ...st }))
                    );
                    if (updated[currentExIndex]) {
                      updated[currentExIndex] = updated[currentExIndex].map(
                        (st) => ({ ...st, weight: target })
                      );
                    }
                    return updated;
                  });
                }}
              >
                Apply
              </Button>
            </div>
          )}

        {/* Set logging grid */}
        <div className="bg-card rounded-2xl">
          {(() => {
            const prev = currentExercise?.lastPerformance;
            const isBWExercise = currentExercise
              ? getExerciseById(currentExercise.exerciseId)?.equipment ===
                "Bodyweight"
              : false;
            const prevLabel = prev
              ? prev.weight > 0
                ? `${prev.weight}×${prev.reps}`
                : isBWExercise
                  ? `BW×${prev.reps}`
                  : "—"
              : "—";
            const canFillPrev = prev != null && prev.weight > 0;

            return (
              <>
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 bg-muted/50 text-caption font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-1">Set</div>
                  <div className="col-span-2">Prev</div>
                  <div className="col-span-4 flex items-center gap-1">
                    Weight (kg)
                    <button
                      type="button"
                      aria-label="Plate calculator"
                      onClick={() => {
                        haptic("light");
                        setShowPlates(true);
                      }}
                      className="p-1 -m-1 min-h-0 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Disc className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="col-span-3">Reps</div>
                  <div className="col-span-2 text-center">Done</div>
                </div>
                {currentSets.map((set, setIdx) => {
                  const typeConfig = SET_TYPE_CONFIG[set.type];
                  return (
                    <div key={setIdx}>
                      <div
                        className={cn(
                          "grid grid-cols-12 gap-1 items-center px-3 py-2.5 border-t border-border/30",
                          setIdx === currentSetIndex &&
                            !set.completed &&
                            "bg-primary/5",
                          set.completed && "opacity-70"
                        )}
                      >
                        <div className="col-span-1 flex justify-center relative">
                          <button
                            type="button"
                            ref={(el) => {
                              if (typePopover === setIdx && el) {
                                const r = el.getBoundingClientRect();
                                popoverPosRef.current = {
                                  top: r.top,
                                  left: r.right + 8,
                                  bottom: r.bottom,
                                };
                              }
                            }}
                            onClick={() => {
                              if (!set.completed) {
                                haptic(10);
                                setTypePopover(
                                  typePopover === setIdx ? null : setIdx
                                );
                              }
                            }}
                            disabled={set.completed}
                            className="size-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                            style={
                              set.type !== "working"
                                ? {
                                    backgroundColor: TYPE_COLORS[set.type],
                                    color: "white",
                                  }
                                : undefined
                            }
                            title={`Set type: ${set.type}`}
                          >
                            {set.type === "working"
                              ? setIdx + 1
                              : typeConfig.label}
                          </button>
                        </div>
                        <div className="col-span-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (canFillPrev && !set.completed && prev) {
                                haptic(10);
                                updateSetLog(
                                  currentExIndex,
                                  setIdx,
                                  "weight",
                                  prev.weight
                                );
                                updateSetLog(
                                  currentExIndex,
                                  setIdx,
                                  "reps",
                                  prev.reps
                                );
                              }
                            }}
                            disabled={set.completed || !canFillPrev}
                            className={cn(
                              "text-small font-mono tabular-nums text-center w-full",
                              canFillPrev && !set.completed
                                ? "text-primary active:opacity-70"
                                : "text-muted-foreground"
                            )}
                          >
                            {prevLabel}
                          </button>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            value={set.weight || ""}
                            placeholder={
                              set.weight === 0
                                ? isBWExercise
                                  ? "BW"
                                  : "0"
                                : ""
                            }
                            aria-label={`Set ${setIdx + 1} weight`}
                            onChange={(e) =>
                              updateSetLog(
                                currentExIndex,
                                setIdx,
                                "weight",
                                Number(e.target.value) || 0
                              )
                            }
                            disabled={set.completed}
                            className="w-full px-2 py-2.5 min-h-11 rounded-lg bg-muted text-foreground text-sm font-mono tabular-nums text-center placeholder:text-muted-foreground/50 disabled:opacity-50"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            value={set.reps || ""}
                            aria-label={`Set ${setIdx + 1} reps`}
                            onChange={(e) =>
                              updateSetLog(
                                currentExIndex,
                                setIdx,
                                "reps",
                                Number(e.target.value) || 0
                              )
                            }
                            disabled={set.completed}
                            className="w-full px-2 py-2.5 min-h-11 rounded-lg bg-muted text-foreground text-sm font-mono tabular-nums text-center disabled:opacity-50"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {set.completed ? (
                            <motion.div
                              initial={{ scale: 0.5 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.15 }}
                            >
                              <Check className="size-5 text-success" />
                            </motion.div>
                          ) : (
                            <button
                              type="button"
                              aria-label="Mark set complete"
                              onClick={() => completeInlineSet(setIdx)}
                              className="group size-11 flex items-center justify-center active:scale-90"
                            >
                              <span className="size-7 rounded-full border-2 border-border group-hover:border-primary/50 transition-colors" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* RPE selector for completed sets */}
                      {showRPE && set.completed && (
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
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
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
              </>
            );
          })()}

          {/* Add Set button */}
          <button
            type="button"
            onClick={() => addSet(currentExIndex)}
            className="w-full min-h-11 py-2.5 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add Set
          </button>
        </div>

        {/* Set type popover — portal to document.body to escape all parent constraints */}
        {typePopover !== null &&
          createPortal(
            <>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="fixed inset-0"
                style={{ zIndex: 9990 }}
                onClick={() => setTypePopover(null)}
              />
              <div
                className="fixed bg-card rounded-2xl shadow-lg border border-border/50"
                style={{
                  zIndex: 9991,
                  width: 160,
                  left: popoverPosRef.current.left,
                  ...(popoverPosRef.current.bottom > window.innerHeight * 0.6
                    ? {
                        bottom:
                          window.innerHeight - popoverPosRef.current.top + 4,
                      }
                    : { top: popoverPosRef.current.top }),
                }}
              >
                {SET_TYPE_ORDER.map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      setSetType(currentExIndex, typePopover, type);
                      setTypePopover(null);
                      haptic(10);
                    }}
                    className="w-full min-h-11 flex items-center gap-3 px-4 py-3 text-small font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    {type === "working" ? (
                      <div className="size-6 rounded-full border-2 border-muted-foreground/30" />
                    ) : (
                      <div
                        className="size-6 rounded-full flex items-center justify-center text-caption font-bold text-white"
                        style={{ backgroundColor: TYPE_COLORS[type] }}
                      >
                        {TYPE_LABELS[type].charAt(0)}
                      </div>
                    )}
                    {TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}

        {/* Undo last set */}
        <AnimatePresence>
          {lastCompleted && (
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={handleUndo}
              className="mx-auto flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-xs font-medium bg-warning/15 text-warning active:scale-95"
            >
              <RotateCcw className="size-3.5" /> Undo last set
            </motion.button>
          )}
        </AnimatePresence>

        {/* RPE toggle */}
        <button
          type="button"
          onClick={() => setShowRPE(!showRPE)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg transition-colors mx-auto block",
            showRPE
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {showRPE ? "Hide RPE" : "Show RPE"}
        </button>

        {/* Prescription hint */}
        {currentExercise && (
          <p className="text-xs text-muted-foreground text-center">
            Target: {currentExercise.sets}&times;{currentExercise.reps}
            {currentExercise.weight > 0
              ? ` @ ${currentExercise.weight}kg`
              : getExerciseById(currentExercise.exerciseId)?.equipment ===
                  "Bodyweight"
                ? " @ Bodyweight"
                : ""}
          </p>
        )}

        {/* #985 — plate breakdown per side (barbell only). */}
        {plateLoad && plateLoad.perSide.length > 0 && (
          <p className="mt-0.5 text-center text-caption font-mono tabular-nums text-muted-foreground">
            Per side: {plateLoad.perSide.join(" + ")}
            {!plateLoad.exact && ` · ${plateLoad.leftover}kg short`}
          </p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        {isResting ? (
          <Button
            fullWidth
            onClick={stopRest}
            leftIcon={<Play className="size-4" />}
          >
            Ready — Start Next Set
          </Button>
        ) : (
          (() => {
            const allSetsComplete = currentSets.every((s) => s.completed);
            const isLastExercise = currentExIndex >= day.exercises.length - 1;

            if (allSetsComplete && isLastExercise) {
              return (
                <button
                  type="button"
                  onClick={() => setSessionComplete(true)}
                  className="w-full py-3.5 rounded-xl bg-success text-success-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Trophy className="size-4" /> Finish Workout
                </button>
              );
            }
            if (allSetsComplete) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentExIndex((prev) => prev + 1);
                    setCurrentSetIndex(0);
                  }}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Play className="size-4" /> Next Exercise →
                </button>
              );
            }
            return (
              <button
                type="button"
                onClick={completeSet}
                disabled={
                  !currentSets[currentSetIndex] ||
                  currentSets[currentSetIndex]?.completed
                }
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Check className="size-4" /> Complete Set {currentSetIndex + 1}
              </button>
            );
          })()
        )}
      </div>

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
