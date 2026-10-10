import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import TrialEndingStrip from "@/components/home/TrialEndingStrip";
import WeightLogSheet from "@/components/home/WeightLogSheet";
import { lbToKg } from "@/lib/weightUnits";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { assessLiftReturn } from "@/features/program/liftLayoff";
import { useMeals } from "@/hooks/useMeals";
import { useHomeData } from "@/hooks/useHomeData";
import { useLifetimeRunStats } from "@/hooks/useLifetimeRunStats";
import { isWithinActivationWindow } from "@/lib/activationFraming";
import { firstWeek, type FirstWeekItemKey } from "@/lib/firstWeek";
import FirstWeekCard from "@/components/home/FirstWeekCard";
import {
  guideAllowedHere,
  guideRequest,
  rowStop,
  todayCard,
  walkOffered,
  walkStops,
  WALK_SEEN_KEY,
  type GuideStop,
} from "@/lib/firstGuide";
import { useGuideWalkReady } from "@/hooks/useGuideWalkReady";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import NewBadgeRow from "@/components/home/NewBadgeRow";

import { useSubscription } from "@/lib/subscription";
import { useHomeProgram } from "@/features/program/useHomeProgram";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageShell from "@/components/ui/PageShell";
import BrandMark from "@/components/ui/BrandMark";
import { Sparkles, X } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { toast } from "@/lib/toast";
import { realignResultMessage } from "@/lib/realignCopy";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { summariseWeek } from "@/lib/weekSummary";
import { trainingWeek, weekDays } from "@/lib/trainingWeek";
import { todaySession } from "@/lib/todaySession";
import { startDayKey } from "@/lib/startDay";
import { loggedAgo } from "@/lib/loggedAgo";
import { useClaimMapForProgram } from "@/hooks/useClaimMapForProgram";
import { goalReachedOffer } from "@/lib/goalWeightPlan";
import GoalReachedSheet from "@/components/home/GoalReachedSheet";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useCountUp } from "@/hooks/useCountUp";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";

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
import VerifyEmailBanner from "@/components/home/VerifyEmailBanner";
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

/* FV1: the first-visit walk lazy-loads the same way. It runs in an
   account's first seven days and on a replay, so it stays out of Home's
   own chunk for everyone past their first week. */
