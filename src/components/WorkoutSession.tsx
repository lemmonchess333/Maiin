import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  showsRpeByDefault,
  toExperience,
} from "@/features/program/experienceModel";
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
import {
  buildInitialSetLogs,
  toCompletionSetLogs,
} from "@/features/program/warmupRamp";
import { formatRepTarget } from "@/features/program/templateConversion";
import { isSetEligibleForStrengthPr } from "@/features/program/sessionSetPolicy";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStreaks } from "@/features/streaks/useStreaks";
import { toast } from "@/lib/toast";
import {
  buildPRMap,
  checkSetPR,
  repBucketLabel,
  buildVolumeBest,
  checkVolumePR,
  exerciseSessionVolume,
  type PRMap,
  type RepBucket,
  type VolumeBestMap,
  getRepBucket,
} from "@/lib/prTracking";
import {
  suggestNextLoad,
  type ProgressionSuggestion,
} from "@/lib/progressionSuggestion";
import { effortCueFor, rpeReserveWords } from "@/features/program/effortCue";
import Tooltip from "@/components/ui/Tooltip";
import PlateCalculatorSheet from "@/components/workout/PlateCalculatorSheet";
import { validateSet } from "@/lib/setValidation";
import { getExerciseById } from "@/lib/exercises";
import { platesPerSide } from "@/lib/plateCalculator";
import {
  useWorkoutDraft,
  computeDraftIdentity,
  createWorkoutCompletionId,
} from "@/hooks/useWorkoutDraft";
import { logger } from "@/lib/logger";
import { useScrollEdges } from "@/hooks/useScrollEdges";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import CircleShareSheet from "@/components/social/CircleShareSheet";
import RestTimerRing from "@/components/workout/RestTimerRing";
import StallModal from "@/components/workout/StallModal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
// Form guide is heavy (react-body-highlighter) â€” lazy-load so it only hydrates
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
  /** PROGRAM-FLEX-01 / PROGRAM-ADAPT-01: present when the caller
   *  handed a reduced COPY of `day` (Express time budget, or Easier
   *  today). Threaded into the completion write and acknowledged on
   *  the complete screen. */
  sessionVariant?: "express45" | "express30" | "easier_today";
  /** Backlog #4: true during a step-back (deload) week â€” the effort cue
   *  under the set counter switches to the step-back line. */
  deloadWeek?: boolean;
  onLogExercise: (
    dayIndex: number,
    exIndex: number,
    reps: number,
    weight: number,
    rpe?: number
  ) => Promise<void>;
  onCompleteDay: (
    dayIndex: number,
    sessionData: {
      completionId: string;
      completionCommandId: string;
      durationMinutes: number;
      setLogs: Array<
        Array<{ weight: number; reps: number; completed: boolean }>
      >;
      sessionVariant?: "express45" | "express30" | "easier_today";
    }
  ) => Promise<unknown>;
  onClose: () => void;
}

