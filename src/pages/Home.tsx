import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import WeightLogSheet from "@/components/home/WeightLogSheet";
import { lbToKg } from "@/lib/weightUnits";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { assessLiftReturn } from "@/features/program/liftLayoff";
import { useMeals } from "@/hooks/useMeals";
import { useHomeData } from "@/hooks/useHomeData";
import { useLifetimeRunStats } from "@/hooks/useLifetimeRunStats";
import {
  getActivationFraming,
  isWithinActivationWindow,
  shouldShowWelcomeChecklist,
} from "@/lib/activationFraming";

import { useSubscription } from "@/lib/subscription";
import { useHomeProgram } from "@/features/program/useHomeProgram";
import { liftSessionExplainer } from "@/lib/liftSessionExplainer";
import { runSessionPresentation } from "@/lib/runSessionExplainer";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getExerciseById } from "@/lib/exercises";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageShell from "@/components/ui/PageShell";
import BrandMark from "@/components/ui/BrandMark";
import {
  AnalyticsTabIcon,
  FoodTabIcon,
  TrainTabIcon,
} from "@/components/icons/TabIcons";
import { Sparkles, X } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { toast } from "@/lib/toast";
import { realignResultMessage } from "@/lib/realignCopy";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import {
  resolveTrainingDayForDate,
  resolveTrainingWindow,
} from "@/lib/trainingResolver";
import { summariseWeek } from "@/lib/weekSummary";
import { useClaimMapForProgram } from "@/hooks/useClaimMapForProgram";
import { goalReachedOffer } from "@/lib/goalWeightPlan";
import GoalReachedSheet from "@/components/home/GoalReachedSheet";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useCountUp } from "@/hooks/useCountUp";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { liftDayLine } from "@/lib/liftDayLabel";

import { StreakFlame } from "@/components/StreakFlame";
import Avatar from "@/components/Avatar";
import { formatWeekdayDayMonth } from "@/utils/formatters";
import SectionHeading from "@/components/ui/SectionHeading";
import WeekStrip from "@/components/home/WeekStrip";
import DayPeekCard from "@/components/home/DayPeekCard";
import FellBehindSheet from "@/components/program/FellBehindSheet";
import LiftReturnSheet from "@/components/program/LiftReturnSheet";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { useEducationCard } from "@/components/EducationLaneProvider";
import StackedCTACards from "@/components/home/StackedCTACards";
import StepsPrimingModal from "@/components/home/StepsPrimingModal";
import { useSteps } from "@/hooks/useSteps";
import PerformanceHeroCard from "@/components/home/PerformanceHeroCard";
import WaterCard from "@/components/home/WaterCard";
import WeightStepsTiles from "@/components/home/WeightStepsTiles";

import TodayEnergy from "@/components/home/TodayEnergy";
import WeeklyReviewEntry from "@/components/home/WeeklyReviewEntry";
import WeekSummary from "@/components/home/WeekSummary";
import Card from "@/components/ui/Card";
import { useSnoozeDismiss } from "@/hooks/useSnoozeDismiss";

import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import TrackSectionView from "@/components/home/TrackSectionView";
import ContextualTipBanner from "@/components/home/ContextualTipBanner";
import { IconButton } from "@/components/ui/IconButton";
import TrialEndedDialog from "@/components/home/TrialEndedDialog";
import { recalibrationCheckIn } from "@/lib/recalibrationCheckIn";
import { shouldShowHomeProStrip } from "@/lib/homeProStrip";
import { isCheckoutTrialEligible } from "@/lib/subscription";

const ProModal = lazyRetry(() => import("@/components/ProModal"));

/* Home2d-pin-1: DayActionSheet lazy-loads on Home (closed on mount, so it
   hydrates on demand instead of shipping in Home's initial chunk).
   Mirrors the App.tsx route-level lazy() pattern. */
