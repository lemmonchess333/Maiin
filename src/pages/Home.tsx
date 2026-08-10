import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useMeals } from "@/hooks/useMeals";
import { useHomeData } from "@/hooks/useHomeData";
import { useLifetimeRunStats } from "@/hooks/useLifetimeRunStats";
import {
  getActivationFraming,
  isWithinActivationWindow,
  shouldShowWelcomeChecklist,
} from "@/lib/activationFraming";

import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { primaryGoalLabel } from "@/features/program/programEngine";
import { getExerciseById } from "@/lib/exercises";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dumbbell,
  Sparkles,
  Settings as SettingsIcon,
  Moon,
  RotateCcw,
  UtensilsCrossed,
  X,
  Target,
  Minus,
  Plus,
  Check,
} from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { realignResultMessage } from "@/lib/realignCopy";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { format } from "date-fns";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import { useClaimMap } from "@/hooks/useClaimMap";
import { weighInProfileMirror } from "@/lib/bodyweightLogs";
import { goalReachedOffer } from "@/lib/goalWeightPlan";
import GoalReachedSheet from "@/components/home/GoalReachedSheet";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { calcDailyBurn } from "@/utils/dailyBurn";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCountUp } from "@/hooks/useCountUp";

import { StreakFlame } from "@/components/StreakFlame";
import SectionLabel from "@/components/ui/SectionLabel";
import WeekStrip from "@/components/home/WeekStrip";
import DayPeekCard from "@/components/home/DayPeekCard";
import FellBehindSheet from "@/components/program/FellBehindSheet";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { useEducationCard } from "@/components/EducationLaneProvider";
import StackedCTACards from "@/components/home/StackedCTACards";
import PerformanceHeroCard from "@/components/home/PerformanceHeroCard";
import WaterCard from "@/components/home/WaterCard";
import WeightStepsTiles from "@/components/home/WeightStepsTiles";

import TodayEnergy from "@/components/home/TodayEnergy";
import WeeklyReviewEntry from "@/components/home/WeeklyReviewEntry";
import { useSnoozeDismiss } from "@/hooks/useSnoozeDismiss";