export default function WorkoutSession({
  day,
  dayIndex,
  draftScope,
  draftEpoch,
  sessionVariant,
  deloadWeek = false,
  onLogExercise,
  onCompleteDay,
  onClose,
}: Props) {
  const { user, profile } = useAuth();
  const { awardEventBadge } = useStreaks();
  // LIFT-01: bind the draft to this exact session â€” scope + epoch +
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
  // Captured once on mount â€” stable across renders via the stable hook callbacks.
  const initialDraft = useMemo(() => loadDraft(), [loadDraft]);
  // One completion id per session (packet 15). Resumed from the draft when
  // present so a retry/resume targets the SAME workout doc; persisted into
  // every draft save below. Never regenerated per Finish click.
  const completionIdRef = useRef(
    initialDraft?.completionId ?? createWorkoutCompletionId()
  );
  // Packet 18 program-command receipt key â€” session-stable, never regenerated
  // per Finish. Defaults to the completion id for a fresh session.
  const completionCommandIdRef = useRef(
    initialDraft?.completionCommandId ?? completionIdRef.current
  );
  const [showResumePrompt, setShowResumePrompt] = useState(
    initialDraft !== null
  );
  // CIRCLE-SESSION-01 â€” explicit Circle share from the completion
  // screen. The sheet mounts ONLY while open so its Circle reads
  // never fire unless the user taps "Share to Circle".
  const [circleShareOpen, setCircleShareOpen] = useState(false);
  const [currentExIndex, setCurrentExIndex] = useState(
    initialDraft?.currentExIndex ?? 0
  );
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() => {
    if (initialDraft?.setLogs) return initialDraft.setLogs as SetLog[][];
    // Backlog #12: pre-fill a warm-up ramp on the first loaded exercise per
    // body part (N7's scoping rule). They're ordinary rows carrying the
    // existing `warmup` type (N11), so every volume/PR/calorie path that
    // already filters on that type excludes them for free.
    return buildInitialSetLogs(day.exercises);
  });
  // Earned complexity (experienceModel.ts): RPE is a genuinely useful tool
  // for someone who can calibrate it and noise-plus-jargon for someone who
  // cannot, so an advanced lifter opens the session with it on and everyone
  // else opts in. This was `useState(false)` with no gate at all, against a
  // presentation policy that lists RPE under "experience-gated".
  const [showRPE, setShowRPE] = useState(() =>
    showsRpeByDefault(toExperience(profile?.experience))
  );
  // D-LIFT-14: form guide reachable mid-workout (no more exit â†’ History â†’ Form).
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

  // a11y: the set-type popover dismisses on backdrop click (mouse) â€” give
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
      HTMLElement | undefined;
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
  // Backlog #2 (three-axis PR): best single-session volume per exercise.
  // Loaded with the PR map; persisted undo-safe from final setLogs.
  const [volumeBest, setVolumeBest] = useState<VolumeBestMap>({});
  const firedVolumePRs = useRef<Set<string>>(new Set());
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
      let volumeBestLoaded = false;
      try {
        const { doc: fbDoc, getDoc: fbGetDoc } =
          await import("firebase/firestore");
        const prMapDoc = await fbGetDoc(
          fbDoc(db, "users", user.uid, "stats", "prMap")
        );
        if (prMapDoc.exists()) {
      ×8îÚ$z{-®éÜj×7G–ÆS×°¢6WBçG—RÓÒ'v÷&¶–ær ¢ò°¢&6¶w&÷VæD6öÆ÷#¢E•Uô4ôÄõ%5·6WBçG—UÒÀ¢6öÆ÷#¢'v†—FR"À¢Ğ¢¢VæFVf–æV@¢Ğ¢F—FÆS×¶6WBG—S¢G·6WBçG—WÖĞ¢à¢·6WBçG—RÓÓÒ'v÷&¶–ær ¢ò6WD–G‚²¢¢G—T6öæf–ræÆ&VÇĞ¢Âö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öÂ×7âÓ"#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢–b†6äf–ÆÅ&Wbbb6WBæ6ö×ÆWFVBbb&Wb’°¢†F–2ƒ“°¢WFFU6WDÆör€¢7W'&VçDW„–æFW‚À¢6WD–G‚À¢'vV–v‡B"À¢&WbçvV–v‡@¢“°¢WFFU6WDÆör€¢7W'&VçDW„–æFW‚À¢6WD–G‚À¢'&W2"À¢&Wbç&W0¢“°¢Ğ¢×Ğ¢F—6&ÆVC×·6WBæ6ö×ÆWFVBÇÂ6äf–ÆÅ&WgĞ¢6Æ74æÖS×¶6â€¢'FW‡B×6ÖÆÂföçBÖÖöæòF'VÆ"ÖçV×2FW‡BÖ6VçFW"rÖgVÆÂ"À¢6äf–ÆÅ&Wbbb6WBæ6ö×ÆWFV@¢ò'FW‡B×&–Ö'’7F—fS¦÷6—G’Ós ¢¢'FW‡BÖ×WFVBÖf÷&Vw&÷VæB ¢—Ğ¢à¢·&WdÆ&VÇĞ¢Âö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öÂ×7âÓB#à¢Æ–çW@¢G—SÒ&çVÖ&W" ¢fÇVS×·6WBçvV–v‡BÇÂ"'Ğ¢Æ6V†öÆFW#×°¢6WBçvV–v‡BÓÓÒ ¢ò—4%tW†W&6—6P¢ò$%r ¢¢# ¢¢" ¢Ğ¢&–ÖÆ&VÃ×¶6WBG·6WD–G‚²ÒvV–v‡FĞ¢öä6†ævS×²†R’Óà¢WFFU6WDÆör€¢7W'&VçDW„–æFW‚À¢6WD–G‚À¢'vV–v‡B"À¢çVÖ&W"†RçF&vWBçfÇVR’ÇÂ ¢¢Ğ¢F—6&ÆVC×·6WBæ6ö×ÆWFVGĞ¢6Æ74æÖSÒ'rÖgVÆÂ‚Ó"’Ó"ãRÖ–âÖ‚Ó&÷VæFVBÖÆr&rÖ×WFVBFW‡BÖf÷&Vw&÷VæBFW‡B×6ÒföçBÖÖöæòF'VÆ"ÖçV×2FW‡BÖ6VçFW"Æ6V†öÆFW#§FW‡BÖ×WFVBÖf÷&Vw&÷VæBóSF—6&ÆVC¦÷6—G’ÓS ¢óà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öÂ×7âÓ2#à¢Æ–çW@¢G—SÒ&çVÖ&W" ¢fÇVS×·6WBç&W2ÇÂ"'Ğ¢&–ÖÆ&VÃ×¶6WBG·6WD–G‚²ÒG°¢—5F–ÖVDW†W&6—6Rò'6V6öæG2"¢'&W2 ¢ÖĞ¢öä6†ævS×²†R’Óà¢WFFU6WDÆör€¢7W'&VçDW„–æFW‚À¢6WD–G‚À¢'&W2"À¢çVÖ&W"†RçF&vWBçfÇVR’ÇÂ ¢¢Ğ¢F—6&ÆVC×·6WBæ6ö×ÆWFVGĞ¢6Æ74æÖSÒ'rÖgVÆÂ‚Ó"’Ó"ãRÖ–âÖ‚Ó&÷VæFVBÖÆr&rÖ×WFVBFW‡BÖf÷&Vw&÷VæBFW‡B×6ÒföçBÖÖöæòF'VÆ"ÖçV×2FW‡BÖ6VçFW"F—6&ÆVC¦÷6—G’ÓS ¢óà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öÂ×7âÓ"fÆW‚§W7F–g’Ö6VçFW"#à¢·6WBæ6ö×ÆWFVBò€¢ÆÖ÷F–öâæF—`¢–æ—F–Ã×·²66ÆS¢ãR×Ğ¢æ–ÖFS×·²66ÆS¢×Ğ¢G&ç6—F–öã×·²GW&F–öã¢ãR×Ğ¢à¢Ä6†V6²6Æ74æÖSÒ'6—¦RÓRFW‡B×7V66W72"óà¢ÂöÖ÷F–öâæF—cà¢’¢€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢&–ÖÆ&VÃÒ$Ö&²6WB6ö×ÆWFR ¢öä6Æ–6³×²‚’Óâ6ö×ÆWFT–æÆ–æU6WB‡6WD–G‚—Ğ¢6Æ74æÖSÒ&w&÷W6—¦RÓfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"7F—fS§66ÆRÓ“ ¢à¢Ç7â6Æ74æÖSÒ'6—¦RÓr&÷VæFVBÖgVÆÂ&÷&FW"Ó"&÷&FW"Ö&÷&FW"w&÷WÖ†÷fW#¦&÷&FW"×&–Ö'’óSG&ç6—F–öâÖ6öÆ÷'2"óà¢Âö'WGFöãà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢²ò¢–6²Vff÷'B&Vf÷&R6ö×ÆWF–öâ6ò—B&V6†W2F†P¢&öw&W76–öâ6ÆÂÖFRv†VâF†Rf–æÂ6WB—2ÆövvVBâ¢÷Ğ¢·6†÷u%Rbb6WBæ6ö×ÆWFVBbb6WBçG—RÓÒ'v&×W"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&—FV×2Ö6VçFW"vÓ‚ÓB’ÓãR&÷&FW"×B&÷&FW"Ö&÷&FW"ó3&rÖ×WFVBó3#à¢Ç7â6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB×"Ó6VÆbÖ6VçFW"#à¢%S ¢Â÷7ãà¢µ%UôõD”ôå2æÖ‚‡'R’Óâ€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢¶W“×·'WĞ¢öä6Æ–6³×²‚’Óâ°¢†F–2ƒ“°¢WFFU6WE%R†7W'&VçDW„–æFW‚Â6WD–G‚Â'R“°¢×Ğ¢6Æ74æÖS×¶6â€¢&Ö–âÖ‚Ó‚Ó"ãR&÷VæFVBFW‡B×‡2föçBÖÖöæòF'VÆ"ÖçV×2G&ç6—F–öâÖ6öÆ÷'2"À¢6WBç'RÓÓÒ'P¢ò&&r×&–Ö'’FW‡B×&–Ö'’Öf÷&Vw&÷VæB ¢¢&&rÖ×WFVBFW‡BÖ×WFVBÖf÷&Vw&÷VæB†÷fW#§FW‡BÖf÷&Vw&÷VæB ¢—Ğ¢à¢·'WĞ¢Âö'WGFöãà¢’—Ğ¢·G—Vöb6WBç'RÓÓÒ&çVÖ&W""bb€¢Ç7â6Æ74æÖSÒ'rÖgVÆÂÂÓBÓãRFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢Ç7â6Æ74æÖSÒ&föçBÖÖöæòF'VÆ"ÖçV×2#à¢·6WBç'WĞ¢Â÷7ãç²"'Ğ¢+r·'U&W6W'fUv÷&G2‡6WBç'R—Ğ¢Â÷7ãà¢—Ğ¢ÂöF—cà¢—Ğ¢ÂöF—cà¢“°¢Ò—Ğ¢Âóà¢“°¢Ò’‚—Ğ ¢²ò¢FB6WB'WGFöâ¢÷Ğ¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’ÓâFE6WB†7W'&VçDW„–æFW‚—Ğ¢6Æ74æÖSÒ'rÖgVÆÂÖ–âÖ‚Ó’Ó"ãR&÷&FW"×B&÷&FW"Ö&÷&FW"óSFW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB†÷fW#§FW‡BÖf÷&Vw&÷VæBG&ç6—F–öâÖ6öÆ÷'2 ¢à¢²FB6W@¢Âö'WGFöãà¢ÂöF—cà ¢²ò¢6WBG—R÷÷fW"(	B÷'FÂFòFö7VÖVçBæ&öG’FòW66RÆÂ&VçB6öç7G&–çG2¢÷Ğ¢·G—U÷÷fW"ÓÒçVÆÂb`¢7&VFU÷'FÂ€¢Ãà¢²ò¢W6Æ–çBÖF—6&ÆRÖæW‡BÖÆ–æR§7‚Ö’ö6Æ–6²ÖWfVçG2Ö†fRÖ¶W’ÖWfVçG2Â§7‚Ö’öæò×7FF–2ÖVÆVÖVçBÖ–çFW&7F–öç2¢÷Ğ¢ÆF—`¢6Æ74æÖSÒ&f—†VB–ç6WBÓ ¢7G–ÆS×·²¤–æFWƒ¢“““×Ğ¢öä6Æ–6³×²‚’Óâ6WEG—U÷÷fW"†çVÆÂ—Ğ¢óà¢ÆF—`¢6Æ74æÖSÒ&f—†VB&rÖ6&B&÷VæFVBÓ'†Â6†F÷rÖÆr&÷&FW"&÷&FW"Ö&÷&FW"óS ¢7G–ÆS×·°¢¤–æFWƒ¢“““À¢v–GFƒ¢cÀ¢ÆVgC¢÷÷fW%÷5&Vbæ7W'&VçBæÆVgBÀ¢âââ‡÷÷fW%÷5&Vbæ7W'&VçBæ&÷GFöÒâv–æF÷ræ–ææW$†V–v‡B¢ã`¢ò°¢&÷GFöÓ ¢v–æF÷ræ–ææW$†V–v‡BÒ÷÷fW%÷5&Vbæ7W'&VçBçF÷²BÀ¢Ğ¢¢²F÷¢÷÷fW%÷5&Vbæ7W'&VçBçF÷Ò’À¢×Ğ¢à¢µ4UEõE•Uôõ$DU"æÖ‚‡G—R’Óâ€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢¶W“×·G—WĞ¢öä6Æ–6³×²‚’Óâ°¢6WE6WEG—R†7W'&VçDW„–æFW‚ÂG—U÷÷fW"ÂG—R“°¢6WEG—U÷÷fW"†çVÆÂ“°¢†F–2ƒ“°¢×Ğ¢6Æ74æÖSÒ'rÖgVÆÂÖ–âÖ‚ÓfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2FW‡B×6ÖÆÂföçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2 ¢à¢·G—RÓÓÒ'v÷&¶–ær"ò€¢ÆF—b6Æ74æÖSÒ'6—¦RÓb&÷VæFVBÖgVÆÂ&÷&FW"Ó"&÷&FW"Ö×WFVBÖf÷&Vw&÷VæBó3"óà¢’¢€¢ÆF—`¢6Æ74æÖSÒ'6—¦RÓb&÷VæFVBÖgVÆÂfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"FW‡BÖ6F–öâföçBÖ&öÆBFW‡B×v†—FR ¢7G–ÆS×·²&6¶w&÷VæD6öÆ÷#¢E•Uô4ôÄõ%5·G—UÒ×Ğ¢à¢µE•UôÄ$TÅ5·G—UÒæ6†$Bƒ—Ğ¢ÂöF—cà¢—Ğ¢µE•UôÄ$TÅ5·G—U×Ğ¢Âö'WGFöãà¢’—Ğ¢ÂöF—cà¢ÂóâÀ¢Fö7VÖVçBæ&öG¢—Ğ ¢²ò¢VæFòÆ7B6WB¢÷Ğ¢Äæ–ÖFU&W6Væ6Sà¢¶Æ7D6ö×ÆWFVBbb€¢ÆÖ÷F–öâæ'WGFöà¢–æ—F–Ã×·²÷6—G“¢Â“¢Ó‚×Ğ¢æ–ÖFS×·²÷6—G“¢Â“¢×Ğ¢W†—C×·²÷6—G“¢Â“¢Ó‚×Ğ¢öä6Æ–6³×¶†æFÆUVæF÷Ğ¢6Æ74æÖSÒ&×‚ÖWFòfÆW‚—FV×2Ö6VçFW"vÓãRÖ–âÖ‚Ó‚ÓB&÷VæFVB×†ÂFW‡B×‡2föçBÖÖVF—VÒ&r×v&æ–æróRFW‡B×v&æ–ær7F—fS§66ÆRÓ“R ¢à¢Å&÷FFT67r6Æ74æÖSÒ'6—¦RÓ2ãR"óâVæFòÆ7B6W@¢ÂöÖ÷F–öâæ'WGFöãà¢—Ğ¢Âôæ–ÖFU&W6Væ6Sà ¢²ò¢%RFövvÆR¢÷Ğ¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE6†÷u%R‚6†÷u%R—Ğ¢6Æ74æÖS×¶6â€¢'FW‡B×‡2‚Ó2’ÓãR&÷VæFVBÖÆrG&ç6—F–öâÖ6öÆ÷'2×‚ÖWFò&Æö6²"À¢6†÷u%P¢ò&&r×&–Ö'’óFW‡B×&–Ö'’ ¢¢&&rÖ×WFVBFW‡BÖ×WFVBÖf÷&Vw&÷VæB ¢—Ğ¢à¢·6†÷u%Rò$†–FR%R"¢%6†÷r%R'Ğ¢Âö'WGFöãà ¢²ò¢&W67&—F–öâ†–çB¢÷Ğ¢¶7W'&VçDW†W&6—6Rbb€¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæBFW‡BÖ6VçFW"#à¢F&vWC¢¶7W'&VçDW†W&6—6Rç6WG7ÒgF–ÖW3°¢¶f÷&ÖE&WF&vWB†7W'&VçDW†W&6—6R—Ğ¢¶7W'&VçDW†W&6—6RçvV–v‡Bâ ¢òG¶7W'&VçDW†W&6—6RçvV–v‡GÖ¶v ¢¢vWDW†W&6—6T'”–B†7W'&VçDW†W&6—6RæW†W&6—6T–B“òæWV—ÖVçBÓÓĞ¢$&öG—vV–v‡B ¢ò"&öG—vV–v‡B ¢¢"'Ğ¢Â÷à¢—Ğ ¢²ò¢3“ƒR(	BÆFR'&V¶F÷vâW"6–FR†&&&VÆÂöæÇ’’â¢÷Ğ¢·ÆFTÆöBbbÆFTÆöBçW%6–FRæÆVæwF‚âbb€¢Ç6Æ74æÖSÒ&×BÓãRFW‡BÖ6VçFW"FW‡BÖ6F–öâföçBÖÖöæòF'VÆ"ÖçV×2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢W"6–FS¢·ÆFTÆöBçW%6–FRæ¦ö–â‚"²"—Ğ¢²ÆFTÆöBæW†7Bbb+rG·ÆFTÆöBæÆVgF÷fW'Ö¶r6†÷'FĞ¢Â÷à¢—Ğ¢ÂöF—cà ¢²ò¢&÷GFöÒ7F–öâ&"¢÷Ğ¢ÆF—b6Æ74æÖSÒ'‚ÓB’Ó2&÷&FW"×B&÷&FW"Ö&÷&FW"óS&rÖ&6¶w&÷VæB#à¢¶—5&W7F–ærò€¢Ä'WGFöà¢gVÆÅv–GF€¢öä6Æ–6³×·7F÷&W7GĞ¢ÆVgD–6öã×³ÅÆ’6Æ74æÖSÒ'6—¦RÓB"óçĞ¢à¢&VG’(	B7F'BæW‡B6W@¢Âô'WGFöãà¢’¢€¢‚‚’Óâ°¢6öç7BÆÅ6WG46ö×ÆWFRÒ7W'&VçE6WG2æWfW'’‚‡2’Óâ2æ6ö×ÆWFVB“°¢6öç7B—4Æ7DW†W&6—6RÒ7W'&VçDW„–æFW‚ãÒF’æW†W&6—6W2æÆVæwF‚Ò° ¢–b†ÆÅ6WG46ö×ÆWFRbb—4Æ7DW†W&6—6R’°¢&WGW&â€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE6W76–öä6ö×ÆWFR‡G'VR—Ğ¢6Æ74æÖSÒ'rÖgVÆÂ’Ó2ãR&÷VæFVB×†Â&r×7V66W72FW‡B×7V66W72Öf÷&Vw&÷VæBföçB×6VÖ–&öÆBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"†÷fW#¦÷6—G’Ó“G&ç6—F–öâÖ÷6—G’ ¢à¢ÅG&÷‡’6Æ74æÖSÒ'6—¦RÓB"óâf–æ—6‚v÷&¶÷W@¢Âö'WGFöãà¢“°¢Ğ¢–b†ÆÅ6WG46ö×ÆWFR’°¢&WGW&â€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢6WD7W'&VçDW„–æFW‚‚‡&Wb’Óâ&Wb²“°¢6WD7W'&VçE6WD–æFW‚ƒ“°¢×Ğ¢6Æ74æÖSÒ'rÖgVÆÂ’Ó2ãR&÷VæFVB×†Â&r×&–Ö'’FW‡B×&–Ö'’Öf÷&Vw&÷VæBföçB×6VÖ–&öÆBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"†÷fW#¦÷6—G’Ó“G&ç6—F–öâÖ÷6—G’ ¢à¢ÅÆ’6Æ74æÖSÒ'6—¦RÓB"óâæW‡BW†W&6—6R(i ¢Âö'WGFöãà¢“°¢Ğ¢&WGW&â€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶6ö×ÆWFU6WGĞ¢F—6&ÆVC×°¢7W'&VçE6WG5¶7W'&VçE6WD–æFW…ÒÇÀ¢7W'&VçE6WG5¶7W'&VçE6WD–æFW…Óòæ6ö×ÆWFV@¢Ğ¢6Æ74æÖSÒ'rÖgVÆÂ’Ó2ãR&÷VæFVB×†Â&r×&–Ö'’FW‡B×&–Ö'’Öf÷&Vw&÷VæBföçB×6VÖ–&öÆBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"†÷fW#¦÷6—G’Ó“G&ç6—F–öâÖ÷6—G’F—6&ÆVC¦÷6—G’ÓS ¢à¢Ä6†V6²6Æ74æÖSÒ'6—¦RÓB"óâ6ö×ÆWFR6WB¶7W'&VçE6WD–æFW‚²Ğ¢Âö'WGFöãà¢“°¢Ò’‚¢—Ğ¢ÂöF—cà ¢ÅÆFT6Æ7VÆF÷%6†VW@¢÷Vã×·6†÷uÆFW7Ğ¢öä6Æ÷6S×²‚’Óâ6WE6†÷uÆFW2†fÇ6R—Ğ¢vV–v‡D¶s×°¢7W'&VçE6WG5¶7W'&VçE6WD–æFW…ÓòçvV–v‡BÇÀ¢7W'&VçE6WG2æf–æB‚‡7B’Óâ7BçvV–v‡Bâ“òçvV–v‡BÇÀ¢ ¢Ğ¢óà ¢¶7W'&VçDW†W&6—6SòææÖRbb€¢Ä&÷GFöÕ6†VW@¢÷Vã×·6†÷tf÷&ÔwV–FWĞ¢öä÷Vä6†ævS×·6WE6†÷tf÷&ÔwV–FWĞ¢F—FÆS×¶7W'&VçDW†W&6—6RææÖWĞ¢à¢ÆF—b6Æ74æÖSÒ'‚ÓB"Ób#à¢Å7W7Vç6P¢fÆÆ&6³×°¢ÆF—b6Æ74æÖSÒ'’ÓfÆW‚§W7F–g’Ö6VçFW"#à¢Å7–ææW"óà¢ÂöF—cà¢Ğ¢à¢ÄW†W&6—6Tf÷&Ô6öçFVç@¢W†W&6—6TæÖS×¶7W'&VçDW†W&6—6RææÖWĞ¢7F—fS×·6†÷tf÷&ÔwV–FWĞ¢óà¢Âõ7W7Vç6Sà¢ÂöF—cà¢Âô&÷GFöÕ6†VWCà¢—Ğ¢ÂöF—cà¢“°§Ğ