const DayActionSheet = lazyRetry(
  () => import("@/components/program/DayActionSheet")
);

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  // home-declutter 6b — uid-scoped monthly snooze for the post-trial
  // upgrade strip (shared-device rule: one account's snooze must not
  // hide the funnel for the next).
  const { snoozed: proStripSnoozed, snooze: snoozeProStrip } = useSnoozeDismiss(
    `tropos-pro-strip-snooze:${user?.uid ?? "anon"}`,
    30
  );
  const { workouts, getWorkoutsForDate } = useWorkouts();
  const {
    meals,
    loading: mealsLoading,
    error: mealsError,
    getDailyTotals,
  } = useMeals();

  const effectiveTargets = useEffectiveTargets();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  // PR-1: pull the action callbacks too so the new DayActionSheet
  // (mounted from DayPeekCard's Manage CTA) can dispatch
  // override/skip/complete without re-implementing them here.
  const {
    programState,
    loading: programLoading,
    overrideRunDay,
    markManualComplete,
    skipRunDay,
    skipWorkoutDay,
    restoreRunDay,
    restoreWorkoutDay,
    moveRunDay,
    dismissFellBehindPrompt,
    realignRacePlan,
    recentLayoff,
    controller: programController,
  } = useHomeProgram();
  const weeklyDayMap = useWeeklyDayMap();
  const navigate = useNavigate();
  const { currentStreak: streak, newBadge, dismissNewBadge } = useStreaks();
  const {
    ml: waterMl,
    target: waterTargetMl,
    logWater,
    drinks: waterDrinks,
    removeDrink: removeWaterDrink,
    servingMl,
    syncStatus: waterSyncStatus,
    retry: retryWater,
  } = useWaterLog();

  // Home2 perf telemetry. renderStartRef takes its timestamp from
  // the post-mount effect (rather than lazy useState — that would
  // trip react-hooks/purity for performance.now() in render). Fires
  // once when the primary data sources (meals + program) finish
  // loading — that's the moment the user sees real content rather
  // than skeleton state. Target: <500ms p95 per Home2 cross-cutting
  // performance pin. Same shape as food / social / history.
  const homeRenderStartRef = useRef<number>(0);
  const homeRenderReportedRef = useRef(false);
  useEffect(function () {
    homeRenderStartRef.current = performance.now();
  }, []);
  useEffect(
    function () {
      if (mealsLoading || programLoading || homeRenderReportedRef.current)
        return;
      if (homeRenderStartRef.current === 0) return;
      const ms = performance.now() - homeRenderStartRef.current;
      trackHomeEvent("home_initial_render_ms", { durationMs: Math.round(ms) });
      homeRenderReportedRef.current = true;
    },
    [mealsLoading, programLoading]
  );
  const prevStreakRef = useRef<number>(0);
  const [streakBounce, setStreakBounce] = useState(false);
  const [showWeightSheet, setShowWeightSheet] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  // HealthKit steps (native iOS only; web resolves to status "unavailable"
  // so the tile hides and the priming modal never opens). See POST_LAUNCH.md.
  const stepsData = useSteps();
  // Welcome checklist dismissal — persisted once-ever (audit #7). Visibility
  // is data-derived below via shouldShowWelcomeChecklist; this is only the
  // explicit "I tapped the X" signal.
  const { dismissed: welcomeDismissed, dismiss: dismissCoachMarks } =
    useDismissOnce("tropos-welcome-checklist-dismissed");

  // PR-0c: single resolver call. Replaces three inline derivations
  // that disagreed with each other and with the (now-retired) Programme Today tab:
  //   1. `runTarget = ... ?? 2` — phantom runs for freeform users.
  //      The resolver internally uses getWeeklyRunTarget which
  //      defaults to 0.
  //   2. `nextWorkout = workouts.find(d => !d.completed)` — the
  //      next-incomplete lift, not today's scheduled lift.
  //      The resolver uses liftIndexForDayOfWeek to map dow → lift idx.
  //   3. `todayRun = runDays.find(r => dayIndex === todayDow && !completed)`
  //      — treats skipped as startable, ignores date/weekKey.
  //      The resolver enforces date → weekKey → guarded-legacy match
  //      and uses isScheduledRunStartable for the gate.
  //
  // The day comes from the shared local date key, which moves at midnight
  // and when the app returns to the foreground. The header, the week's
  // counts and tomorrow's session follow it, so an app resumed the next
  // morning names the new day rather than the one it was opened on.
  const todayKey = useLocalDateKey();
  const today = useMemo(() => parseLocalDate(todayKey), [todayKey]);
  const currentWeekKey = localWeekKey(today);
  // PR-J Q3 chunk B3c — single source of truth for derived run-day
  // completion across all of Home's surfaces (WeekStrip dot, DayPeek
  // "Run completed" copy, today-resolver's run.isCompleted). Q5
  // chunk B3f forwards unclaimedByDate to DayActionSheet for the
  // same-date paradox hint (P74), and Q5 chunk B3g forwards it to
  // DayPeekCard for the extras rows.
  const { claimMap, unclaimedByDate } = useClaimMapForProgram(programState);
  const resolvedToday = useMemo(
    function () {
      return resolveTrainingDayForDate({
        dateKey: todayKey,
        profile,
        programState,
        currentWeekKey,
        claimMap,
      });
    },
    [todayKey, profile, programState, currentWeekKey, claimMap]
  );

  const todayType = resolvedToday.scheduleType;

  // What was done, by date: the strip fills a day for a logged lift
  // session or run, and the week's counts read the same records.
  const loggedLiftDates = useMemo(
    () => new Set(workouts.map((w) => w.date)),
    [workouts]
  );
  const extraRunDates = useMemo(
    () =>
      new Set(
        [...unclaimedByDate.entries()]
          .filter(([, runs]) => runs.length > 0)
          .map(([date]) => date)
      ),
    [unclaimedByDate]
  );

  // DS3 "This week": the same resolved calendar week the strip draws, so
  // the counts and the circles cannot disagree about what was planned.
  const weekCounts = useMemo(
    function () {
      const window = resolveTrainingWindow({
        startDate: parseLocalDate(currentWeekKey),
        days: 7,
        profile,
        programState,
        claimMap,
      });
      /* A day counts as logged when it has a meal, and the loaded meals
         are the record of that. The daily log holds the count Food last
         wrote, and Food writes nothing when a day's last meal is deleted,
         so the log can go on counting meals that are gone. It stands in
         only while the meals are loading or could not be read. */
      const mealsKnown = !mealsLoading && !mealsError;
      const mealsByDate = new Map<string, { meals: number }>();
      for (const day of window) {
        mealsByDate.set(day.dateKey, {
          meals: mealsKnown
            ? getDailyTotals(day.dateKey).mealCount
            : (weeklyDayMap.get(day.dateKey)?.meals ?? 0),
        });
      }
      return summariseWeek({
        window,
        liftDates: workouts.map((w) => w.date),
        extraRunsByDate: unclaimedByDate,
        mealsByDate,
      });
    },
    [
      currentWeekKey,
      profile,
      programState,
      claimMap,
      workouts,
      unclaimedByDate,
      weeklyDayMap,
      getDailyTotals,
      mealsLoading,
      mealsError,
    ]
  );

  // Tomorrow's session, named on the rest-day card. Resolved with TODAY's
  // week key, as the resolver asks of every caller, so a legacy run day
  // cannot borrow this week's status for next week.
  const tomorrowSession = useMemo(
    function () {
      const date = new Date(today);
      date.setDate(date.getDate() + 1);
      const dateKey = localDateString(date);
      const next = resolveTrainingDayForDate({
        dateKey,
        profile,
        programState,
        currentWeekKey,
        claimMap,
      });
      // Named as the workout and finish screens say it: "Pull · Lat focus".
      const liftName = next.lift.workout
        ? liftDayLine(next.lift.workout.dayName)
        : null;
      const runDay = next.run.runDay;
      /* A run day whose week has no runs written yet is named by its type.
         The plan holds the current week's runs, so on a Sunday, Monday's
         run is written only when the week rolls over. Once a week's runs
         are written, a run day with none on it has had its run moved to
         another date (runs are pinned to dates, ADR-0002), and it names
         nothing. A run with neither date nor week key belongs to the
         current week, as the resolver reads it. */
      const nextWeekKey = localWeekKey(date);
      const nextWeekWritten = (programState?.runDays ?? []).some(
        (rd) =>
          (rd.date
            ? localWeekKey(parseLocalDate(rd.date))
            : (rd.weekKey ?? currentWeekKey)) === nextWeekKey
      );
      const runName = runDay
        ? (RUN_TEMPLATES.find(
            (t) => t.id === (runDay.userOverride ?? runDay.templateId)
          )?.name ?? "Run")
        : (next.scheduleType === "run" || next.scheduleType === "both") &&
            !nextWeekWritten
          ? "Run"
          : null;
      const label =
        liftName && runName
          ? `${liftName} and ${runName}`
          : (liftName ?? runName);
      if (!label) return null;
      const target =
        liftName && typeof next.lift.index === "number"
          ? `/program?day=${next.lift.index}`
          : `/program?tab=run&rday=${dateKey}`;
      return { label, target };
    },
    [today, profile, programState, currentWeekKey, claimMap]
  );
  // Hybrid loop — cross-discipline "today" guidance (yesterday's training →
  // today's plan + fuel). Null while data loads / nothing to surface.
  // Threads Home's OWN workouts subscription in — the hook previously
  // opened a duplicate onSnapshot on users/{uid}/workouts just to read
  // yesterday (PROGRAM-ADAPT-01 reliability fix).
  const streakDisplay = useCountUp(streak, {
    sessionKey: "streak",
    duration: 0.5,
  });

  useEffect(
    function () {
      if (streak > prevStreakRef.current && prevStreakRef.current > 0) {
        setStreakBounce(true);
        const t = setTimeout(function () {
          setStreakBounce(false);
        }, 800);
        return function () {
          clearTimeout(t);
        };
      }
      prevStreakRef.current = streak;
    },
    [streak]
  );

  const weightUnit = profile?.preferredWeightUnit || "kg";
  const {
    dailyCal,
    dailyProt,
    dailyCarbs,
    dailyFat,
    lastWeightInfo,
    weightTrend,
    weightSyncStatus,
    weightAnnouncement,
    postWorkoutNudge,
    loading: homeDataLoading,
  } = useHomeData(
    user,
    profile,
    workouts,
    weightUnit,
    // HOME-TARGET-01, protein half: the post-workout nudge must quote the
    // same target the macro rings on this screen show.
    effectiveTargets?.protein ?? null
  );

  // Performance data for the hero card: this week's score, and the week
  // before it for the delta chip. The documents are daily, so "the one
  // before" is yesterday's rolling week; the hook steps back a whole week
  // (performanceSeries.ts). The raw document count feeds the
  // baseline-establishing gate.
  const {
    currentWeek: perfWeek,
    previousWeek: perfPrevWeek,
    docsAvailable: perfDocsAvailable,
    loading: perfLoading,
  } = usePerformanceWeeks(2);

  // Meal history for the energy row's cold-start state. TodayEnergy gets
  // no meal-pattern insight or post-workout nudge — one voice per screen;
  // that detail lives in the Food tab.
  const totalLifetimeMeals = meals.length;

  // #972 cold-start activation framing. profile.createdAt is a Firestore
  // Timestamp once persisted (a serverTimestamp() sentinel has no toMillis,
  // so createdAtMs is null until the first server round-trip → no framing
  // for that brief window, which is correct).
  const createdAtMs = useMemo(
    function () {
      const c = profile?.createdAt as { toMillis?: () => number } | undefined;
      return c && typeof c.toMillis === "function" ? c.toMillis() : null;
    },
    [profile?.createdAt]
  );
  // Captured once on mount (the activation window is day-scale; per-render
  // freshness isn't needed, and this keeps the render path pure — Date.now()
  // is flagged as impure-during-render).
  const nowMs = useMemo(function () {
    return new Date().getTime();
  }, []);
  // Home's Pro strip for a free account (homeProStrip.ts). Trial
  // eligibility decides the copy: a first-timer is offered the trial,
  // an account that has had one is offered the plans.
  const proStripTrialEligible = isCheckoutTrialEligible(profile);
  const showProStrip = shouldShowHomeProStrip({
    isPro,
    isInTrial,
    snoozed: proStripSnoozed,
    hadFreeWeek: !!profile?.trialExpiresAt,
    createdAtMs,
    nowMs,
  });
  // Only pay for the full lifetime-runs read while the user is inside the
  // activation window — an established runner never reads their whole runs
  // collection just to drive cold-start copy.
  const inActivationWindow = isWithinActivationWindow(createdAtMs, nowMs);
  const { runCount: lifetimeRunCount, loading: runStatsLoading } =
    useLifetimeRunStats({ enabled: inActivationWindow });
  const activationFraming = useMemo(
    function () {
      return getActivationFraming({
        createdAtMs,
        nowMs,
        todayType,
        workoutCount: workouts.length,
        // While the runs read is in flight, treat as "has runs" so the run
        // card never flashes "Your first run" before the count resolves.
        runCount: runStatsLoading ? 1 : lifetimeRunCount,
        mealCount: totalLifetimeMeals,
      });
    },
    [
      createdAtMs,
      nowMs,
      todayType,
      workouts.length,
      runStatsLoading,
      lifetimeRunCount,
      totalLifetimeMeals,
    ]
  );

  // Relative time string for weight tile
  const weightRelativeTime = useMemo(
    function () {
      if (!lastWeightInfo) return "Tap to log";
      if (!lastWeightInfo.rawDate) return "From profile";
      const now = new Date();
      const logged = new Date(lastWeightInfo.rawDate + "T12:00:00");
      const diffMs = now.getTime() - logged.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days <= 0) return "Logged today";
      if (days === 1) return "Logged yesterday";
      if (days < 7) return "Logged " + days + "d ago";
      if (days < 28) return "Logged " + Math.floor(days / 7) + "w ago";
      return "Logged " + Math.floor(days / 30) + "mo ago";
    },
    [lastWeightInfo]
  );

  const [peekDate, setPeekDate] = useState<string | null>(null);
  // PR-1: which date the DayActionSheet is managing. Null = closed.
  // Distinct from peekDate so the peek can stay expanded behind the
  // sheet (the sheet is a temporary overlay, the peek is a longer-
  // lived summary).
  const [manageDate, setManageDate] = useState<string | null>(null);
  // PR-L L4 — fell-behind prompt. The sheet opens automatically
  // when the server-written flag is present AND the user hasn't
  // dismissed it this session yet.
  //
  // The session-shadow latch is what makes the "soft dismissal"
  // path tolerable. The three action buttons (skip/shift/compress)
  // each call a writer that clears `programState.pendingFellBehindPrompt`
  // via the usual setProgramState path, so the sheet unmounts
  // naturally on success. But the BottomSheet primitive also
  // dismisses on outside-tap / Escape / swipe (FellBehindSheet's
  // `onOpenChange={(o) => !o && onClose()}` wires this through) —
  // those paths leave the Firestore flag in place by design
  // (sheet re-opens on next app launch). Without this latch, the
  // sheet would immediately re-render open within the same
  // session, since `useProgram` doesn't onSnapshot programState
  // and pendingFellBehindPrompt stays set in local state.
  const [fellBehindDismissedFor, setFellBehindDismissedFor] = useState<
    string | null
  >(null);
  const fellBehindPrompt = programState?.pendingFellBehindPrompt;
  const fellBehindOpen =
    !!fellBehindPrompt && fellBehindDismissedFor !== fellBehindPrompt.weekKey;

  // #995 tier-4 coordinator registrations. Each surface keeps its own
  // eligibility + persistence; the coordinator shows at most one per app-open
  // (Trial > FellBehind > Badge > Priming). Badge is suppressed in a
  // fell-behind visit and dropped — not deferred — if it loses.
  //
  // Trial-expiry eligibility is a pure derivation off `nowMs`, the moment
  // Home mounted (no Date.now() in render → satisfies react-hooks/purity);
  // it replaces the old set-state-in-effect one-time check. It compares
  // instants, so it reads the mount time rather than `today`, which is
  // the day's midnight.
  const trialExpiredEligible = !!(
    profile &&
    !isInTrial &&
    profile.trialExpiresAt &&
    !profile.trialExpiryPromptShown &&
    new Date(profile.trialExpiresAt).getTime() < nowMs
  );
  const trialSurface = useSurface({
    id: "trial-expired",
    priority: 40,
    eligible: trialExpiredEligible,
  });
  const fellBehindSurface = useSurface({
    id: "fell-behind",
    priority: 30,
    eligible: fellBehindOpen,
  });
  const badgeSurface = useSurface({
    id: "badge",
    priority: 20,
    eligible: !!newBadge,
    suppressedBy: ["fell-behind"],
  });

  /**
   * The lifter's return. Measured from logged sessions rather than from the
   * programme's own idea of what should have happened: a plan full of
   * uncompleted days is not evidence of absence, and a lifter training off
   * plan is not away.
   */
  const liftReturn = useMemo(
    () => assessLiftReturn(workouts, localDateString()),
    [workouts]
  );
  // `useDismissOnce` scopes by uid, so a dismissal cannot leak across a
  // shared device; the key identifies the absence, so dismissing settles
  // this one and a later gap asks again.
  const { dismissed: liftReturnDismissed, dismiss: dismissLiftReturn } =
    useDismissOnce(`tropos-lift-return:${liftReturn.dismissKey ?? "none"}`);
  const liftReturnSurface = useSurface({
    id: "lift-return",
    priority: 28,
    eligible: liftReturn.layoff !== "none" && !liftReturnDismissed,
    // The run side speaks first when it has something to say about the same
    // absence: two welcome-backs in one visit is the pile-up the coordinator
    // exists to prevent, and the run sheet carries the race stakes.
    suppressedBy: ["fell-behind"],
  });

  // Goal-reached prompt. The nutrition direction is evaluated on every Home
  // visit, not only inside a Settings edit — otherwise a cutter who arrives
  // at goal keeps the full deficit indefinitely. The weigh-in→profile mirror
  // keeps profile.weightKg fresh, which is what makes this condition
  // reliable enough to evaluate on every Home visit. Asked once per goal
  // VALUE (uid-scoped): the deadband wobbles, and a re-firing prompt is a
  // nag — changing the goal in Settings re-arms the ask.
  const goalOffer = useMemo(
    () => (profile ? goalReachedOffer(profile) : null),
    [profile]
  );
  const { dismissed: goalReachedDismissed, dismiss: dismissGoalReached } =
    useDismissOnce(`tropos-goal-reached:${goalOffer?.goalWeightKg ?? 0}`);
  const goalReachedSurface = useSurface({
    id: "goal-reached",
    priority: 25,
    eligible: !!goalOffer && !goalReachedDismissed,
    suppressedBy: ["fell-behind", "trial-expired"],
  });

  // #995 tier-3 education lane (≤1 inline card at a time). The first-run
  // welcome coachmark wins over the two explainer banners (priorities set at
  // their call sites: body-metrics 20 > expenditure 10).
  // Data-derived visibility: only a genuine cold-start account (within the
  // activation window, < 3 workouts, activation loop not yet complete, not
  // dismissed) sees the welcome checklist — never a rich/returning account
  // that merely never tapped the X (audit #7).
  const welcomeChecklistVisible = shouldShowWelcomeChecklist({
    createdAtMs,
    nowMs,
    workoutCount: workouts.length,
    // Mirror the activation-framing read: treat in-flight runs as "has runs"
    // so the card doesn't briefly show before the lifetime count resolves.
    runCount: runStatsLoading ? 1 : lifetimeRunCount,
    mealCount: totalLifetimeMeals,
    dismissed: welcomeDismissed,
  });
  const welcomeCard = useEducationCard({
    id: "welcome-coachmark",
    priority: 30,
    eligible: welcomeChecklistVisible,
  });
  /* EVERY day in the strip opens its detail card, today included.
     There is no special case for today, and the argument for one — that
     its peek would duplicate the session cards below — does not hold.
     The cards are usually already on screen when the strip is, so
     scrolling to them is a tap that visibly does nothing, the one
     outcome a control must never have. And the peek is not a duplicate:
     it also carries the day's nutrition row, its unclaimed extras and
     the Manage action, none of which the CTA cards show.

     This is also what makes DayPeekCard's `dateKey === todayKey` diary
     link reachable. That branch shipped with the row and, with today
     unreachable, no user could ever hit it. */
  /* DS3 retired the "Tap a day for details" hint with the legend it sat
     in: the day circles are buttons and read as ones. */
  const handleDayTap = useCallback(function (dk: string) {
    setPeekDate(function (p) {
      return p === dk ? null : dk;
    });
  }, []);
  const closePeek = useCallback(function () {
    setPeekDate(null);
  }, []);
  const weekStripRef = useRef<HTMLDivElement>(null);
  useEffect(
    function () {
      if (!peekDate || !weekStripRef.current) return;
      const observer = new IntersectionObserver(
        function (entries) {
          if (!entries[0].isIntersecting) setPeekDate(null);
        },
        { threshold: 0.1 }
      );
      observer.observe(weekStripRef.current);
      return function () {
        observer.disconnect();
      };
    },
    [peekDate]
  );
  const peekW = useMemo(
    function () {
      return peekDate ? getWorkoutsForDate(peekDate) : [];
    },
    [peekDate, getWorkoutsForDate]
  );
  const peekT = useMemo(
    function () {
      return peekDate
        ? getDailyTotals(peekDate)
        : { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 };
    },
    [peekDate, getDailyTotals]
  );
  // PR-0c: today's scheduled lift, not next-incomplete. Resolver
  // returns null when today isn't a lift/both day or the schedule
  // has drifted past workouts[].length.
  const nextWorkout = resolvedToday.lift.workout;
  /* A new person's first workout is ready any day (lifts follow the
     rotation, ADR-0002), so on a rest day ask the lift-day question. */
  const brandNewLifter =
    todayType === "rest" &&
    getActivationFraming({
      createdAtMs,
      nowMs,
      todayType: "lift",
      workoutCount: workouts.length,
      runCount: 1,
      mealCount: 1,
    }).firstWorkout;
  const restDayFirstWorkoutIndex = brandNewLifter
    ? (programState?.workouts?.findIndex((w) => !w.completed) ?? -1)
    : -1;
  const restDayFirstWorkout =
    restDayFirstWorkoutIndex >= 0
      ? (programState?.workouts?.[restDayFirstWorkoutIndex] ?? null)
      : null;
  const liftPurpose = liftSessionExplainer(
    programState,
    localDateString(),
    "full",
    nextWorkout?.exercises.map((ex) => ex.progressionType)
  );
  const plannedRun = resolvedToday.run.runDay;
  const purposeTemplate = RUN_TEMPLATES.find(
    (t) => t.id === (plannedRun?.userOverride ?? plannedRun?.templateId)
  );
  const runPresentation =
    purposeTemplate && profile?.runMode !== "freeform"
      ? runSessionPresentation({
          type: purposeTemplate.type,
          templateId: purposeTemplate.id,
          currentWeek: programState?.runPlan?.currentWeek,
          totalWeeks: programState?.runPlan?.totalWeeks,
          distance:
            programState?.runPlan?.raceGoal?.distance ??
            profile?.raceGoal?.distance,
        })
      : { purpose: null, weekLabel: null };
  const muscleGroups = useMemo(
    function () {
      if (!nextWorkout) return "";
      const groups = nextWorkout.exercises
        .map(function (ex) {
          return getExerciseById(
            (ex as { exerciseId?: string }).exerciseId ?? ""
          )?.category;
        })
        .filter(Boolean);
      const unique = [...new Set(groups)] as string[];
      if (unique.length === 0) return "";
      if (unique.length <= 3) return unique.join(" · ");
      return unique.slice(0, 3).join(" · ") + " + more";
    },
    [nextWorkout]
  );

  // PR-0c: today's scheduled run, resolved date/weekKey-aware. The
  // resolver returns the matched runDay (even when terminal — so
  // RunCTACard can still render "Done" via the PR-0b-iii status
  // gate). Returns null when there's no plan for today.
  const todayRun = resolvedToday.run.runDay;

  if (!profile) return <HomeSkeleton />;

  return (
    <PageShell
      /* DS3: Home names the day, as every other page names itself. The
         TROPOS wordmark it replaced is already on the launch icon and the
         splash; here the date and "Today" say what the page is about.
         The mark before the date signs the app's first page, small, so
         "Today" keeps the left edge every card below it starts on. */
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <BrandMark />
          {formatWeekdayDayMonth(today)}
        </span>
      }
      title="Today"
      actions={
        <>
          {/* Streak pill is tappable — deep-links into History → Badges
                so the user can see what streak-tier they're chasing next
                (e.g. "4 more days to Week Warrior"). The pill is a real
                achievement with reward context behind it; leaving it as
                an inert ornament threw away the motivation loop. The
                History page restores its last tab on mount, so we also
                persist the target in sessionStorage to force the Badges
                tab even if the user last looked at Lifting / Performance. */}
          {streak > 0 ? (
            <Link
              to="/history"
              onClick={() => {
                try {
                  sessionStorage.setItem("history-tab", "milestones");
                } catch {
                  /* private mode — fine, user lands on the default tab */
                }
              }}
              aria-label={`View milestones — ${streak}-day streak`}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <StreakFlame
                streak={streak}
                bounce={streakBounce}
                display={<motion.span>{streakDisplay}</motion.span>}
              />
            </Link>
          ) : (
            <StreakFlame
              streak={streak}
              bounce={streakBounce}
              display={<motion.span>{streakDisplay}</motion.span>}
            />
          )}
          {/* Settings opens from the user's own avatar (DS3): the photo when
              there is one, otherwise the initial on a lifting tint. The
              accessible name stays "Settings" because that is what it
              opens. */}
          <Link
            to="/settings"
            aria-label="Settings"
            className="inline-flex items-center justify-center size-11 rounded-full motion-safe:active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Avatar
              photoURL={profile.photoURL}
              displayName={profile.displayName || user?.displayName}
              size="md"
              fallbackBg="hsl(var(--lifting) / 0.2)"
              fallbackColor="hsl(var(--lifting-strong))"
            />
          </Link>
        </>
      }
    >
      {programController}
      {/* Persistent trial / upgrade strip */}
      {isInTrial && (
        <button
          type="button"
          onClick={function () {
            if (trialDaysLeft <= 2) {
              setShowProModal(true);
            } else {
              navigate("/upgrade?from=trial_strip");
            }
          }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl w-full text-left bg-primary/8 hover:bg-primary/12 transition-colors"
        >
          <Sparkles
            aria-hidden="true"
            className="size-4 text-primary shrink-0"
          />
          <span className="text-xs font-medium text-foreground flex-1 text-pretty">
            {trialDaysLeft <= 1 ? (
              "Trial ends tomorrow"
            ) : trialDaysLeft === 2 ? (
              <>
                Last <span className="font-mono tabular-nums">2</span> days of
                trial
              </>
            ) : (
              <>
                Pro trial &middot;{" "}
                <span className="font-mono tabular-nums">{trialDaysLeft}</span>{" "}
                days left
              </>
            )}
          </span>
          <span className="text-caption font-semibold text-primary-foreground bg-primary-strong rounded-full px-2.5 py-1 shrink-0">
            Subscribe
          </span>
        </button>
      )}
      {/* home-declutter 6b — the upgrade strip is snoozeable (uid-scoped,
          30 days) so the funnel resurfaces monthly instead of living
          permanently at the top of every session. Who sees it is
          `shouldShowHomeProStrip`: a free account a few days old, or one
          whose old free week has lapsed. The TRIAL countdown strip above
          is exempt: time-critical billing info that self-expires. */}
      {showProStrip && (
        <div className="flex items-center gap-1 rounded-xl bg-primary/8 hover:bg-primary/12 transition-colors">
          <button
            type="button"
            onClick={function () {
              navigate("/upgrade?from=home_strip");
            }}
            className="flex items-center gap-2.5 pl-3 py-2 flex-1 min-h-[44px] text-left"
          >
            <Sparkles
              aria-hidden="true"
              className="size-4 text-primary shrink-0"
            />
            <span className="text-xs font-medium text-foreground flex-1 text-pretty">
              {proStripTrialEligible
                ? "Log meals from a photo — try Pro free for 7 days"
                : "Upgrade to Pro"}
            </span>
            <span className="text-caption font-semibold text-primary-foreground bg-primary-strong rounded-full px-2.5 py-1 shrink-0">
              {proStripTrialEligible ? "Start trial" : "See plans"}
            </span>
          </button>
          <IconButton
            aria-label="Hide upgrade banner for a month"
            onClick={snoozeProStrip}
            icon={<X aria-hidden="true" />}
          />
        </div>
      )}

      {/* First-time coach marks — routed through the education lane so it
          doesn't stack with the explainer banners (#995). */}
      {welcomeCard.visible && (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
          className="p-4 rounded-2xl bg-card border border-primary/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              Welcome to Tropos
            </p>
            <button
              type="button"
              onClick={dismissCoachMarks}
              aria-label="Dismiss welcome message"
              className="size-11 -m-2 flex items-center justify-center rounded-lg hover:bg-muted active:scale-[0.97] transition-transform"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            {/* Hints map 1:1 to the real bottom-nav tabs (Programme / Food /
                Analytics), and draw each with that tab's own icon (DS3), so
                the hint points at the button it names. There is no "Log"
                tab — workouts and runs both start from Programme, meals are
                logged from Food. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrainTabIcon
                active={false}
                className="size-4 text-primary shrink-0"
              />
              <span>
                Tap <strong className="text-foreground">Train</strong> to start
                a workout or run
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="inline-flex shrink-0"
                style={{ color: THEME.semantic.nutrition }}
              >
                <FoodTabIcon active={false} className="size-4" />
              </span>
              <span>
                Tap <strong className="text-foreground">Food</strong> to log
                meals
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AnalyticsTabIcon
                active={false}
                className="size-4 text-primary shrink-0"
              />
              <span>
                Check <strong className="text-foreground">Analytics</strong> to
                view your progress
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Streak count stays in the header. Recovery remains available through
          Food's date picker; native reminders are deferred in POST_LAUNCH.md. */}

      {/* DS3 Home: the week, then today's session, food, water and weight,
          then how the week is going. The page title already says "Today",
          so the week strip and today's cards carry no section heading of
          their own; "This week" heads the summary at the foot. */}
      <motion.div
        ref={weekStripRef}
        variants={{
          hidden: { opacity: 0, y: 12 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
        className="space-y-3"
      >
        {/* WeekStrip + DayPeekCard render raw program/profile/claim data.
            Isolated in a SectionErrorBoundary so a data-shape bug here
            degrades to a single "couldn't load" card (and still logs via
            captureError) instead of taking the whole Home page into
            RouteErrorBoundary. */}
        <SectionErrorBoundary sectionName="week-strip">
          <WeekStrip
            dayMap={weeklyDayMap}
            profile={profile}
            programState={programState}
            claimMap={claimMap}
            selectedDate={peekDate}
            onDayTap={handleDayTap}
            loggedLiftDates={loggedLiftDates}
            extraRunDates={extraRunDates}
          />
          <AnimatePresence>
            {peekDate && (
              <DayPeekCard
                dateKey={peekDate}
                profile={profile}
                programState={programState}
                claimMap={claimMap}
                extras={unclaimedByDate.get(peekDate) ?? []}
                workouts={peekW}
                dailyTotals={peekT}
                onClose={function () {
                  setPeekDate(null);
                }}
                onManage={function (dk) {
                  setManageDate(dk);
                }}
              />
            )}
          </AnimatePresence>
        </SectionErrorBoundary>
      </motion.div>

      {/* home-declutter 4a — sessions FIRST. Today's lift, run or rest is
          the page's primary action and leads. */}
      <motion.div
        aria-label="Today’s training"
        variants={{
          hidden: { opacity: 0, y: 12 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        {programLoading ? (
          <div className="h-48 rounded-2xl bg-muted motion-safe:animate-pulse" />
        ) : (
          <TrackSectionView section="stacked_cta">
            <SectionErrorBoundary sectionName="quick-actions">
              <StackedCTACards
                nextWorkout={nextWorkout}
                liftPurpose={liftPurpose}
                runPurpose={runPresentation.purpose}
                runWeekLabel={runPresentation.weekLabel}
                liftDayIndex={resolvedToday.lift.index}
                liftStartable={resolvedToday.lift.isStartable}
                liftStatus={resolvedToday.lift.status}
                runCompleted={resolvedToday.run.isCompleted}
                todayType={todayType}
                navigate={function (p: string) {
                  closePeek();
                  navigate(p);
                }}
                todayRun={todayRun}
                muscleGroups={muscleGroups}
                firstWorkout={activationFraming.firstWorkout}
                firstRun={activationFraming.firstRun}
                firstMeal={activationFraming.firstMeal}
                tomorrow={tomorrowSession}
                restDayFirstWorkout={restDayFirstWorkout}
                restDayFirstWorkoutIndex={restDayFirstWorkoutIndex}
                freeRunner={
                  profile?.runMode === "freeform" &&
                  profile?.athleteType === "Runner"
                }
              />
            </SectionErrorBoundary>
          </TrackSectionView>
        )}
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        <TrackSectionView section="today_energy">
          <SectionErrorBoundary sectionName="today-intake">
            <TodayEnergy
              calories={dailyCal}
              protein={dailyProt}
              carbs={dailyCarbs}
              fat={dailyFat}
              targets={effectiveTargets}
              mealsLoading={mealsLoading}
              // Computed by useHomeData against the same protein target
              // the macro figures show (HOME-TARGET-01).
              postWorkoutNudge={postWorkoutNudge}
            />
          </SectionErrorBoundary>
        </TrackSectionView>
      </motion.div>

      {/* Water and weight share a row; items-stretch keeps the pair
          equal-height. */}
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
        className="grid grid-cols-2 gap-2 items-stretch"
      >
        <SectionErrorBoundary sectionName="water">
          <WaterCard
            compact
            ml={waterMl}
            targetMl={waterTargetMl}
            servingMl={servingMl}
            syncStatus={waterSyncStatus}
            onRetry={retryWater}
            drinks={waterDrinks}
            onRemoveDrink={removeWaterDrink}
            onLog={function (deltaMl) {
              closePeek();
              return logWater(deltaMl);
            }}
          />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="weight-steps">
          <WeightStepsTiles
            lastWeight={lastWeightInfo?.weight || null}
            weightUnit={weightUnit}
            onLogWeight={function () {
              closePeek();
              setShowWeightSheet(true);
            }}
            lastWeightDate={weightRelativeTime}
            syncStatus={weightSyncStatus}
            saveAnnouncement={weightAnnouncement}
            loading={homeDataLoading}
            hideNumber={profile?.hideWeightNumber}
            weightTrend={weightTrend}
            stepsStatus={stepsData.status}
            steps={stepsData.steps}
            onConnectSteps={function () {
              void stepsData.connect();
            }}
          />
        </SectionErrorBoundary>
      </motion.div>

      {/* This week: the week so far and its Performance Index, with the
          Weekly Review link on the heading while a review is waiting. The
          performance row keeps the ring, verdict and delta chip that made
          it the week's verdict (PI1 + PI4); it opens Analytics. */}
      <section aria-label="This week" className="space-y-2">
        <SectionHeading
          className="px-1"
          action={
            <SectionErrorBoundary sectionName="weekly-review-entry">
              <WeeklyReviewEntry />
            </SectionErrorBoundary>
          }
        >
          This week
        </SectionHeading>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          <Card className="space-y-4">
            <SectionErrorBoundary sectionName="week-summary">
              <WeekSummary counts={weekCounts} />
            </SectionErrorBoundary>
            <div className="border-t border-border pt-3">
              <TrackSectionView section="hero">
                <SectionErrorBoundary sectionName="performance-hero">
                  <PerformanceHeroCard
                    currentWeek={perfWeek ?? null}
                    previousWeek={perfPrevWeek}
                    weeksAvailable={perfDocsAvailable}
                    loading={perfLoading}
                    /* The perf doc is written by the server, so "no doc" is
                       not "no session" — this keeps the row from telling
                       someone who has just logged their first workout that
                       they logged nothing. */
                    hasLoggedSession={
                      workouts.length > 0 || lifetimeRunCount > 0
                    }
                  />
                </SectionErrorBoundary>
              </TrackSectionView>
            </div>
          </Card>
        </motion.div>
      </section>

      <div className="space-y-2" aria-label="Helpful tips">
        {/* A1 contextual tip: nudge the user to add age + sex if
          either is missing. These two fields drive TDEE precision
          (calculateTDEE consumes both); without them the user gets
          generic defaults and the calorie targets drift from
          accurate. One-shot per dismiss — the banner doesn't re-
          appear after dismissal even if the user re-introduces
          the gap. */}
        <ContextualTipBanner
          tipKey="body-metrics-v1"
          lanePriority={20}
          title="Personalise your calorie targets"
          description="Add your age and sex to make your calorie target more accurate."
          visible={!profile?.age || !profile?.sex}
        />

        {/* D7 — proactive recalibration check-in at natural seams (a few weeks
            in / after a gap). Per-seam tipKey so each seam can re-surface even
            after an earlier one was dismissed; gentle + dismiss-once. */}
        {(() => {
          const recal = recalibrationCheckIn({
            weekNumber: programState?.weekNumber,
          });
          return recal ? (
            <ContextualTipBanner
              tipKey={recal.tipKey}
              lanePriority={12}
              title={recal.title}
              description={recal.description}
              ctaLabel="Edit plan"
              ctaHref="/settings/training"
              visible={true}
            />
          ) : null;
        })()}

        {/* Goal-weight nudge REMOVED from Home (2026-07-20): it's an
          optional refinement — the app runs fine on the maintenance
          default — so it doesn't earn an interrupting full-width
          banner. Goal weight stays fully settable in Settings + the
          weight-log flow. (Contrast the age/sex nudge above, which is
          KEPT because a missing value there corrupts the TDEE math.) */}

        {/* Nutr1 one-time explainer (expenditure-inclusive model),
          relocated here into the Today group (2026-07-20) so the
          education lane always renders below the week strip in one
          consistent spot. It previously lived above the groups and,
          whenever it won the lane (e.g. once goal-weight was cut),
          jumped to the very top of the page above the week strip.
          Dismiss-once via the versioned tipKey; surfaces the
          deficit×big-session tension the #976 lock required. */}
        <ContextualTipBanner
          tipKey="nutrition-expenditure-inclusive-v1"
          lanePriority={10}
          title="Your activity is already in your target"
          description="No need to eat back exercise calories — your daily target already accounts for training. Big training days shift more carbs for fuel, so expect a deliberate deficit on your biggest days."
          visible={!!profile}
          ctaLabel="How targets work"
          ctaHref="/settings/nutrition#calorie-targets"
        />

        {/* Progressive profiling (fast-start PRD, final nudge): experience.
          Onboarding defaults experience to "intermediate" without asking;
          once the user has actually trained, invite them to set it so
          programme volume is tuned to reality. Same default-marker
          heuristic as the goal-weight nudge: visible while the value
          still equals the onboarding default — a genuine intermediate
          dismisses once (dismiss-once semantics), anyone else sets it
          and the banner never returns. */}
        <ContextualTipBanner
          tipKey="training-experience-v1"
          lanePriority={10}
          title="Tune your training volume"
          description="Review your training experience if your programme needs a different starting point."
          visible={
            !!profile &&
            workouts.length > 0 &&
            (profile.experience ?? "intermediate") === "intermediate"
          }
          ctaLabel="Set experience"
          ctaHref="/settings/lift-plan"
        />

        {/* Progressive profiling: race-goal invitation. Fast-start runners default
          to freeform (Run9a); once they've logged a run, invite race-prep via
          the Race Goal Planner (/settings/training, Run8/Run10). Hides when
          already race_prep with a date, or on dismiss. Discovery nudge, so it
          sits at the bottom of the lane priority. */}
        <ContextualTipBanner
          tipKey="race-goal-v1"
          lanePriority={5}
          title="Training for a race?"
          description="Set a target date and we'll shape your runs into a race plan."
          visible={
            !!profile &&
            !runStatsLoading &&
            lifetimeRunCount > 0 &&
            profile.runMode !== "race_prep" &&
            !profile.raceGoal?.targetDate
          }
          ctaLabel="Set a race goal"
          ctaHref="/settings/run-plan"
        />
      </div>

      {/* Weight Log Bottom Sheet */}
      <AnimatePresence>
        {showWeightSheet && user && (
          <WeightLogSheet
            uid={user.uid}
            unit={weightUnit}
            lastLoggedDate={lastWeightInfo?.rawDate}
            initialKg={
              lastWeightInfo?.kg ??
              (lastWeightInfo?.weight
                ? weightUnit === "lbs"
                  ? lbToKg(Number(lastWeightInfo.weight))
                  : Number(lastWeightInfo.weight)
                : undefined)
            }
            onClose={() => setShowWeightSheet(false)}
          />
        )}
      </AnimatePresence>

      {/* PR-1: per-day action sheet, opened by the peek's Manage
          CTA. Centralised dispatch of override / complete / skip
          for runs + skip for lifts — the three actions that were
          Week-tab-only pre-PR-1.

          Home2d-pin-1: wrapped in Suspense so the lazy()-imported
          chunk hydrates without blocking Home's first paint.
          fallback={null} because the drawer renders nothing while
          closed (open=false) — there's no visual real-estate to
          skeleton against, and the closed-state shape is identical
          to a nothing-rendered placeholder. */}
      <Suspense fallback={null}>
        <DayActionSheet
          open={manageDate !== null}
          onClose={function () {
            setManageDate(null);
          }}
          dateKey={manageDate}
          profile={profile}
          programState={programState}
          claimMap={claimMap}
          unclaimedByDate={unclaimedByDate}
          overrideRunDay={overrideRunDay}
          markManualComplete={markManualComplete}
          skipRunDay={skipRunDay}
          skipWorkoutDay={skipWorkoutDay}
          restoreRunDay={restoreRunDay}
          restoreWorkoutDay={restoreWorkoutDay}
          moveRunDay={moveRunDay}
        />
      </Suspense>

      {goalOffer && profile && user && (
        <GoalReachedSheet
          open={goalReachedSurface.active}
          offer={goalOffer}
          profile={profile}
          uid={user.uid}
          updateProfile={updateProfile}
          onResolved={() => {
            dismissGoalReached();
            goalReachedSurface.dismiss();
          }}
        />
      )}

      {liftReturn.daysAway !== null && liftReturn.layoff !== "none" && (
        <LiftReturnSheet
          open={liftReturnSurface.active}
          onClose={() => {
            dismissLiftReturn();
            liftReturnSurface.dismiss();
          }}
          onGoToProgramme={() => {
            dismissLiftReturn();
            liftReturnSurface.dismiss();
            navigate("/program");
          }}
          daysAway={liftReturn.daysAway}
          layoff={liftReturn.layoff}
        />
      )}

      {fellBehindPrompt && (
        <FellBehindSheet
          open={fellBehindSurface.active}
          onClose={() => {
            setFellBehindDismissedFor(fellBehindPrompt.weekKey);
            fellBehindSurface.dismiss();
          }}
          prompt={fellBehindPrompt}
          dismissFellBehindPrompt={dismissFellBehindPrompt}
          realignRacePlan={async () => {
            const { timing, totalWeeks } = await realignRacePlan();
            if (profile?.raceGoal) {
              toast.success(
                realignResultMessage({
                  timing,
                  distance: profile.raceGoal.distance as
                    | "5k"
                    | "10k"
                    | "half"
                    | "marathon",
                  totalWeeks,
                })
              );
            }
          }}
          onRaceMoved={() => {
            // "My race moved" — clear the flag and route to the dedicated
            // run-plan editor (Run-Split); retired the +7d auto-shift guess.
            void dismissFellBehindPrompt();
            navigate("/settings/run-plan");
          }}
          raceModeActive={
            profile?.runMode === "race_prep" && !!profile.raceGoal
          }
          recentLayoff={recentLayoff}
        />
      )}

      <BadgeEarnedModal
        badge={badgeSurface.active ? newBadge : null}
        onDismiss={() => {
          dismissNewBadge();
          badgeSurface.dismiss();
        }}
      />

      {/* Steps priming (surface B) — native only, at most once ever. `open`
          is derived: connecting or dismissing persists primingShown, which
          flips this false. On web status is "unavailable" so it never opens. */}
      <StepsPrimingModal
        open={stepsData.status === "unprompted" && !stepsData.primingShown}
        onConnect={stepsData.connect}
        onDismiss={function () {
          void stepsData.dismissPriming();
        }}
      />

      {/* Trial expired — one-time prompt. Home owns the surface slot and
          the one-time flag; the dialog is presentation only. Keep Pro lands
          on the offer page (the product, then the plans), tagged so the
          funnel can read this entry. */}
      <AnimatePresence>
        {trialSurface.active && (
          <TrialEndedDialog
            onDismiss={function () {
              trialSurface.dismiss();
              updateProfile({ trialExpiryPromptShown: true });
            }}
            onKeep={function () {
              trialSurface.dismiss();
              updateProfile({ trialExpiryPromptShown: true });
              navigate("/upgrade?from=trial_end");
            }}
          />
        )}
      </AnimatePresence>

      {/* ProModal for trial/upgrade strip */}
      <AnimatePresence>
        {showProModal && (
          <Suspense fallback={null}>
            <ProModal
              onClose={function () {
                setShowProModal(false);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