import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { getNutritionPhase } from "@/lib/nutritionPhase";
import TrackSectionView from "@/components/home/TrackSectionView";
import ContextualTipBanner from "@/components/home/ContextualTipBanner";
import { IconButton } from "@/components/ui/IconButton";
import { recalibrationCheckIn } from "@/lib/recalibrationCheckIn";

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
  const { meals, loading: mealsLoading, getDailyTotals } = useMeals();

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
  } = useProgram();
  const weeklyDayMap = useWeeklyDayMap();
  const navigate = useNavigate();
  const {
    currentStreak: streak,
    forgivenYesterday,
    backfillRescueStreak,
    newBadge,
    dismissNewBadge,
  } = useStreaks();
  const { ml: waterMl, target: waterTargetMl, logWater } = useWaterLog();

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
  const weightSheetRef = useFocusTrap<HTMLDivElement>(showWeightSheet);
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
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
  const today = useMemo(function () {
    return new Date();
  }, []);
  const todayKey = localDateString(today);
  const currentWeekKey = localWeekKey(today);
  // PR-J Q3 chunk B3c — single source of truth for derived run-day
  // completion across all of Home's surfaces (WeekStrip dot, DayPeek
  // "Run completed" copy, today-resolver's run.isCompleted). Q5
  // chunk B3f forwards unclaimedByDate to DayActionSheet for the
  // same-date paradox hint (P74), and Q5 chunk B3g forwards it to
  // DayPeekCard for the extras rows.
  const { claimMap, unclaimedByDate } = useClaimMap();
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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from streak change event
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
    todayRunCals,
    lastWeightInfo,
    weightTrend,
    setLastWeightInfo,
  } = useHomeData(user, profile, workouts, weightUnit);

  // Daily burn for Today's Energy card.
  // Workout burn reads through `effectiveTargets.actualLiftBurn` (sums
  // stored `totalCalories` for today's workouts via the same
  // `isWorkoutOnDate` rule). Pre-cleanup `useHomeData` re-derived this
  // number inline with a "should match Food's useEffectiveTargets"
  // comment — drift hazard, deleted.
  const todayWorkoutCals = effectiveTargets?.actualLiftBurn ?? 0;

  // Hoisted out of the memo below: calling getNutritionPhase(profile) inside
  // the useMemo makes the React Compiler infer the whole `profile` as a
  // dependency (less specific than the manual dep array), tripping
  // react-hooks/preserve-manual-memoization. Computing the phase here keeps
  // the memo body referencing a primitive string, so the inferred deps match.
  const nutritionPhase = getNutritionPhase(profile);
  const dailyBurn = useMemo(
    function () {
      // HOME-TARGET-01: one target everywhere. The breakdown base is the
      // SAME `effectiveTargets.finalTarget` the header shows (it already
      // includes activityLevel-aware TDEE + phase deficit, and any adaptive
      // adjustment), so the breakdown can't disagree with the headline
      // number. Falls back to the stored `targetCalories` while the
      // effective targets resolve, then a sane default.
      const targetCalories =
        effectiveTargets?.finalTarget ?? profile?.targetCalories ?? 2200;
      return calcDailyBurn(
        targetCalories,
        nutritionPhase,
        todayWorkoutCals,
        todayRunCals,
        0
      );
    },
    [
      effectiveTargets?.finalTarget,
      profile?.targetCalories,
      nutritionPhase,
      todayWorkoutCals,
      todayRunCals,
    ]
  );

  // Performance data for the hero card.
  // Pull up to 4 weeks: currentWeek powers the home card, the prior
  // week feeds the delta chip, and the count drives the baseline-
  // establishing copy when <4 weeks of data are available.
  const {
    weeks: perfWeeks,
    currentWeek: perfWeek,
    loading: perfLoading,
  } = usePerformanceWeeks(4);

  // The "one voice per screen" arbiter that used to live here went with
  // the guidance slot it arbitrated (removed 2026-08-10, operator call:
  // "remove today section it's bad"). The Performance hero is now the
  // only voice in this position, so there is nothing left to suppress.
  const perfPrevWeek =
    perfWeeks.length >= 2 ? perfWeeks[perfWeeks.length - 2] : null;

  // Meal history for the energy row's cold-start state.
  // (home-declutter 2a/3a: the meal-pattern insight + post-workout nudge
  // that used to pipe into TodayEnergy were dropped with the compact row —
  // one voice per screen; that detail lives in the Food tab.)
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

  const adjustWeight = function (delta: number) {
    const current = parseFloat(weightInput) || 0;
    const next = Math.max(0, current + delta).toFixed(1);
    setWeightInput(next);
  };

  const handleLogWeight = async function () {
    if (!weightInput || !user) return;
    const raw = Number(weightInput);
    if (Number.isNaN(raw) || raw <= 0) return;
    const storeW = weightUnit === "lbs" ? raw / 2.20462 : raw;
    if (storeW < 20 || storeW > 350) return;
    setWeightSaving(true);
    try {
      // One canonical row per local day: date-keyed upsert (doc id = date)
      // instead of a fresh random-id append per tap. A second same-day
      // weigh-in overwrites the first rather than adding an independent
      // observation the adaptive-TDEE / trend engines would double-count.
      // (ADR 0007: doc-id=date, manual-wins, HealthKit uses source:"healthkit".)
      const today = localDateString();
      await setDocGuarded(
        doc(db, "users", user.uid, "bodyweightLogs", today),
        {
          date: today,
          weight: storeW,
          source: "manual",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      // Mirror the fresh weigh-in onto profile.weightKg — the anchor
      // calculateTDEE / getAdjustedTargets / resolveGoalWeightPlan all
      // read, which this flow previously left stale for months (see
      // weighInProfileMirror). Best-effort AFTER the canonical log row
      // lands: a failed mirror must not fail the weigh-in, and the next
      // weigh-in retries it. throwOnError so the generic "couldn't save
      // your settings" toast doesn't fire over a successful weigh-in.
      const mirror = weighInProfileMirror(profile?.weightKg, storeW);
      if (mirror) {
        updateProfile(mirror, { throwOnError: true }).catch((e) =>
          logger.warn("[Home] weight mirror to profile failed", e)
        );
      }
      const disp =
        weightUnit === "lbs"
          ? (storeW * 2.20462).toFixed(1)
          : storeW.toFixed(1);
      setLastWeightInfo({
        weight: disp,
        date: format(new Date(), "MMM d"),
        rawDate: today,
      });
      setWeightSaved(true);
      haptic("success");
      setTimeout(function () {
        setWeightSaved(false);
        setWeightInput("");
        setShowWeightSheet(false);
      }, 500);
    } catch (e) {
      // Previously: silent log only — sheet stayed open with the form
      // still populated, weightSaving turned off, and the user had no
      // signal whether the save worked or not. Now surface the failure
      // so they know to retry.
      logger.error("[Home] weight save failed", e);
      toast.error("Couldn't save your weight. Please try again.");
    }
    setWeightSaving(false);
  };

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
  // Trial-expiry eligibility is a pure derivation off the stable `today` memo
  // (no Date.now() in render → satisfies react-hooks/purity); it replaces the
  // old set-state-in-effect one-time check.
  const trialExpiredEligible = !!(
    profile &&
    !isInTrial &&
    profile.trialExpiresAt &&
    !profile.trialExpiryPromptShown &&
    new Date(profile.trialExpiresAt).getTime() < today.getTime()
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
    dropWhenMissed: true,
    onDrop: dismissNewBadge,
  });

  // Goal-reached prompt (probe sweep 2026-08-05): the nutrition direction
  // used to be re-resolved only inside a Settings edit, so a cutter who
  // arrived kept the full deficit indefinitely. The weigh-in→profile mirror
  // keeps profile.weightKg fresh, which is what makes this condition
  // reliable enough to evaluate on every Home visit. Asked once per goal
  // VALUE (uid-scoped): the deadband wobbles, and a re-firing prompt is a
  // nag — changing the goal in Settings re-arms the ask.
  const goalOffer = useMemo(
    () => (profile ? goalReachedOffer(profile) : null),
    [profile]
  );
  const { dismissed: goalReachedDismissed, dismiss: dismissGoalReached } =
    useDismissOnce(
      `tropos-goal-reached:${user?.uid ?? "anon"}:${goalOffer?.goalWeightKg ?? 0}`
    );
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
  // Discoverability latch: the tiny "Tap a day to see details" hint under
  // the week strip disappears as soon as the user taps any day once (the
  // affordance has been used, no need to keep advertising). Persisted to
  // localStorage so the hint doesn't re-appear on every session.
  const [showDayTapHint, setShowDayTapHint] = useState<boolean>(() => {
    try {
      return localStorage.getItem("home-day-tap-seen") !== "1";
    } catch {
      return true;
    }
  });
  // Cal-A: scroll target for the today-tap shortcut (the session cards).
  const sessionsRef = useRef<HTMLDivElement>(null);
  const handleDayTap = useCallback(function (dk: string) {
    try {
      localStorage.setItem("home-day-tap-seen", "1");
    } catch {
      /* private mode — hint will re-show, minor */
    }
    setShowDayTapHint(false);
    // Cal-A: tapping TODAY is redundant with the live session cards
    // right below — scroll to them instead of re-printing a peek copy.
    if (dk === localDateString()) {
      setPeekDate(null);
      sessionsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
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
    <motion.div
      className="flex flex-col gap-4 pb-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      <header>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
          className="flex items-center justify-between pt-1 pb-1"
        >
          <div className="flex flex-col">
            {/* TROPOS wordmark only — the hexagon icon was removed because it's
                redundant with the iOS Home Screen / PWA launch icon. The icon
                SVG itself is intentionally kept in `public/` and the manifest
                so the device installer still has it. */}
            <h1 className="text-2xl font-extrabold tracking-[0.14em] text-foreground uppercase leading-none">
              TROPOS
            </h1>
            {programState && (
              <span className="text-xs font-medium text-muted-foreground mt-0.5">
                {/* LIFT-EV-02 (owner decision 2026-08-09): the phase label
                    derives from the PRIMARY GOAL, with the deload lifecycle
                    state overriding — the raw currentPhase string told every
                    fresh plan "Hypertrophy phase" regardless of goal, and
                    "progression phase" thereafter. */}
                {"Week " +
                  programState.weekNumber +
                  " · " +
                  (programState.currentPhase === "deload"
                    ? "Deload"
                    : primaryGoalLabel(programState.primaryGoal)) +
                  " phase"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
                    sessionStorage.setItem("history-tab", "badges");
                  } catch {
                    /* private mode — fine, user lands on the default tab */
                  }
                }}
                aria-label={`View badges — ${streak}-day streak`}
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
            <Link
              to="/settings"
              aria-label="Settings"
              style={{
                // Match StreakFlame's pill surface so the two header
                // chips read as siblings instead of "filled pill next
                // to a faded outline icon."
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
              }}
              className="inline-flex items-center justify-center size-11 rounded-full bg-card text-muted-foreground hover:bg-muted active:scale-[0.97] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <SettingsIcon aria-hidden="true" className="size-5" />
            </Link>
          </div>
        </motion.div>
      </header>

      {/* Persistent trial / upgrade strip */}
      {isInTrial && (
        <button
          type="button"
          onClick={function () {
            if (trialDaysLeft <= 2) {
              setShowProModal(true);
            } else {
              navigate("/upgrade");
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
      {/* home-declutter 6b — the post-trial upgrade strip is snoozeable
          (uid-scoped, 30 days) so the funnel resurfaces monthly instead of
          living permanently at the top of every session. The TRIAL
          countdown strip above is exempt: time-critical billing info that
          self-expires. */}
      {!isPro && !isInTrial && profile?.trialExpiresAt && !proStripSnoozed && (
        <div className="flex items-center gap-1 rounded-xl bg-primary/8 hover:bg-primary/12 transition-colors">
          <button
            type="button"
            onClick={function () {
              setShowProModal(true);
            }}
            className="flex items-center gap-2.5 pl-3 py-2 flex-1 min-h-[44px] text-left"
          >
            <Sparkles
              aria-hidden="true"
              className="size-4 text-primary shrink-0"
            />
            <span className="text-xs font-medium text-foreground flex-1 text-pretty">
              Upgrade to Pro
            </span>
            <span className="text-caption font-semibold text-primary-foreground bg-primary-strong rounded-full px-2.5 py-1 shrink-0">
              See plans
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
              Welcome to Tropos!
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
                Analytics). There is no "Log" tab — workouts and runs both
                start from Programme, meals are logged from Food. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Dumbbell className="size-4 text-primary shrink-0" />
              <span>
                Tap <strong className="text-foreground">Train</strong> to start
                a workout or run
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UtensilsCrossed
                className="size-4 shrink-0"
                style={{ color: THEME.warning }}
              />
              <span>
                Tap <strong className="text-foreground">Food</strong> to log
                meals
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="size-4 text-primary shrink-0" />
              <span>
                Check <strong className="text-foreground">Analytics</strong> to
                view your progress
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* No pre-emptive streak at-risk signal. The Streak1 lock permits only
          gentle AFTER-the-fact reassurance (the grace card just below) —
          "NEVER a pre-emptive threat". The old orange "streak at risk" banner
          that lived here was an un-locked violation of that clause; removed
          (Streak1 STATUS 2026-06-07). The 🔥 pill shows the count only. */}

      {/* Grace reassurance (Streak1 visibility) — calm, after-the-fact: shown
          only when today is logged AND yesterday was an off-day that grace
          bridged. Purple (brand/calm), never orange (orange = the at-risk
          warning above). The two are mutually exclusive by construction. */}
      {forgivenYesterday && (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
          className="flex items-center gap-3 p-3 rounded-xl border"
          style={{
            background: `${THEME.brand}14`,
            borderColor: `${THEME.brand}33`,
          }}
        >
          <Moon className="size-5 shrink-0" style={{ color: THEME.brand }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: THEME.brand }}>
              Yesterday's rest day is covered
            </p>
            <p className="text-xs text-muted-foreground">
              You're still on a {streak}-day streak.
            </p>
          </div>
        </motion.div>
      )}

      {/* Backfill rescue (Streak1 Tier B discoverability) — the streak broke,
          but logging yesterday retroactively would revive it. One-tap deep
          link into Food on yesterday's date. Shown only when a backfill
          actually restores a streak worth saving (>= 3); mutually exclusive
          with the two nudges above (those require a live streak). */}
      {backfillRescueStreak > 0 && (
        <motion.button
          type="button"
          onClick={() => {
            haptic();
            navigate(
              `/food?date=${format(new Date(Date.now() - 86400000), "yyyy-MM-dd")}`
            );
          }}
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
          className="flex items-center gap-3 p-3 rounded-xl border w-full text-left active:scale-[0.98] transition-transform"
          style={{
            background: `${THEME.brand}14`,
            borderColor: `${THEME.brand}33`,
          }}
        >
          <RotateCcw
            className="size-5 shrink-0"
            style={{ color: THEME.brand }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: THEME.brand }}>
              Bring back your {backfillRescueStreak}-day streak
            </p>
            <p className="text-xs text-muted-foreground">
              Missed yesterday? Log it to keep your streak going.
            </p>
          </div>
        </motion.button>
      )}

      {/* Home2-hierarchy: grouped sections (This week / Performance /
          Today) replace the prior flat equal-altitude stack — tight
          within a group, airy between, via SectionLabel headers. */}
      <div className="space-y-2.5">
        <SectionLabel tier="section" className="px-1">
          This week
        </SectionLabel>
        <motion.div
          ref={weekStripRef}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
          className="space-y-3"
        >
          {/* WeekStrip + DayPeekCard render raw program/profile/claim data.
            Isolated in a SectionErrorBoundary like the hero/energy/insight
            siblings below — a data-shape bug here degrades to a single
            "couldn't load" card (and still logs via captureError) instead
            of taking the whole Home page into RouteErrorBoundary. */}
          <SectionErrorBoundary sectionName="week-strip">
            <WeekStrip
              dayMap={weeklyDayMap}
              profile={profile}
              programState={programState}
              claimMap={claimMap}
              selectedDate={peekDate}
              onDayTap={handleDayTap}
            />
            {/* Cal-A: legend so the day dots are decodable (purple ● =
                lift, coral ◆ = run). Hidden while a peek is open to keep
                the expanded card clean. */}
            {!peekDate && (
              <div className="flex items-center justify-center gap-3 -mt-1">
                <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: THEME.lifting }}
                  />
                  Lift
                </span>
                <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                  <span
                    className="size-1.5 rotate-45"
                    style={{ backgroundColor: THEME.running }}
                  />
                  Run
                </span>
                {/* One-shot tap affordance — latches off after the first
                    day-tap ever. */}
                {showDayTapHint && (
                  <span className="text-caption text-muted-foreground/70">
                    · Tap a day for details
                  </span>
                )}
              </div>
            )}
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
      </div>

      {/* PI1 + PI4: consolidated Performance hero. Replaces the
          earlier HealthScoreCard (daily 0-100 composite) + the
          PerformanceCard compact tile. Single ring + verb + line +
          delta chip driven by the weekly PI doc. Tap →
          /history#performance per the canonical deep-link target.
          Sits in HealthScoreCard's original slot (PI4 drop-in);
          the PerformanceCard slot below it was removed.
          Home2-hierarchy: kept in place (between This week and Today)
          per the chosen arrangement. */}
      <div className="space-y-2.5">
        <SectionLabel tier="section" className="px-1">
          Performance
        </SectionLabel>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          <TrackSectionView section="hero">
            <SectionErrorBoundary sectionName="performance-hero">
              <PerformanceHeroCard
                currentWeek={perfWeek ?? null}
                previousWeek={perfPrevWeek}
                weeksAvailable={perfWeeks.length}
                loading={perfLoading}
              />
            </SectionErrorBoundary>
          </TrackSectionView>
        </motion.div>
      </div>

      {/* Home2-hierarchy: Today group — contextual nudges + energy +
          quick actions + insight, clustered under one "Today" header. */}
      <div className="space-y-2.5">
        <SectionLabel tier="section" className="px-1">
          Today
        </SectionLabel>

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
          description="Add your age and sex so we can tune your TDEE more accurately than the defaults."
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
          ctaHref="/settings"
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
          description="Tell us your training experience — your programme assumed intermediate as a starting point."
          visible={
            !!profile &&
            workouts.length > 0 &&
            (profile.experience ?? "intermediate") === "intermediate"
          }
          ctaLabel="Set experience"
          ctaHref="/settings/training"
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

        {/* Today's Energy promoted above the CTA stack — calorie/macro tracking
          is the primary daily answer this page has to give, and buried at the
          bottom of the scroll it was below the fold on first load. Now lives
          directly under the Health Score card so it's always visible in the
          first paint. */}
        {/* home-declutter 4a — sessions FIRST. The page's primary action
            (today's lift/run) leads the Today group; energy, guidance and
            vitals follow. */}
        <motion.div
          ref={sessionsRef}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          {programLoading ? (
            <div className="h-20 rounded-2xl bg-muted animate-pulse" />
          ) : (
            <TrackSectionView section="stacked_cta">
              <SectionErrorBoundary sectionName="quick-actions">
                <StackedCTACards
                  nextWorkout={nextWorkout}
                  liftDayIndex={resolvedToday.lift.index}
                  liftStartable={resolvedToday.lift.isStartable}
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
                />
              </SectionErrorBoundary>
            </TrackSectionView>
          )}
        </motion.div>

        <section aria-label="Today's energy">
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
                  burn={dailyBurn}
                  targets={effectiveTargets}
                  totalLifetimeMeals={totalLifetimeMeals}
                  mealsLoading={mealsLoading}
                />
              </SectionErrorBoundary>
            </TrackSectionView>
          </motion.div>
        </section>

        {/* Vitals pyramid (home-declutter revision, operator call):
            the energy card sits full-width above; water + weight share
            the row below — 1-over-2, the design system's compact-tile
            grid. items-stretch keeps the duo equal-height. */}
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
              onLog={function (deltaMl) {
                closePeek();
                logWater(deltaMl);
              }}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="weight-steps">
            <WeightStepsTiles
              lastWeight={lastWeightInfo?.weight || null}
              weightUnit={weightUnit}
              onLogWeight={function () {
                closePeek();
                setWeightInput(lastWeightInfo?.weight || "");
                setShowWeightSheet(true);
              }}
              lastWeightDate={weightRelativeTime}
              hideNumber={profile?.hideWeightNumber}
              weightTrend={weightTrend}
            />
          </SectionErrorBoundary>
        </motion.div>

        {/* home-declutter 5a — the Next Badge card left Home: badges keep
            the earn celebration (BadgeEarnedModal) and the History grid. */}

        {/* Rev1 — transient Weekly Review entry. Self-gating (eligibility +
            viewed state live inside the component); renders null most of
            the week so Home's density is unchanged outside the window. */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          <SectionErrorBoundary sectionName="weekly-review-entry">
            <WeeklyReviewEntry />
          </SectionErrorBoundary>
        </motion.div>

        {/* One voice per screen: the InsightStrip used to repeat the load
            verdict here during high/overreach/deload weeks — exactly when
            the Performance hero above was already saying it ("Backing off —
            loads high, ease this week" + "Consider a deload week" on one
            scroll). The hero carries the verdict; the strip's richer
            bullets live on in Analytics. */}
      </div>

      {/* Weight Log Bottom Sheet */}
      <AnimatePresence>
        {showWeightSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={function () {
                if (!weightSaved) {
                  setShowWeightSheet(false);
                }
              }}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              ref={weightSheetRef}
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50"
            >
              <div className="max-w-md mx-auto p-4 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-foreground">
                    Log Weight
                  </p>
                  <button
                    type="button"
                    onClick={function () {
                      setShowWeightSheet(false);
                    }}
                    aria-label="Close weight log"
                    className="p-2 -m-1 rounded-lg hover:bg-muted touch-target"
                  >
                    <X
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  </button>
                </div>
                {lastWeightInfo && (
                  <p className="text-micro" style={{ color: THEME.text.muted }}>
                    Last: {lastWeightInfo.weight}{" "}
                    {weightUnit === "lbs" ? "lb" : weightUnit}
                    {lastWeightInfo.rawDate
                      ? " \u00b7 " + weightRelativeTime.replace("Logged ", "")
                      : ""}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={function () {
                      haptic();
                      adjustWeight(-0.1);
                    }}
                    aria-label="Decrease by 0.1"
                    className="size-9 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border border-border/50 active:scale-95 transition-transform"
                  >
                    <Minus className="size-3.5 text-muted-foreground" />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={weightInput}
                    onChange={function (e) {
                      setWeightInput(e.target.value);
                    }}
                    onFocus={function (e) {
                      e.target.select();
                    }}
                    placeholder={"Weight in " + weightUnit}
                    aria-label={"Body weight in " + weightUnit}
                    className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-xl font-bold font-mono tabular-nums text-center"
                  />
                  <button
                    type="button"
                    onClick={function () {
                      haptic();
                      adjustWeight(0.1);
                    }}
                    aria-label="Increase by 0.1"
                    className="size-9 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border border-border/50 active:scale-95 transition-transform"
                  >
                    <Plus className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
                <motion.button
                  onClick={handleLogWeight}
                  disabled={!weightInput || weightSaving || weightSaved}
                  aria-label="Save weight"
                  className={cn(
                    "w-full py-3.5 rounded-xl font-semibold text-base transition-all",
                    !weightInput || weightSaving
                      ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                      : "text-white"
                  )}
                  style={
                    weightInput && !weightSaving
                      ? { backgroundColor: THEME.brand }
                      : undefined
                  }
                >
                  <AnimatePresence mode="wait">
                    {weightSaved ? (
                      <motion.span
                        key="saved"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center gap-2"
                      >
                        <Check className="size-5" /> Saved!
                      </motion.span>
                    ) : (
                      <motion.span
                        key="save"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {weightSaving ? "Saving..." : "Save Weight"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          </>
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

      {/* Trial expired — one-time prompt */}
      <AnimatePresence>
        {trialSurface.active && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={function () {
                trialSurface.dismiss();
                updateProfile({ trialExpiryPromptShown: true });
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-2xl bg-card p-6 space-y-4 shadow-xl border border-border/50"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <p className="text-base font-semibold text-foreground">
                  Your free trial has ended
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Your 7-day trial is over. Subscribe to keep AI photo logging,
                adaptive macros, and performance insights.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={function () {
                    trialSurface.dismiss();
                    updateProfile({ trialExpiryPromptShown: true });
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Maybe later
                </button>
                <button
                  type="button"
                  onClick={function () {
                    trialSurface.dismiss();
                    updateProfile({ trialExpiryPromptShown: true });
                    navigate("/upgrade");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary-strong text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Upgrade
                </button>
              </div>
            </motion.div>
          </>
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
    </motion.div>
  );
}
