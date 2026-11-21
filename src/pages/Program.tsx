import { useSessionsInFlight } from "@/hooks/useSessionsInFlight";
import {
  liftInProgress,
  routineInProgress,
  emptyWorkoutInProgress,
  runInProgress,
  storedRunName,
  storedRunTemplate,
} from "@/lib/sessionsInFlight";
import InProgressStrip from "@/components/session/InProgressStrip";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  rememberTrainTab,
  rememberedTrainTab,
  trainTabFor,
} from "@/lib/trainTab";
import { racePaceWorkFor } from "@/lib/racePace";
import { resolveDistanceUnit } from "@/lib/distanceUnits";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import type { ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBackDismiss } from "@/lib/backDismiss";
import { Link, useNavigate } from "react-router-dom";
import { usePageSearchParams } from "@/hooks/usePageSearchParams";
import { focusLabel } from "@/features/program/trainingBlock";
import { useProgramEngine } from "@/features/program/useProgramEngine";
import { useLiftSession } from "@/features/program/useLiftSession";
import { isRaceRestDay } from "@/features/program/raceRest";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import ProgrammeRunSection from "@/components/program/ProgrammeRunSection";
import ProgramOfflineBanner from "@/components/program/ProgramOfflineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonClasses";
import LiftSessionView from "@/components/program/LiftSessionView";
import LiftSessionOverlays from "@/components/program/LiftSessionOverlays";
// The Lift tab's ways into a workout that is not the plan's day, each
// loaded on its own: the saved routines read their list after the page
// has drawn anyway, and Train's own chunk has no room to spare.
const EmptyWorkoutEntry = lazyRetry(
  () => import("@/components/program/EmptyWorkoutEntry")
);
const SavedRoutinesSection = lazyRetry(
  () => import("@/components/program/SavedRoutinesSection")
);
import ProgrammeWeekSelector from "@/components/program/ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "@/components/program/ProgrammeWeekSelector";
import {
  dayFocusLabel,
  generatedDayType,
  liftDayNameIn,
  liftWeekDayNames,
} from "@/lib/liftDayLabel";
import { deloadDismissKey } from "@/lib/programNotices";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import TrainingBlockCard from "@/components/program/TrainingBlockCard";
import ExperienceSuggestionCard from "@/components/program/ExperienceSuggestionCard";
import { blockOfferBlockedByRace } from "@/features/program/represcribe";
import { liftWeekLabel } from "@/lib/liftWeekLabel";
import WeekPhaseRow from "@/components/program/WeekPhaseRow";
import type { RaceDistance } from "@/features/program/programTypes";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import {
  CalendarRange,
  Dumbbell,
  Feather,
  Settings2,
  CalendarDays,
  Footprints,
  MoreHorizontal,
  FastForward,
  ArrowUpDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import PageShell from "@/components/ui/PageShell";
import { splitLabel } from "@/features/program/programEngine";
import { lighterWeekAllowed } from "@/features/program/weekPrescription";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { resolveDayPagerDelta } from "@/lib/dayPagerSwipe";
import { useRunFitnessAutoDerive } from "@/hooks/useRunFitnessAutoDerive";
import { useRacePredictionCapture } from "@/hooks/useRacePredictionLog";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { track as trackProgrammeEvent } from "@/lib/programmeAnalytics";
import TrackProgrammeSectionView from "@/components/program/TrackProgrammeSectionView";
import DeloadBanner from "@/components/program/DeloadBanner";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { lighterWeekOffer } from "@/lib/lighterWeekOffer";
import { runHeaderLine } from "@/lib/runHeaderLine";
import { rollingGoalOf } from "@/features/program/programMaintenance";
import { deloadRunSwapCount } from "@/lib/deloadChangeSummary";
import GuideHint from "@/components/guide/GuideHint";

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
  const motionSafe = useMotionSafe();
  const [searchParams, setSearchParams] = usePageSearchParams();
  // The engine `/program` holds for Train and the session pages under it
  // (`ProgramEngineRoute`).
  const program = useProgramEngine();
  const {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    advanceToNextWeek,
    regenerateProgram,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
    applyEaseWeek,
    revertEaseWeek,
    refreshRunSchedule,
    skipRecoveryEarly,
    realignRacePlan,
    dismissFellBehindPrompt,
    recentLayoff,
    recentRuns,
    applyDeloadWeek,
    revertDeloadWeek,
    startTrainingBlock,
    adoptLegacyTrainingBlock,
    releaseTrainingBlock,
    keepTrainingBlockFocus,
  } = program;
  const { profile, updateProfile } = useAuth();
  // Today, from the shared day key: it moves at midnight and when the app
  // comes back, so a screen left open overnight names the new day.
  const todayKey = useLocalDateKey();
  // A workout closed with its sets kept, or a run left unsaved: offered
  // back on the day card (`InProgressStrip`).
  const inFlight = useSessionsInFlight(profile?.uid);
  // Adaptive Paces: silently derive a fitness benchmark from a recent race,
  // time trial or tempo when the user hasn't set one (the "derive" half of
  // the capture decision, narrowed to efforts by Pgm8 R1).
  useRunFitnessAutoDerive();
  // The goal race's prediction, recorded as the plan runs so the race can
  // be judged against it (`racePrediction.ts`).
  useRacePredictionCapture(programState);
  // Pgm3: the lighter-week offer's data source. usePerformanceWeeks
  // reads the server-side performance rollup; the `deloadRecommended`
  // flag on the current week is the offer's trigger, and the two weeks
  // before it say which of the engine's reasons fired, for its words
  // (`lighterWeekOffer`, whole-app grill Q11).
  const {
    weeks: perfWeeks,
    currentWeek: perfWeek,
    previousWeek: perfPreviousWeek,
  } = usePerformanceWeeks(3);
  // PROGRAM-DELOAD-01: Apply routes through the server applyDeloadWeek
  // command; undo lives in the success toast (reversibility-over-
  // confirmation — no dialog). The banner itself fires the 'applied'
  // telemetry; the undo path tracks 'undo' here since the toast owns it.
  const handleApplyDeload = useCallback(async (): Promise<boolean> => {
    const ok = await applyDeloadWeek();
    if (!ok) {
      toast.error(
        "Couldn’t take a lighter week. Check your connection and try again."
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
              toast.error("Couldn’t undo the lighter week.");
            }
          });
        },
      },
    });
    return true;
  }, [applyDeloadWeek, revertDeloadWeek]);

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
  // return to the tab the user was on, not snap back to Lift. The tab bar's
  // Train link carries no tab, so the choice is also remembered for the
  // visit (`trainTabFor`), and a plan with no lifting days opens on Run.
  const [openingTab] = useState(() => ({
    urlTab: searchParams.get("tab"),
    remembered: rememberedTrainTab(profile?.uid),
  }));
  const [chosenTab, setChosenTab] = useState<ProgramTab | null>(null);
  const activeTab: ProgramTab =
    chosenTab ??
    trainTabFor({
      ...openingTab,
      liftDays: programState ? programState.workouts.length : null,
    });
  const tabOwner = profile?.uid;
  const selectTab = useCallback(
    (value: ProgramTab) => {
      setChosenTab(value);
      rememberTrainTab(tabOwner, value);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, tabOwner]
  );

  const { workouts: recentWorkouts, loading: workoutsLoading } = useWorkouts();

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

  // UI state
  const [orderHelpRequest, setOrderHelpRequest] = useState(0);
  const [showOverflow, setShowOverflow] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // Starting a lift session, on either tab: Home's Start (`?day=N&start=1`)
  // opens the workout over whichever tab Train opens on.
  const session = useLiftSession({
    programState,
    inFlight,
    linkedDay: urlDay,
    viewingHistory: viewingHistoryIndex !== null,
  });
  const { todayIndex } = session;

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

  /* The plan's More options sheet: focus moves in and stays there, Escape
     and the device's Back close it, and focus goes back to the button that
     opened it (DESIGN_GUIDE §10). An exercise's menu does the same in
     `LiftSessionView`. */
  const overflowRef = useFocusTrap<HTMLDivElement>(showOverflow);
  useBackDismiss(showOverflow, () => setShowOverflow(false));
  useEffect(() => {
    if (!showOverflow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowOverflow(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showOverflow]);

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
        title="Couldn’t load your programme"
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
  // A week from the history reads as a lighter week by its own mark, not by
  // this week's phase.
  const viewedWeekLighter =
    isViewingHistory && history[viewingHistoryIndex]?.lighter === true;

  // Clamp selectedDayIndex
  const idx =
    displayWorkouts.length > 0
      ? Math.min(selectedDayIndex, displayWorkouts.length - 1)
      : 0;
  if (idx !== selectedDayIndex) setSelectedDayIndex(idx);

  /* The week's days as the screen names them (Lift19): Push A … Legs B on
     a 6-day week. The stored names stay the engine's keys. */
  const weekDayNames = liftWeekDayNames(displayWorkouts.map((w) => w.dayName));

  // Lift selector cells — SPLIT-ORDERED (ADR-0002): the circle shows the
  // session number (Day 1..N), not a calendar date, and the rotation cursor
  // (todayIndex = next-incomplete) is the lift execution surface. Skipped
  // stays distinct from completed (a green check on a skipped day would read
  // as "you trained"); ProgrammeWeekSelector renders the Ban glyph for it.
  const liftSelectorCells: ProgrammeWeekSelectorCell[] = displayWorkouts.map(
    (w, i) => ({
      key: String(i),
      center: String(i + 1),
      // The day's name in its week ("Push A", "Pull B"): the type, lettered
      // where the week repeats it, so no two cells read the same. A day
      // the person built keeps the part of its own name that varies.
      bottomLabel: generatedDayType(w.dayName)
        ? weekDayNames[i]
        : dayFocusLabel(w.dayName),
      status: w.completed ? "completed" : w.skipped ? "skipped" : "upcoming",
      isToday: !isViewingHistory && i === todayIndex,
    })
  );

  // The workout under way on this phone that Resume would open as it was,
  // a programme day's or a saved routine's, and the run under way: each
  // offered back with Resume.
  const { workoutInFlight, resumable } = session;
  const liftStrip = resumable
    ? liftInProgress(
        resumable,
        liftDayNameIn(
          programState.workouts.map((w) => w.dayName),
          resumable.dayIndex,
          programState.workouts[resumable.dayIndex].dayName
        )
      )
    : workoutInFlight?.kind === "routine"
      ? routineInProgress(workoutInFlight)
      : workoutInFlight?.kind === "empty"
        ? emptyWorkoutInProgress(workoutInFlight)
        : null;
  // On its own day the workout's strip sits on the day card instead
  // (`LiftSessionView`).
  const liftStripOnCard =
    resumable !== null && !isViewingHistory && resumable.dayIndex === idx;
  const runStrip = inFlight.run
    ? runInProgress(
        inFlight.run,
        storedRunName(
          inFlight.run.config,
          racePaceWorkFor(
            storedRunTemplate(inFlight.run.config),
            profile,
            programState.runPlan
          ),
          resolveDistanceUnit(profile?.preferredDistanceUnit)
        )
      )
    : null;

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
    if (newIndex === idx) return;
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
    // A no-break space: the line wraps on a phone, and "5" alone at the end
    // of one line with "days/week" opening the next reads as two things.
    const daysLabel =
      dayCount === 1 ? "1\u00a0day/week" : `${dayCount}\u00a0days/week`;
    // The focus is deliberately absent from this branch. The week row
    // states it on every render, in Settings' words (`focusLabel`), with
    // or without a block running. Carrying it here as well named one
    // field twice. Split and day count are stated in words nowhere else,
    // so they stay. A split this build can't name (a newer app's) leaves
    // the days alone.
    const split = splitLabel(programState.splitType);
    return split ? `${split} · ${daysLabel}` : daysLabel;
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
  const resolvedRunPlan = resolveRunPlan(profile, programState, todayKey);
  /**
   * The one lighter-week decision (whole-app grill Q11): the engine's
   * recommendation for lifting, running or both, while a lighter week can
   * be taken and never on top of a race's taper (P1d pin 2: "taper IS the
   * deload; no double-deload"), with words for the reason that fired.
   *
   * The decision lives in `lighterWeekOffer` rather than inline here,
   * following this file's own runHeaderLine precedent — the bug was a
   * missing term in a render expression, which is exactly what no test
   * can reach while it stays one.
   */
  const lighterOffer = lighterWeekOffer({
    week: perfWeek,
    previous: perfPreviousWeek,
    // The week before that, only when the series has no gap between.
    before:
      perfWeeks.length >= 3 && perfWeeks.at(-2) === perfPreviousWeek
        ? perfWeeks.at(-3)
        : null,
    plan: {
      lifts: (programState?.workouts?.length ?? 0) > 0,
      runs: (programState?.runDays?.length ?? 0) > 0,
    },
    lighterWeekAllowed: !!programState && lighterWeekAllowed(programState),
    currentWeek: programState?.runPlan?.currentWeek,
    totalWeeks: programState?.runPlan?.totalWeeks,
    distance: resolvedRunPlan.raceGoal?.distance as RaceDistance | undefined,
  });
  const showDeloadSuggest = lighterOffer !== null;
  // The week's lighter-week offer is the advice on the Lift tab while it
  // shows: the day's own waits under it, and so does the level suggestion
  // (`programNotices`).
  const deloadAdvice =
    showDeloadSuggest &&
    programState.currentPhase !== "deload" &&
    !deloadNotice.dismissed;

  const programRunHeaderLine = runHeaderLine({
    runMode: profile?.runMode ?? "freeform",
    raceGoal: resolvedRunPlan.raceGoal,
    currentWeek: programState?.runPlan?.currentWeek,
    totalWeeks: programState?.runPlan?.totalWeeks,
    phase: programState?.runPlan?.phase,
    recoveryEndDate: programState?.runPlan?.recoveryEndDate,
    todayKey,
    // Only while it is this week: the rollover drops it after.
    leadInWeek:
      programState?.runPlan?.leadInWeek ===
      localWeekKey(parseLocalDate(todayKey))
        ? programState.runPlan.leadInWeek
        : null,
    runsTarget,
    starterStage:
      programState?.runPlan?.mode === "starter"
        ? programState.runPlan.stage
        : null,
    rollingGoal: rollingGoalOf(programState, profile),
  });

  // Moving on from a finished cycle's last week earns programme_complete,
  // awarded by the server when it sees the plan move on (App1 Q33,
  // onProgramStateWritten).
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
  // The Lift tab's header line (DS4, §14m rules 17-18): the week, its
  // focus and the day count, one line the header's full width. The week
  // was a row of its own over the day circles; its chevrons to earlier
  // weeks come with it. The split's name gave way: the circles under the
  // line name each of its sessions, and Your plan names the split.
  const liftWeekText =
    liftWeekLabel(
      isViewingHistory
        ? {
            weekNumber: displayWeekNumber,
            primaryGoal: programState.primaryGoal,
            currentPhase: viewedWeekLighter ? "deload" : "progression",
            archived: true,
          }
        : programState,
      todayKey,
      profile?.experience
    ) ?? `Week ${displayWeekNumber}`;
  const liftDayCount = programState.workouts?.length ?? 0;
  // A no-break space, so "6" never ends a line with "days/week" on the next.
  const liftDaysText =
    liftDayCount === 1 ? "1\u00a0day/week" : `${liftDayCount}\u00a0days/week`;
  const liftHeaderText =
    liftDayCount === 0
      ? programHeaderLine
      : `${liftWeekText} · ${liftDaysText}`;
  const liftHeaderLine =
    liftDayCount === 0 ? (
      programHeaderLine
    ) : (
      <WeekPhaseRow
        weekNumber={displayWeekNumber}
        label={liftWeekText}
        suffix={` · ${liftDaysText}`}
        onPrevWeek={goBack}
        onNextWeek={goForward}
        canGoPrev={canGoBack}
        canGoNext={canGoForward}
      />
    );

  return (
    <PageShell
      title="Train"
      banner={<ProgramOfflineBanner />}
      /* Tab-aware, so the Run tab does not read as an add-on under a
         lifting-only header. One line the header's full width at 393 and
         320pt; it wraps rather than truncating at larger text. The other
         tab's line holds its place unseen, so the header is as tall as the
         longer of the two and nothing below moves on Lift↔Run. */
      subtitle={activeTab === "run" ? programRunHeaderLine : liftHeaderLine}
      subtitleAlternates={[
        activeTab === "run" ? liftHeaderText : programRunHeaderLine,
      ]}
      subtitleBelow
      /* Overflow, plus a "Done" exit only while reordering. */
      actions={
        <>
          <Link
            to="/program/plan"
            state={{
              returnTo: `/program?${new URLSearchParams({
                ...Object.fromEntries(searchParams),
                tab: activeTab,
              })}`,
            }}
            className={buttonClasses({ variant: "ghost" })}
          >
            Your plan
          </Link>
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
            aria-haspopup="dialog"
            aria-expanded={showOverflow}
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
          /* A 36pt track with 44pt options (§14m rule 18), its 4pt bands
             above and below laid over the gaps rather than adding to them. */
          size="sm"
          className="-my-1 before:bg-muted/50"
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
          {/* A workout under way on another day than the one shown, or a
              saved routine's, leads the tab, so it is the first thing
              seen; on its own day it sits on the day card instead. A
              routine's Resume opens the routine's page. */}
          {liftStrip && !liftStripOnCard && (
            <InProgressStrip
              session={liftStrip}
              onResume={() =>
                resumable
                  ? session.resume(resumable)
                  : navigate(liftStrip.resumeTarget)
              }
            />
          )}

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
            key={orderHelpRequest}
            requested={orderHelpRequest > 0}
            id="train-order"
            placement="top"
            when={
              liftSelectorCells.length > 1 &&
              !session.sessionOpen &&
              !showOverflow
            }
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
            parallel Program.tsx fallback needed. A run's ⋯ opens the
            run's own page (`/program/run/:date`). */}
      {activeTab === "run" && profile && (
        // pt-4 positions the Run day-selector so its day circles line up with
        // the Lift tab's day circles (verified on the harness: run button-top
        // 190 vs lift 192). The Run selector carries a weekday-letter row the
        // Lift selector lacks, so a little more top padding here lands the
        // circles — not the container — at the same Y, which is what the eye
        // tracks when toggling tabs.
        <div className="space-y-4">
          {/* A run left before it was saved: Resume picks it up where it
              stopped. */}
          {runStrip && (
            <InProgressStrip
              session={runStrip}
              onResume={() => navigate(runStrip.resumeTarget)}
            />
          )}
          <ProgrammeRunSection
            profile={profile}
            programState={programState}
            runsTarget={runsTarget}
            applyEaseWeek={applyEaseWeek}
            revertEaseWeek={revertEaseWeek}
            skipRecoveryEarly={skipRecoveryEarly}
            realignRacePlan={realignRacePlan}
            dismissFellBehindPrompt={dismissFellBehindPrompt}
            recentLayoff={recentLayoff}
            recentRuns={recentRuns}
            /* The lighter-week offer covers both sports (Q11), so a
               runner meets it here as a lifter does on the Lift tab: the
               same decision, words and dismissal. The offer only; the
               lighter week once taken is the Lift tab's state, and the
               runs it shortened show on their own cards. */
            lighterWeekNotice={
              showDeloadSuggest && !deloadNotice.dismissed ? (
                <TrackProgrammeSectionView section="deload_banner">
                  <DeloadBanner
                    visible
                    reason={lighterOffer?.reason}
                    dismissed={deloadNotice.dismissed}
                    onDismiss={deloadNotice.dismiss}
                    weekKey={`w${displayWeekNumber}`}
                    onApply={handleApplyDeload}
                  />
                </TrackProgrammeSectionView>
              ) : null
            }
          />
        </div>
      )}

      {/* ── Session Content — LIFT tab only: the day's session, as a
            lift's own page draws it (`LiftSessionView`), with the week's
            notices between its card and its exercises. ── */}
      {activeTab === "lift" && (
        <TrackProgrammeSectionView section="session_card">
          <LiftSessionView
            programState={programState}
            program={program}
            session={session}
            dayIndex={idx}
            workouts={displayWorkouts}
            weekNumber={displayWeekNumber}
            viewingHistory={isViewingHistory}
            recentWorkouts={recentWorkouts}
            reorderMode={reorderMode}
            direction={direction}
            weekAdvice={deloadAdvice}
            onSkipped={handleSelect}
            pagerProps={{
              "data-swipe-pager": true,
              "data-swipe-at-start": idx <= 0,
              "data-swipe-at-end": idx >= displayWorkouts.length - 1,
              onTouchStart: handleTouchStart,
              onTouchEnd: handleTouchEnd,
            }}
            /* The week's notices sit under the day's session, as Home's
               banners sit under its hero (DS4, §14m rule 1: the session's
               top within 260pt). The lighter-week offer is still on every
               day of the week, and its dismissal per week. The level
               suggestion is suppressed while the lighter week shows. */
            between={
              <>
                <TrackProgrammeSectionView section="deload_banner">
                  <DeloadBanner
                    /* An active lighter week is state and shows regardless. */
                    visible={showDeloadSuggest}
                    reason={lighterOffer?.reason}
                    dismissed={deloadNotice.dismissed}
                    onDismiss={deloadNotice.dismiss}
                    weekKey={`w${displayWeekNumber}`}
                    deloadActive={programState.currentPhase === "deload"}
                    // The run half of the deload, named in the copy. Derived from
                    // the snapshot rather than stored — see deloadChangeSummary.
                    runsEased={deloadRunSwapCount(programState)}
                    raceWeek={programState.raceWeek}
                    raceRest={isRaceRestDay(programState.runPlan, todayKey)}
                    onApply={handleApplyDeload}
                  />
                </TrackProgrammeSectionView>
                <ExperienceSuggestionCard
                  suppressed={deloadAdvice}
                  workouts={programState?.workouts}
                  context={{
                    weekNumber: programState?.weekNumber,
                    nutritionGoal: programState?.goal,
                  }}
                />
              </>
            }
            /* Programme planning follows the current workout. */
            after={
              profile?.uid &&
              programState && (
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
                    today: todayKey,
                  })}
                  onStart={startTrainingBlock}
                  onAdoptLegacy={adoptLegacyTrainingBlock}
                  onRelease={releaseTrainingBlock}
                  onKeepFocus={keepTrainingBlockFocus}
                  hideRunningRow
                  detailOpen={blockDetailOpen}
                  onDetailOpenChange={setBlockDetailOpen}
                />
              )
            }
          />
        </TrackProgrammeSectionView>
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
      {/* An empty workout (Mob1 call 1): a lift with no plan day. */}
      {activeTab === "lift" && (
        <Suspense fallback={null}>
          <EmptyWorkoutEntry />
          <SavedRoutinesSection />
        </Suspense>
      )}

      {/* ROUTINE-EXCHANGE-01 — curated blueprint shelf. Read-only
          intents; saving creates a private routine copy, never a
          programme change. */}

      {/* The "Edit lift plan ›" footnote is gone — 10 px muted text under
          a hairline, a third edit entry beside the two already in ⋯. On
          the Lift tab that menu's edit row now points at the lift editor
          itself, which is also where the volume table went. */}

      {/* The time chooser and the workout, over either tab. */}
      <LiftSessionOverlays
        session={session}
        programState={programState}
        completeWorkoutDay={completeWorkoutDay}
        firstWorkout={!workoutsLoading && recentWorkouts.length === 0}
      />

      {/* PR-2: Edit weekly layout sheet. Returns null when closed —
          so the body component (and its useProgrammeScheduleEditor
          hook) only mounts while the sheet is open. That's the
          hydration guarantee: each open is a fresh hook mount that
          re-reads the current profile. */}
      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        programState={programState}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />

      {/* Overflow Menu Sheet */}
      <AnimatePresence>
        {showOverflow && (
          <>
            <motion.div
              initial={motionSafe({ opacity: 0 })}
              animate={{ opacity: 1 }}
              exit={motionSafe({ opacity: 0 })}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowOverflow(false)}
            />
            <motion.div
              ref={overflowRef}
              role="dialog"
              aria-modal="true"
              aria-label="Plan options"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50"
            >
              <div className="max-w-md mx-auto p-5 space-y-1">
                <div className="w-10 h-1 rounded-full bg-border mx-auto mb-3" />
                {activeTab === "lift" && liftSelectorCells.length > 1 && (
                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={() => {
                      setShowOverflow(false);
                      setOrderHelpRequest((request) => request + 1);
                    }}
                  >
                    How workout order works
                  </Button>
                )}
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
                          Drag to change today’s order
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
                {/* One edit entry, to the editor of the tab in view. Pgm4
                    made it a single free entry; until Trim1 call 2 the Run
                    tab's went to a Programme page that edited nothing and
                    linked on to Run plan. */}
                <button
                  type="button"
                  onClick={() => {
                    setShowOverflow(false);
                    navigate(
                      activeTab === "lift"
                        ? "/settings/lift-plan"
                        : "/settings/run-plan"
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
                        : "Edit run plan"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {activeTab === "lift"
                        ? "Focus, lift days, equipment, injuries, weekly volume"
                        : "Race or no race, run days, long runs, zones"}
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
