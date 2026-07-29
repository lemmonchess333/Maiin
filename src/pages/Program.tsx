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
  draftScopeForVariant,
  type SessionVariant,
} from "@/features/program/expressSession";
import {
  buildEasierSession,
  easierTodayRecommendation,
  pickLighterDay,
  isLowerBodyDay,
  recoveringTargetMuscles,
} from "@/features/program/easierToday";
import {
  computeMuscleRecovery,
  hitsFromWorkoutDocs,
} from "@/lib/muscleRecovery";
import { isHardRun } from "@/lib/hybridGuidance";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import { useRunningStats } from "@/hooks/useRunningStats";
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
import { repUnitForExerciseId } from "@/features/program/repUnits";
import { formatRepTarget } from "@/features/program/templateConversion";
import {
  loadContextFrom,
  weightAfterExerciseSwap,
} from "@/features/program/startingLoads";
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
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { runHeaderLine } from "@/lib/runHeaderLine";

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
  // 0kg isn't a meaningful "volume achievement" â€” it just means
  // every exercise in the session was bodyweight or uncalibrated, in
  // which case asserting "0kg" reads as a loss rather than as
  // "weight wasn't the metric here." Show an em-dash instead.
  if (kg <= 0) return "â€”";
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
    setNextWorkout,
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
    restoreRunDay,
    restoreWorkoutDay,
    moveRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
    realignRacePlan,
    dismissFellBehindPrompt,
    applyDeloadWeek,
    revertDeloadWeek,
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
  // the current week is the spec's banner trigger. Lazy â€” at most 2
  // weeks fetched (current + previous) since the banner only consults
  // the current.
  const { currentWeek: perfWeek } = usePerformanceWeeks(2);
  // PROGRAM-DELOAD-01: Apply routes through the server applyDeloadWeek
  // command; undo lives in the success toast (reversibility-over-
  // confirmation â€” no dialog). The banner itself fires the 'applied'
  // telemetry; the undo path tracks 'undo' here since the toast owns it.
  const handleApplyDeload = useCallback(async (): Promise<boolean> => {
    const ok = await applyDeloadWeek();
    if (!ok) {
      toast.error(
        "Couldn't apply the deload. Check your connection and try again."
      );
      return false;
    }
    toast.success("Deload applied â€” this week's loads are eased", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          void revertDeloadWeek().then((reverted) => {
            if (reverted) {
              trackProgrammeEvent("programme_deload_banner_action", {
                action: "undo",
              });
              toast.success("Deload undone â€” this week is back to plan");
            } else {
              toast.error("Couldn't undo the deload.");
            }
          });
        },
      },
    });
    return true;
  }, [applyDeloadWeek, revertDeloadWeek]);
  const runsTarget = getWeeklyRunTarget(profile);
  // PR-2: weekly layout editor sheet. Mounted conditionally â€” when
  // closed the body unmounts and the inner useProgrammeScheduleEditor
  // hook tears down, so the next open re-reads `profile` fresh.
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const openEditLayout = useCallback(() => {
    setEditLayoutOpen(true);
  }, []);
  // PR-3: 2-tab segmented control â€” Lift | Run. Today / Week shells
  // were retired once Home owned today-glance (via the shared
  // `resolveTrainingDayForDate` path â€” PR-0c) and DayActionSheet
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

    // workouts are sorted by date desc â€” first occurrence of an exercise is the most recent
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
  // instead of snapping to today â€” a fresh open (no ?day) still lands on today.
  const urlDay = (() => {
    const raw = searchParams.get("day");
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  })();
  const [selectedDayIndex, setSelectedDayIndex] = useState(urlDay ?? 0);
  const setDayInUrl = useCallback(
    (i: number) => {
      // replace (not push) so day taps don't stack history entries â€” back
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

  // PROGRAM-ADAPT-01 â€” inputs for the "Easier today" recommendation.
  // All from EXISTING data sources: recentWorkouts is the page's own
  // subscription, perfWeek already feeds the deload banner, and
  // useRunningStats is a bounded one-shot read (2 days covers
  // "yesterday"). The decision itself is pure (easierToday.ts) and
  // yields ONE factual reason â€” never a readiness score, and never the
  // performance recoveryScore.
  const { runs: recentRuns } = useRunningStats(2);
  const easierRecommendationForChooser = useMemo(() => {
    if (expressChooserDay === null) return null;
    const day = programState?.workouts[expressChooserDay];
    if (!day) return null;
    const yKey = localDateString(addLocalDays(new Date(), -1));
    const hardRunYesterday = recentRuns.some(
      (r) =>
        !r.isInvalid &&
        !r.savedAnyway &&
        localDateString(new Date(r.completedAt)) === yKey &&
        isHardRun(r)
    );
    const entries = computeMuscleRecovery(
      hitsFromWorkoutDocs(recentWorkouts),
      localDateString()
    );
    return easierTodayRecommendation({
      hardRunYesterday,
      lowerBodyDay: isLowerBodyDay(day),
      recoveringMuscles: recoveringTargetMuscles(day, entries),
      deloadRecommended: !!perfWeek?.flags?.deloadRecommended,
    });
  }, [expressChooserDay, programState, recentRuns, recentWorkouts, perfWeek]);

  // Skip confirmation
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipTargetDay, setSkipTargetDay] = useState<number | null>(null);

  // Swipe navigation
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Exercise card state â€” read-only, tap opens info sheet
  const [reorderMode, setReorderMode] = useState(false);
  // PR-2: reorderMode is meaningless outside the Lift tab â€” the
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
 ×ÞyöÚ$z{-®éÜj×ÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2FW‡BÖÆVgBFW‡B×6ÒFW‡BÖFW7G'V7F—fR†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2&÷&FW"Ö"&÷&FW"Ö&÷&FW"ó3 ¢à¢ÅG&6ƒ"6Æ74æÖSÒ'6—¦RÓB"óâ&VÖ÷fRW†W&6—6P¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢Ö÷fTW†W&6—6R†6öçFW‡DÖVçRæF”–æFW‚Â6öçFW‡DÖVçRæW„–æFW‚ÂÓ“°¢×Ð¢F—6&ÆVC×¶6öçFW‡DÖVçRæW„–æFW‚ÓÓÒÐ¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2FW‡BÖÆVgBFW‡B×6ÒFW‡BÖf÷&Vw&÷VæB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2&÷&FW"Ö"&÷&FW"Ö&÷&FW"ó3F—6&ÆVC¦÷6—G’Ó3 ¢à¢Ä'&÷uW6Æ74æÖSÒ'6—¦RÓBFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óâÖ÷fRW ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢Ö÷fTW†W&6—6R†6öçFW‡DÖVçRæF”–æFW‚Â6öçFW‡DÖVçRæW„–æFW‚Â“°¢×Ð¢F—6&ÆVC×°¢6öçFW‡DÖVçRæW„–æFW‚ãÐ¢†F—7Æ•v÷&¶÷WG5¶6öçFW‡DÖVçRæF”–æFW…ÓòæW†W&6—6W2æÆVæwF‚óð¢’Ð¢¢Ð¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2FW‡BÖÆVgBFW‡B×6ÒFW‡BÖf÷&Vw&÷VæB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2F—6&ÆVC¦÷6—G’Ó3 ¢à¢Ä'&÷tF÷vâ6Æ74æÖSÒ'6—¦RÓBFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óâÖ÷fRF÷và¢Âö'WGFöãà¢ÂöÖ÷F–öâæF—cà¢Âóà¢—Ð¢Âôæ–ÖFU&W6Væ6Sà ¢²ò¢6¶—6öæf—&ÖF–öâ6†VWB¢÷Ð¢Å6¶—6öæf—&Õ6†VW@¢÷Vã×·6†÷u6¶—6öæf—&×Ð¢6W76–öäæÖS×°¢6¶—F&vWDF’ÓÒçVÆÀ¢ò†F—7Æ•v÷&¶÷WG5·6¶—F&vWDF•ÓòæF”æÖRóò""¢¢" ¢Ð¢öä6öæf—&Ó×¶7–æ2‚’Óâ°¢–b‡6¶—F&vWDF’ÓÒçVÆÂ’°¢v—B6¶—v÷&¶÷WDF’‡6¶—F&vWDF’“°¢†F–2‚&ÖVF—VÒ"“°¢òòWFòÖGfæ6RFòæW‡B–æ6ö×ÆWFRF¢6öç7BæW‡D–æ6ö×ÆWFRÒF—7Æ•v÷&¶÷WG2æf–æD–æFW‚€¢†BÂ’’Óâ’ÓÒ6¶—F&vWDF’bbBæ6ö×ÆWFVBbbBç6¶—V@¢“°¢–b†æW‡D–æ6ö×ÆWFRãÒ’°¢†æFÆU6VÆV7B†æW‡D–æ6ö×ÆWFR“°¢Ð¢Ð¢6WE6†÷u6¶—6öæf—&Ò†fÇ6R“°¢6WE6¶—F&vWDF’†çVÆÂ“°¢×Ð¢öä6æ6VÃ×²‚’Óâ°¢6WE6†÷u6¶—6öæf—&Ò†fÇ6R“°¢6WE6¶—F&vWDF’†çVÆÂ“°¢×Ð¢óà ¢²ò¢&R×6W76–öâ6†ö÷6W"…$ôu$ÒÔdÄU‚Ó²$ôu$ÒÔDBÓ’¢÷Ð¢ÄW‡&W756W76–öå6†VW@¢÷Vã×¶W‡&W746†ö÷6W$F’ÓÒçVÆÇÐ¢F“×°¢W‡&W746†ö÷6W$F’ÓÒçVÆÀ¢ò‡&öw&Õ7FFRçv÷&¶÷WG5¶W‡&W746†ö÷6W$F•ÒóòçVÆÂ¢¢çVÆÀ¢Ð¢V6–W%&V6öÖÖVæFF–öã×¶V6–W%&V6öÖÖVæFF–öäf÷$6†ö÷6W'Ð¢Æ–v‡FW$F“×°¢W‡&W746†ö÷6W$F’ÓÒçVÆÀ¢ò–6´Æ–v‡FW$F’‡&öw&Õ7FFRçv÷&¶÷WG2ÂW‡&W746†ö÷6W$F’¢¢çVÆÀ¢Ð¢öå7vFôF“×²†–æFW‚’Óâ°¢6WDW‡&W746†ö÷6W$F’†çVÆÂ“°¢6WE6W76–öåf&–çB‚&gVÆÂ"“°¢6WE6W76–öäF”–æFW‚†–æFW‚“°¢×Ð¢öä6Æ÷6S×²‚’Óâ6WDW‡&W746†ö÷6W$F’†çVÆÂ—Ð¢öå7F'C×²‡f&–çB’Óâ°¢6öç7B–G‚ÒW‡&W746†ö÷6W$F“°¢6WDW‡&W746†ö÷6W$F’†çVÆÂ“°¢–b†–G‚ÓÓÒçVÆÂ’&WGW&ã°¢6WE6W76–öåf&–çB‡f&–çB“°¢6WE6W76–öäF”–æFW‚†–G‚“°¢×Ð¢óà ¢²ò¢–âÕ6W76–öâv÷&¶÷WB67&VVâ¢÷Ð¢·6W76–öäF”–æFW‚ÓÒçVÆÂb`¢&öw&Õ7FFRçv÷&¶÷WG5·6W76–öäF”–æFW…Òb`¢‚‚’Óâ°¢òòW‡&W72f&–çG2'VâFWFW&Ö–æ—7F–6ÆÇ’G&–ÖÖVB4õ’ö`¢òòF†RF’(	BF†R7F÷&VB&öw&ÖÖRF’—2æWfW"×WFFVBÂæ@¢òòF†RÄ”eBÓG&gB–FVçF—G’FW&—fW2g&öÒF†RG&–ÖÖVBÆ–÷W@¢òò6ògVÆÂ×6W76–öâG&gB6âwB&W7F÷&R–çFòâW‡&W72'Và¢òò†÷"f–6RfW'6’âF†R6W76–öâÆöw26WG2÷6—F–öæÆÇ’÷fW ¢òòF†RE$”ÔÔTBÆ—7BÂv†–ÆRÆötW†W&6—6RæB6ö×ÆWFUv÷&¶÷WDF¢òò–æFW‚–çFòF†R5Dõ$TBF’(	B&÷F‚6ÆÆ&6·2&VÆ–vâF‡&÷Vv€¢òòÆâç6÷W&6T–æFW†W26òG&÷VB66W76÷'’6âwB6†–g@¢òò&öw&W76–öâ÷"F†R6fVB&V6÷&BöçFòF†Rw&öærÆ–gBà¢6öç7B7F÷&VDF’Ò&öw&Õ7FFRçv÷&¶÷WG5·6W76–öäF”–æFW…Ó°¢òòV6–W"FöF’…$ôu$ÒÔDBÓ’—2F†R6ÖRW†V7WF–öâÖ6ÆöæP¢òò6öçG&7B2W‡&W73¢&VGV6VB4õ’'Vç3²F†R7F÷&VBF’—0¢òòVçF÷V6†VBâ—G26÷W&6T–æFW†W2&RF†R–FVçF—G’Ö–æp¢òò†æ÷F†–ærG&÷VB’Â6òF†RvVæW&–2&VÆ–væÖVçB&VÆ÷r—2¢òòæòÖ÷F†B¶VW2öæR6öFRF‚f÷"ÆÂG&–ÖÖVBf&–çG2à¢6öç7BÆâÐ¢6W76–öåf&–çBÓÓÒ&gVÆÂ ¢òçVÆÀ¢¢6W76–öåf&–çBÓÓÒ&V6–W%÷FöF’ ¢ò'V–ÆDV6–W%6W76–öâ‡7F÷&VDF’¢¢'V–ÆDW‡&W756W76–öâ‡7F÷&VDF’Â6W76–öåf&–çB“°¢&WGW&â€¢Åv÷&¶÷WE6W76–öà¢FVÆöEvVV³×·&öw&Õ7FFRæ7W'&VçE†6RÓÓÒ&FVÆöB'Ð¢F“×°¢Æâò²ââç7F÷&VDF’ÂW†W&6—6W3¢ÆâæW†W&6—6W2Ò¢7F÷&VDF¢Ð¢F”–æFWƒ×·6W76–öäF”–æFW‡Ð¢G&gDWö6ƒ×·&öw&Õ7FFRçvVV´çVÖ&W'Ð¢òòf&–çB×66÷VBG&gBæÖW76R…$ôu$ÒÔDBÓ¢òòföÆÆ÷r×W“¢F†RG&gB–FVçF—G’f–ævW'&–çG2F†P¢òòW†W&6—6RÄ”õUB†–G29r6WG2’'WBæ÷BÆöG2Â6òà¢òòV6–W"6ÆöæRv†÷6R6WBÖfÆö÷'2ÆÂ&–æBv÷VÆB6†&Rà¢òò–FVçF—G’v—F‚F†RgVÆÂ6W76–öâæBÖ–B×6W76–öâ¶–ÆÀ¢òò6÷VÆB&W7F÷&R—G2Æöw2–çFòF†R÷F†W"f&–çB(	@¢òò6ö×ÆWF–ærVæFW"F†Rw&öær6W76–öåf&–çBÆ&VÂà¢òò66÷–ær'’f&–çBÖ¶W2&W7F÷&RFWFW&Ö–æ—7F–3¢à¢òòV6–W"G&gBöæÇ’WfW"&W7VÖW2âV6–W"6W76–öâà¢G&gE66÷S×¶G&gE66÷Tf÷%f&–çB‡6W76–öåf&–çB—Ð¢6W76–öåf&–çC×°¢Æà¢ò‡Æâçf&–çB2W†6ÇVFSÅ6W76–öåf&–çBÂ&gVÆÂ#â¢¢VæFVf–æV@¢Ð¢öäÆötW†W&6—6S×°¢6W76–öåf&–çBÓÓÒ&V6–W%÷FöF’ ¢òòòâV6–W"6W76–öâäUdU"F÷V6†W2F†R7F÷&V@¢òò&öw&ÖÖS¢æò&öw&W76–öâÂæòÆ7DGFV×FVBð¢òòÆ7EW&f÷&Öæ6RWFFW2ÂæòÆFVR6÷VçF–ærà¢òò†ÆötW†W&6—6Rw&—FW2&öw&ÖÖR7FFRWfVâv—F€¢òòWFõ&öw&W76–öâöfbÂ6ò—B—26¶—VBVçF—&VÇ’(	@¢òòF†RÆâF†RW6W"&WGW&ç2Fò—2W†7FÇ’F†RÆà¢òòF†W’ÆVgBÂæBÆ–v‡FW"F’6âwBfVVBgWGW&P¢òòÆöBFV6—6–öç2â¢7–æ2‚’Óâ·Ð¢¢Æà¢ò†F’ÂW„–G‚Â&W2ÂvV–v‡BÂ'R’Óà¢ÆötW†W&6—6R€¢F’À¢Æâç6÷W&6T–æFW†W5¶W„–G…ÒóòW„–G‚À¢&W2À¢vV–v‡BÀ¢'P¢¢¢ÆötW†W&6—6P¢Ð¢öä6ö×ÆWFTF“×°¢Æà¢ò†F’Â6B’Óâ°¢òò&RÖW‡æBG&–ÖÖVB6WDÆöw2Fò7F÷&VBÖF¢òò÷6—F–öç2âG&÷VBW†W&6—6W2vWBµÒ‡&V6÷&FV@¢òò2¦W&ò6ö×ÆWFVB6WG2(	B6ÖR2âW†W&6—6P¢òòF†RW6W"6¶—VBÖ–B×6W76–öâ’ÂäUdU"VæFVf–æV@¢òò‡VæFVf–æVBfÆÇ2&6²FòÆææVBÆÂÖ6ö×ÆWFV@¢òòFFÂv†–6‚v÷VÆBf¶Rv÷&²æWfW"FöæR’à¢6öç7BÆ–væVBÒ7F÷&VDF’æW†W&6—6W2æÖ€¢‚’Óà¢µÒ2°¢vV–v‡C¢çVÖ&W#°¢&W3¢çVÖ&W#°¢6ö×ÆWFVC¢&ööÆVã°¢ÕµÐ¢“°¢Æâç6÷W&6T–æFW†W2æf÷$V6‚‚‡7&4–G‚Â’’Óâ°¢Æ–væVE·7&4–G…ÒÒ6Bç6WDÆöw5¶•ÒóòµÓ°¢Ò“°¢&WGW&â6ö×ÆWFUv÷&¶÷WDF’†F’Â°¢ââç6BÀ¢6WDÆöw3¢Æ–væVBÀ¢Ò“°¢Ð¢¢6ö×ÆWFUv÷&¶÷WDF¢Ð¢öä6Æ÷6S×²‚’Óâ°¢6WE6W76–öäF”–æFW‚†çVÆÂ“°¢6WE6W76–öåf&–çB‚&gVÆÂ"“°¢×Ð¢óà¢“°¢Ò’‚—Ð ¢²ò¢W†W&6—6R–6¶W"(	BFBÖöFR‡66÷VBFòFE–6¶W$F”–æFW‚’¢÷Ð¢ÄW†W&6—6U–6¶W ¢÷Vã×·6†÷tFE–6¶W'Ð¢†VFW%F—FÆSÒ$FBW†W&6—6R ¢W†—7F–ætW†W&6—6T–G3×°¢&öw&Õ7FFRçv÷&¶÷WG5¶FE–6¶W$F”–æFW‚óò–G…ÓòæW†W&6—6W2æÖ€¢†W‚’ÓâW‚æW†W&6—6T–@¢’óòµÐ¢Ð¢öå6VÆV7C×²†W‚’ÓâFDW†W&6—6W5FôF’†FE–6¶W$F”–æFW‚óò–G‚Â¶W…Ò—Ð¢öä×VÇF•6VÆV7C×²†W‡2’Óà¢FDW†W&6—6W5FôF’†FE–6¶W$F”–æFW‚óò–G‚ÂW‡2¢Ð¢öä6Æ÷6S×²‚’Óâ°¢6WE6†÷tFE–6¶W"†fÇ6R“°¢6WDFE–6¶W$F”–æFW‚†çVÆÂ“°¢×Ð¢öå&VÖ÷fTW†W&6—6S×²†–B’Óà¢&VÖ÷fTW„g&öÔF”'”–B†FE–6¶W$F”–æFW‚óò–G‚Â–B¢Ð¢óà ¢²ò¢W†W&6—6R–6¶W"(	B&WÆ6RÖöFR¢÷Ð¢·&WÆ6UF&vWBÓÒçVÆÂbb€¢ÄW†W&6—6U–6¶W ¢÷Vã×·G'VWÐ¢†VFW%F—FÆS×¶&WÆ6RG·&öw&Õ7FFRçv÷&¶÷WG5·&WÆ6UF&vWBæF”–æFW…ÓòæW†W&6—6W5·&WÆ6UF&vWBæW„–æFW…ÓòææÖRÇÂ$W†W&6—6R'ÖÐ¢öå6VÆV7C×²†W‚’Óà¢&WÆ6TW†W&6—6R‡&WÆ6UF&vWBæF”–æFW‚Â&WÆ6UF&vWBæW„–æFW‚ÂW‚¢Ð¢öä6Æ÷6S×²‚’Óâ6WE&WÆ6UF&vWB†çVÆÂ—Ð¢óà¢—Ð ¢²ò¢"Ó#¢VF—BvVV¶Ç’Æ–÷WB6†VWBâ&WGW&ç2çVÆÂv†Vâ6Æ÷6VB(	@¢6òF†R&öG’6ö×öæVçB†æB—G2W6U&öw&ÖÖU66†VGVÆTVF—F÷ ¢†öö²’öæÇ’Ö÷VçG2v†–ÆRF†R6†VWB—2÷VââF†Bw2F†P¢‡–G&F–öâwV&çFVS¢V6‚÷Vâ—2g&W6‚†öö²Ö÷VçBF†@¢&R×&VG2F†R7W'&VçB&öf–ÆRâ¢÷Ð¢Å66†VGVÆTÆ–÷WE6†VW@¢÷Vã×¶VF—DÆ–÷WD÷VçÐ¢öä6Æ÷6S×²‚’Óâ6WDVF—DÆ–÷WD÷Vâ†fÇ6R—Ð¢&öf–ÆS×·&öf–ÆWÐ¢WFFU&öf–ÆS×·WFFU&öf–ÆWÐ¢&Vg&W6…'Vå66†VGVÆS×·&Vg&W6…'Vå66†VGVÆWÐ¢&VvVæW&FU&öw&Ó×·&VvVæW&FU&öw&×Ð¢óà ¢²ò¢÷fW&fÆ÷rÖVçR6†VWB¢÷Ð¢Äæ–ÖFU&W6Væ6Sà¢·6†÷t÷fW&fÆ÷rbb€¢Ãà¢ÆÖ÷F–öâæF—`¢–æ—F–Ã×·²÷6—G“¢×Ð¢æ–ÖFS×·²÷6—G“¢×Ð¢W†—C×·²÷6—G“¢×Ð¢6Æ74æÖSÒ&f—†VB–ç6WBÓ&rÖ&Æ6²óS¢ÓC ¢öä6Æ–6³×²‚’Óâ6WE6†÷t÷fW&fÆ÷r†fÇ6R—Ð¢óà¢ÆÖ÷F–öâæF—`¢&öÆSÒ&F–Æör ¢&–ÖÖöFÃÒ'G'VR ¢–æ—F–Ã×·²“¢#R"×Ð¢æ–ÖFS×·²“¢×Ð¢W†—C×·²“¢#R"×Ð¢G&ç6—F–öã×·²G—S¢'7&–ær"ÂF×–æs¢#RÂ7F–ffæW73¢3×Ð¢6Æ74æÖSÒ&f—†VB&÷GFöÒÓÆVgBÓ&–v‡BÓ¢ÓS&÷VæFVB×BÓ'†Â6fRÖ&V×"&rÖ6&B&÷&FW"×B&÷&FW"Ö&÷&FW"óS ¢à¢ÆF—b6Æ74æÖSÒ&Ö‚×rÖÖB×‚ÖWFòÓR76R×’Ó#à¢ÆF—b6Æ74æÖSÒ'rÓ‚Ó&÷VæFVBÖgVÆÂ&rÖ&÷&FW"×‚ÖWFòÖ"Ó2"óà¢²ò¢&V÷&FW"W†W&6—6W2(	BVçFW'2F†RG&r×Fò×&V÷&FW"ÖöFRf÷ ¢FöF’w2Æ–gB6W76–öââÖ÷fVB†W&Rg&öÒW&ÖæVçB†VFW ¢–6öã¢—Bw2Æ÷rÖg&WVVæ7’ÆâVF—BÂ6ò—BÆ—fW2v—F‚F†P¢÷F†W"VF—B7F–öç2–ç7FVBöbö67W––ær†VFW"76RâöæÇ¢öffW&VBv†W&R—Bv÷&·2(	BÆ–gBF"v—F‚ÆövvVBv÷&¶÷WG2â¢÷Ð¢¶7F—fUF"ÓÓÒ&Æ–gB"b`¢‡&öw&Õ7FFSòçv÷&¶÷WG3òæÆVæwF‚óò’âbb€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢6WE6†÷t÷fW&fÆ÷r†fÇ6R“°¢6WE&V÷&FW$ÖöFR‡G'VR“°¢×Ð¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2ãR&÷VæFVB×†ÂFW‡BÖÆVgB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2 ¢7G–ÆS×·²Ö–ä†V–v‡C¢CB×Ð¢à¢Ä'&÷uWF÷vâ6Æ74æÖSÒ'6—¦RÓRFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óà¢Ç7â6Æ74æÖSÒ&fÆW‚Ó#à¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×6ÒföçBÖÖVF—VÒFW‡BÖf÷&Vw&÷VæB#à¢&V÷&FW"W†W&6—6W0¢Â÷7ãà¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢G&rFò6†ævRFöF’f÷3·2÷&FW ¢Â÷7ãà¢Â÷7ãà¢Âö'WGFöãà¢—Ð¢²ò¢VF—BvVV¶Ç’Æ–÷WB(	B÷Vç266†VGVÆTÆ–÷WE6†VWB‡F†P¢F’Ö'’ÖF’&W7BôÆ–gBõ'Vâô&÷F‚w&–B’âf÷VæFF–öæÂÂg&VRâ¢÷Ð¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢6WE6†÷t÷fW&fÆ÷r†fÇ6R“°¢÷VäVF—DÆ–÷WB‚“°¢×Ð¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2ãR&÷VæFVB×†ÂFW‡BÖÆVgB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2 ¢7G–ÆS×·²Ö–ä†V–v‡C¢CB×Ð¢à¢Ä6ÆVæF$F—26Æ74æÖSÒ'6—¦RÓRFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óà¢Ç7â6Æ74æÖSÒ&fÆW‚Ó#à¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×6ÒföçBÖÖVF—VÒFW‡BÖf÷&Vw&÷VæB#à¢VF—BvVV¶Ç’Æ–÷W@¢Â÷7ãà¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢6WBv†–6‚F—2&R&W7BÂÆ–gBÂ'Vâ÷"&÷F€¢Â÷7ãà¢Â÷7ãà¢Âö'WGFöãà¢²ò¢vÓC¢6–ævÆRg&VR$VF—B&öw&ÖÖR"VçG'’âF†RF‡&VP¢&Wf–÷W2—FV×2„6öæf–wW&Rv—¦&Bò&öw&ÖÖR6WGF–æw2ð¢&W6WB’æBF†V—"&òvFRvW&R6öç6öÆ–FFVB–çFòF†P¢Væ–f–VB&öw&ÖÖU6WGF–æw2VF—F÷"B÷6WGF–æw2÷G&–æ–ær(	@¢vöÂÂçWG&—F–öâ†6RÂÆ–gF–ærÂ'Vææ–ærÂWV—ÖVçBÀ¢–æ§W&–W2ÂFövvÆW2æB&W6WBÆÂÆ—fRF†W&Ræ÷râ¢÷Ð¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢6WE6†÷t÷fW&fÆ÷r†fÇ6R“°¢æf–vFR‚"÷6WGF–æw2÷G&–æ–ær"“°¢×Ð¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2‚ÓB’Ó2ãR&÷VæFVB×†ÂFW‡BÖÆVgB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2 ¢7G–ÆS×·²Ö–ä†V–v‡C¢CB×Ð¢à¢Å6WGF–æw3"6Æ74æÖSÒ'6—¦RÓRFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óà¢Ç7â6Æ74æÖSÒ&fÆW‚Ó#à¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×6ÒföçBÖÖVF—VÒFW‡BÖf÷&Vw&÷VæB#à¢VF—B&öw&ÖÖP¢Â÷7ãà¢Ç7â6Æ74æÖSÒ&&Æö6²FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢vöÂÂçWG&—F–öâÂÆ–gF–ærÂ'Vææ–ærÂWV—ÖVçBÂ–æ§W&–W0¢Â÷7ãà¢Â÷7ãà¢Âö'WGFöãà¢ÂöF—cà¢ÂöÖ÷F–öâæF—cà¢Âóà¢—Ð¢Âôæ–ÖFU&W6Væ6Sà¢ÂöF—cà¢“°§Ð