const GuideWalk = lazyRetry(() => import("@/components/guide/GuideWalk"));

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  // home-declutter 6b — uid-scoped monthly snooze for the post-trial
  // upgrade strip (shared-device rule: one account's snooze must not
  // hide the funnel for the next).
  const { snoozed: proStripSnoozed, snooze: snoozeProStrip } = useSnoozeDismiss(
    `tropos-pro-strip-snooze:${user?.uid ?? "anon"}`,
    30
  );
  const {
    workouts,
    getWorkoutsForDate,
    loading: workoutsLoading,
  } = useWorkouts();
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
    easeBackIn,
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
  // First-week card dismissal — persisted once-ever (audit #7). It keeps the
  // welcome checklist's key, so anyone who closed that card is not shown
  // this one. Visibility is data-derived below (firstWeek.ts); this is only
  // the explicit "I tapped the X" signal.
  const { dismissed: welcomeDismissed, dismiss: dismissCoachMarks } =
    useDismissOnce("tropos-welcome-checklist-dismissed");

  // The day comes from the shared local date key, which moves at midnight
  // and when the app returns to the foreground. Today's session
  // (`todaySession`), the strip, the day peek, the week's counts and
  // tomorrow's session all read it, so an app resumed the next morning
  // names the new day rather than the one it was opened on.
  const todayKey = useLocalDateKey();
  // The day, and the moment Home read it: both move when the day turns, so
  // a new account's window and a trial's end are measured on the same day
  // as everything else here.
  const { today, nowMs } = useMemo(
    () => ({ today: parseLocalDate(todayKey), nowMs: new Date().getTime() }),
    [todayKey]
  );
  const currentWeekKey = localWeekKey(today);
  // PR-J Q3 chunk B3c — single source of truth for derived run-day
  // completion across all of Home's surfaces (WeekStrip dot, DayPeek
  // "Run completed" copy, today-resolver's run.isCompleted). Q5
  // chunk B3f forwards unclaimedByDate to DayActionSheet for the
  // same-date paradox hint (P74), and Q5 chunk B3g forwards it to
  // DayPeekCard for the extras rows.
  const {
    claimMap,
    unclaimedByDate,
    runs: savedRuns,
  } = useClaimMapForProgram(programState);

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

  // The day the account began: the days before it plan nothing, on the
  // strip and in the week's counts (startDay.ts).
  const startKey = useMemo(
    () => startDayKey(profile?.createdAt),
    [profile?.createdAt]
  );

  // DS3 "This week": lifts and runs as every screen counts the week
  // (`trainingWeek`), and the days with food logged.
  const weekCounts = useMemo(
    function () {
      /* A day counts as logged when it has a meal, and the loaded meals
         are the record of that. The daily log holds the count Food last
         wrote, and Food writes nothing when a day's last meal is deleted,
         so the log can go on counting meals that are gone. It stands in
         only while the meals are loading or could not be read. */
      const mealsKnown = !mealsLoading && !mealsError;
      const mealsByDate = new Map<string, { meals: number }>();
      for (const day of weekDays(currentWeekKey)) {
        mealsByDate.set(day, {
          meals: mealsKnown
            ? getDailyTotals(day).mealCount
            : (weeklyDayMap.get(day)?.meals ?? 0),
        });
      }
      return summariseWeek({
        training: trainingWeek({
          weekKey: currentWeekKey,
          profile,
          programState,
          workouts,
          runs: savedRuns,
          now: today,
        }),
        mealsByDate,
        startKey,
      });
    },
    [
      startKey,
      currentWeekKey,
      today,
      profile,
      programState,
      workouts,
      savedRuns,
      weeklyDayMap,
      getDailyTotals,
      mealsLoading,
      mealsError,
    ]
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
  // Today's food, from the diary Home already holds: the totals Food shows
  // for the same day, a meal logged offline included.
  const todayIntake = useMemo(
    () => getDailyTotals(todayKey),
    [getDailyTotals, todayKey]
  );
  const {
    lastWeightInfo,
    weightTrend,
    weightSyncStatus,
    weightAnnouncement,
    weighInCount,
    postWorkoutNudge,
    loading: homeDataLoading,
  } = useHomeData(
    user,
    profile,
    workouts,
    weightUnit,
    // HOME-TARGET-01, protein half: the post-workout nudge must quote the
    // same target the macro rings on this screen show.
    effectiveTargets?.protein ?? null,
    { key: todayKey, protein: todayIntake.protein }
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
  // Today's session card: which card shows and what it says.
  const session = useMemo(
    () =>
      todaySession({
        today: todayKey,
        profile,
        programState,
        claimMap,
        workouts,
        createdAtMs,
        nowMs,
        lifetimeRuns: runStatsLoading ? null : lifetimeRunCount,
        lifetimeMeals: totalLifetimeMeals,
      }),
    [
      todayKey,
      profile,
      programState,
      claimMap,
      workouts,
      createdAtMs,
      nowMs,
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
      return loggedAgo(lastWeightInfo.rawDate, todayKey);
    },
    [lastWeightInfo, todayKey]
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
  /* A waiting badge is a row on Home that opens it when tapped
     (NewBadgeRow, ADR-0004's amendment); it no longer opens over Home on its
     own, so it is not one of the surfaces the coordinator arbitrates. */
  const [badgeOpen, setBadgeOpen] = useState(false);

  /**
   * The lifter's return. Measured from logged sessions rather than from the
   * programme's own idea of what should have happened: a plan full of
   * uncompleted days is not evidence of absence, and a lifter training off
   * plan is not away.
   */
  const liftReturn = useMemo(
    () => assessLiftReturn(workouts, todayKey),
    [workouts, todayKey]
  );
  // `useDismissOnce` scopes by uid, so a dismissal cannot leak across a
  // shared device; the key identifies the absence, so dismissing settles
  // this one and a later gap asks again.
  const { dismissed: liftReturnDismissed, dismiss: dismissLiftReturn } =
    useDismissOnce(`tropos-lift-return:${liftReturn.dismissKey ?? "none"}`);
  const liftReturnSurface = useSurface({
    id: "lift-return",
    priority: 28,
    eligible: liftReturn.welcomeBack && !liftReturnDismissed,
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

  // #995 tier-3 education lane (≤1 inline card at a time). The first-week
  // card wins over the two explainer banners (priorities set at their call
  // sites: body-metrics 20 > expenditure 10).
  // Data-derived visibility: a new account's first seven days, until each
  // item is done or the card is closed (firstWeek.ts). It waits for every
  // count it ticks from, so no row ticks and then unticks as they load.
  const countsLoaded =
    !workoutsLoading && !mealsLoading && !runStatsLoading && !homeDataLoading;
  const firstWeekState = useMemo(
    () =>
      countsLoaded
        ? firstWeek({
            startKey,
            todayKey,
            lifts: (programState?.workouts?.length ?? 0) > 0,
            runs:
              profile?.athleteType === "Runner" ||
              profile?.athleteType === "Hybrid" ||
              profile?.runMode === "race_prep",
            workoutCount: workouts.length,
            runCount: lifetimeRunCount,
            mealCount: totalLifetimeMeals,
            weighInCount,
            dismissed: welcomeDismissed,
          })
        : null,
    [
      countsLoaded,
      startKey,
      todayKey,
      programState?.workouts?.length,
      profile?.athleteType,
      profile?.runMode,
      workouts.length,
      lifetimeRunCount,
      totalLifetimeMeals,
      weighInCount,
      welcomeDismissed,
    ]
  );
  const welcomeCard = useEducationCard({
    id: "welcome-coachmark",
    priority: 30,
    eligible: firstWeekState !== null,
  });

  /* The first-visit guide (FV1, firstGuide.ts). A new account's first visit
     gets the walk: once, in its first seven days, as the visit's one
     blocking surface, once its first card is drawn and the launch
     animation has gone. Settings' "Show me around" plays it again, and a
     first-week row opens the one stop that does what the row names. */
  const location = useLocation();
  const [guideAllowed] = useState(guideAllowedHere);
  const { dismissed: walkSeen, dismiss: markWalkSeen } =
    useDismissOnce(WALK_SEEN_KEY);
  const guideCard = todayCard(session);
  const firstWeekItems =
    welcomeCard.visible && firstWeekState ? firstWeekState.items.length : 0;
  const guideStops = useMemo(
    () => walkStops({ today: guideCard, firstWeekItems }),
    [guideCard, firstWeekItems]
  );
  const homeSettled = countsLoaded && !programLoading;
  const walkDue =
    guideAllowed &&
    homeSettled &&
    walkOffered({ startKey, todayKey, seen: walkSeen });
  const walkReady = useGuideWalkReady(walkDue, guideStops[0]?.target);
  const guideSurface = useSurface({
    id: "first-visit-guide",
    priority: 45,
    eligible: walkDue && walkReady === "ready",
  });
  const replayAsked = guideRequest(location.state) === "walk";
  const [rowWalk, setRowWalk] = useState<GuideStop | null>(null);
  const autoWalk = guideSurface.active && walkDue;
  // Kept stable between renders: the walk re-measures when its stops change.
  const walk = useMemo((): {
    stops: GuideStop[];
    from: "first-visit" | "replay" | "first-week-row";
  } | null => {
    if (replayAsked && homeSettled)
      return { stops: guideStops, from: "replay" };
    if (rowWalk) return { stops: [rowWalk], from: "first-week-row" };
    if (autoWalk) return { stops: guideStops, from: "first-visit" };
    return null;
  }, [replayAsked, homeSettled, guideStops, rowWalk, autoWalk]);
  // The Health steps prompt waits for the walk, so a new account meets the
  // app before it is asked for anything.
  const walkHoldsPrompts = !!walk || (walkDue && walkReady !== "gave-up");
  // Whether this walk has shown a stop yet: it starts with the first one
  // seen, whichever that is (a stop with nothing to point at is passed).
  const walkShowing = useRef(false);
  const onWalkStep = (index: number, stop: GuideStop) => {
    if (!walk) return;
    if (!walkShowing.current) {
      walkShowing.current = true;
      trackLifecycle("guide_started", {
        walk: walk.from,
        count: walk.stops.length,
      });
    }
    trackLifecycle("guide_step_viewed", {
      walk: walk.from,
      stop: stop.id,
      stepIndex: index,
    });
  };
  const onWalkClose = (result: { finished: boolean; index: number }) => {
    if (!walk) return;
    walkShowing.current = false;
    trackLifecycle(result.finished ? "guide_finished" : "guide_skipped", {
      walk: walk.from,
      stop: walk.stops[result.index]?.id,
      stepIndex: result.index,
    });
    if (walk.from === "first-week-row") {
      setRowWalk(null);
      return;
    }
    markWalkSeen();
    if (walk.from === "first-visit") guideSurface.dismiss();
    if (replayAsked)
      navigate(location.pathname, { replace: true, state: null });
  };
  /* A first-week row opens its step: the session card that does it, when
     today's card is it (one stop, pointed out where the person already
     is); otherwise Train; Food with the composer pointed out; the weigh-in
     sheet. */
  const openFirstWeekItem = (key: FirstWeekItemKey) => {
    closePeek();
    if (key === "weigh-in") {
      setShowWeightSheet(true);
      return;
    }
    if (key === "meal") {
      navigate("/food", { state: { guide: "food-composer" } });
      return;
    }
    const stop = rowStop(key, guideCard);
    if (stop) {
      setRowWalk(stop);
      return;
    }
    navigate(key === "run" ? "/program?tab=run" : "/program?tab=lift");
  };
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
  if (!profile) return <HomeSkeleton />;

  return (
    <PageShell
      /* The launch animation waits for this before it sets its mark down
         on the header's, so it reveals today's session and food and not
         their loading placeholders (LaunchSplash, bounded by its
         CONTENT_WAIT_MS). Meals and the programme are the moment the
         Home2 render timing above calls real content; the counts further
         down (homeSettled) came in about 0.7 s after them when the launch
         was filmed on the emulator, and are not waited for. */
      data-page-ready={!mealsLoading && !programLoading ? "" : undefined}
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
      {/* A store trial's last two days (Sub1 pin 12): when it ends and what
          it costs after, with the store's own page to manage it. */}
      <TrialEndingStrip trial={profile.subscriptionTrial} />
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
            todayKey={todayKey}
            dayMap={weeklyDayMap}
            profile={profile}
            programState={programState}
            claimMap={claimMap}
            selectedDate={peekDate}
            onDayTap={handleDayTap}
            loggedLiftDates={loggedLiftDates}
            extraRunDates={extraRunDates}
            startKey={startKey}
          />
          <AnimatePresence>
            {peekDate && (
              <DayPeekCard
                dateKey={peekDate}
                todayKey={todayKey}
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
                session={session}
                navigate={function (p: string) {
                  closePeek();
                  navigate(p);
                }}
              />
            </SectionErrorBoundary>
          </TrackSectionView>
        )}
      </motion.div>

      {/* A new account's first seven days, under today's session: the
          session is the day's action, this is what the week is for.
          Routed through the education lane so it doesn't stack with the
          explainer banners (#995). */}
      {welcomeCard.visible && firstWeekState && (
        <motion.div
          data-guide-stop="first-week"
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          <FirstWeekCard
            week={firstWeekState}
            onDismiss={dismissCoachMarks}
            onOpen={openFirstWeekItem}
          />
        </motion.div>
      )}

      {newBadge && !badgeOpen && (
        <NewBadgeRow name={newBadge.name} onOpen={() => setBadgeOpen(true)} />
      )}

      {/* Email accounts verify after the plan; this asks, under today's
          session rather than above it. Renders nothing once verified. */}
      <SectionErrorBoundary sectionName="verify-email">
        <VerifyEmailBanner />
      </SectionErrorBoundary>

      <motion.div
        data-guide-stop="food"
        variants={{
          hidden: { opacity: 0, y: 12 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        <TrackSectionView section="today_energy">
          <SectionErrorBoundary sectionName="today-intake">
            <TodayEnergy
              calories={todayIntake.calories}
              protein={todayIntake.protein}
              carbs={todayIntake.carbs}
              fat={todayIntake.fat}
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

        {/* What left this lane, and why, so none of it comes back by habit:
          - The goal-weight nudge (2026-07-20): an optional refinement, the
            app runs fine on the maintenance default.
          - "Your activity is already in your target" (Nutr1): the walk's
            Food stop says it (FV1). Behind the first-week card, it never
            reached a new account in the week that most needed it.
          - Three tips (FV2, 2026-10-04). The age-and-sex nudge: setup
            always records both, and no Settings screen can change sex, so
            its button could not do what it asked. The experience nudge:
            written when setup didn't ask, it now asked people a week later
            to check the answer they had just given. The race-goal
            invitation: Train's Run tab carries the same card where run
            plans live, and this copy only worked on days 8 to 14. */}
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

      {liftReturn.daysAway !== null && liftReturn.welcomeBack && (
        <LiftReturnSheet
          open={liftReturnSurface.active}
          onClose={() => {
            dismissLiftReturn();
            liftReturnSurface.dismiss();
          }}
          onEaseBack={async () => {
            if (!(await easeBackIn(liftReturn.easeBackShare))) {
              throw new Error("The plan wasn't eased back");
            }
          }}
          daysAway={liftReturn.daysAway}
          easeBackFirst={liftReturn.easeBackFirst}
          easeBackShare={liftReturn.easeBackShare}
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
            const result = await realignRacePlan();
            // A refusal or a failed save has already been said by the writer.
            if (result.status === "applied" && profile?.raceGoal) {
              toast.success(
                realignResultMessage({
                  timing: result.timing,
                  distance: profile.raceGoal.distance as
                    | "5k"
                    | "10k"
                    | "half"
                    | "marathon",
                  totalWeeks: result.totalWeeks,
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
        badge={badgeOpen ? newBadge : null}
        onDismiss={() => {
          dismissNewBadge();
          setBadgeOpen(false);
        }}
      />

      {/* Steps priming (surface B) — native only, at most once ever. `open`
          is derived: connecting or dismissing persists primingShown, which
          flips this false. On web status is "unavailable" so it never opens. */}
      <StepsPrimingModal
        open={
          stepsData.ready &&
          stepsData.status === "unprompted" &&
          !stepsData.primingShown &&
          !walkHoldsPrompts
        }
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

      {walk && (
        <Suspense fallback={null}>
          <GuideWalk
            key={walk.from}
            stops={walk.stops}
            fromHeader={walk.from !== "first-week-row"}
            onStep={onWalkStep}
            onClose={onWalkClose}
          />
        </Suspense>
      )}

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
