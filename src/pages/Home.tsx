import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
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
import { collection, serverTimestamp } from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import { useClaimMap } from "@/hooks/useClaimMap";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import { calcDailyBurn } from "@/utils/dailyBurn";
import type { FitnessGoal } from "@/lib/tdee";
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

import TodayEnergy from "@/components/home/TodayEnergy";
import TodayGuidanceCard from "@/components/home/TodayGuidanceCard";
import { useHybridGuidance } from "@/hooks/useHybridGuidance";

import { usePerformanceWeeks } from "@/hooks/usePerformance";
import {
  analyzeNutritionPatterns,
  type MealEntry,
} from "@/lib/nutritionInsights";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import TrackSectionView from "@/components/home/TrackSectionView";
import ContextualTipBanner from "@/components/home/ContextualTipBanner";
import { recalibrationCheckIn } from "@/lib/recalibrationCheckIn";

const ProModal = lazy(() => import("@/components/ProModal"));

/* Home2d-pin-1: DayActionSheet + InsightStrip lazy-load on Home.
   Both surfaces are below-the-fold (sheet is closed on mount, strip
   is conditional on insight data). Pre-lazy they shipped in Home's
   initial chunk; now they hydrate on demand with a Suspense
   fallback that matches the expected dimensions to prevent layout
   shift. Mirrors the App.tsx route-level lazy() pattern. */
const DayActionSheet = lazy(
  () => import("@/components/program/DayActionSheet")
);
const InsightStrip = lazy(() => import("@/components/home/InsightStrip"));

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
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
    dismissFellBehindPrompt,
    realignRacePlan,
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
  const {
    glasses: waterGlasses,
    target: waterTarget,
    logWater,
    setWaterAmount,
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
  const hybridGuidance = useHybridGuidance(todayType);
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
    postWorkoutNudge,
  } = useHomeData(user, profile, workouts, weightUnit);

  // Daily burn for Today's Energy card.
  // Workout burn reads through `effectiveTargets.actualLiftBurn` (sums
  // stored `totalCalories` for today's workouts via the same
  // `isWorkoutOnDate` rule). Pre-cleanup `useHomeData` re-derived this
  // number inline with a "should match Food's useEffectiveTargets"
  // comment — drift hazard, deleted.
  const todayWorkoutCals = effectiveTargets?.actualLiftBurn ?? 0;

  const dailyBurn = useMemo(
    function () {
      // Base now reads profile.targetCalories directly — the stored value
      // already includes activityLevel-aware TDEE + phase deficit from
      // calculateTDEE. This avoids the previous double-count / underestimate
      // where calcDailyBurn was recomputing with a fixed 1.2 NEAT.
      const targetCalories = profile?.targetCalories ?? 2200;
      const phase = (profile?.program?.goal as FitnessGoal) || "recomp";
      return calcDailyBurn(
        targetCalories,
        phase,
        todayWorkoutCals,
        todayRunCals,
        0
      );
    },
    [
      profile?.targetCalories,
      profile?.program?.goal,
      todayWorkoutCals,
      todayRunCals,
    ]
  );

  // Performance data for InsightStrip
  // Pull up to 4 weeks: currentWeek powers the home card, the prior
  // week feeds the delta chip, and the count drives the baseline-
  // establishing copy when <4 weeks of data are available.
  const {
    weeks: perfWeeks,
    currentWeek: perfWeek,
    loading: perfLoading,
  } = usePerformanceWeeks(4);
  const perfPrevWeek =
    perfWeeks.length >= 2 ? perfWeeks[perfWeeks.length - 2] : null;
  const perfLoadBand = perfWeek?.labels?.loadBand || perfWeek?.loadBand || "";
  const showInsightStrip =
    perfWeek?.insight &&
    (perfLoadBand === "high" ||
      perfLoadBand === "overreach" ||
      perfWeek?.flags?.deloadRecommended);

  // Nutrition insight from meal patterns
  const topNutritionInsight = useMemo(
    function () {
      if (meals.length < 5) return null;
      const mapped: MealEntry[] = meals.slice(0, 100).map(function (m) {
        let mealType: "breakfast" | "lunch" | "dinner" | "snack" = "dinner";
        if (
          m.createdAt &&
          typeof (m.createdAt as { toDate?: () => Date }).toDate === "function"
        ) {
          const hour = (m.createdAt as { toDate: () => Date })
            .toDate()
            .getHours();
          if (hour < 10) mealType = "breakfast";
          else if (hour < 14) mealType = "lunch";
          else if (hour < 18) mealType = "snack";
        }
        return {
          calories: m.totalCalories,
          protein: m.totalProtein,
          carbs: m.totalCarbs,
          fat: m.totalFat,
          mealType,
          date: m.date,
        };
      });
      const insights = analyzeNutritionPatterns(mapped, {
        calories: effectiveTargets.finalTarget,
        protein: effectiveTargets.protein,
        carbs: effectiveTargets.carbs,
        fat: effectiveTargets.fat,
      });
      return insights.length > 0 ? insights[0] : null;
    },
    [meals, effectiveTargets]
  );

  // Meal history for conditional "Log first meal" CTA
  const totalLifetimeMeals = meals.length;
  const [daysSinceLastMeal, setDaysSinceLastMeal] = useState(Infinity);
  useEffect(
    function () {
      // Time-dependent computation — `daysSinceLastMeal` is derived
      // from `Date.now()` vs the most recent meal's date, which the
      // pure render path can't read without the effect. Two
      // setState calls (the empty-meals branch + the populated
      // branch) both legitimately need to be inside the effect; both
      // need the disable comment placed on the line immediately
      // preceding the setState so the eslint rule
      // `react-hooks/set-state-in-effect` doesn't trip on the
      // post-merge lint job.
      if (meals.length === 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- time-dependent computation requires useEffect
        setDaysSinceLastMeal(Infinity);
        return;
      }
      const lastDate = meals[0].date;
      setDaysSinceLastMeal(
        Math.floor(
          (Date.now() - new Date(lastDate + "T12:00:00").getTime()) / 86400000
        )
      );
    },
    [meals]
  );
  const userSegment = useMemo(
    function () {
      if (totalLifetimeMeals === 0) return "new" as const;
      if (streak >= 3) return "active" as const;
      if (streak === 0 && daysSinceLastMeal >= 3) return "returning" as const;
      return "casual" as const;
    },
    [totalLifetimeMeals, streak, daysSinceLastMeal]
  );

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
      const today = format(new Date(), "yyyy-MM-dd");
      await addDocGuarded(collection(db, "users", user.uid, "bodyweightLogs"), {
        date: today,
        weight: storeW,
        createdAt: serverTimestamp(),
      });
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
  const handleDayTap = useCallback(function (dk: string) {
    setPeekDate(function (p) {
      return p === dk ? null : dk;
    });
    try {
      localStorage.setItem("home-day-tap-seen", "1");
    } catch {
      /* private mode — hint will re-show, minor */
    }
    setShowDayTapHint(false);
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
                {"Week " +
                  programState.weekNumber +
                  " · " +
                  programState.currentPhase +
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
                Last <span className="tabular-nums">2</span> days of trial
              </>
            ) : (
              <>
                Pro trial &middot;{" "}
                <span className="tabular-nums">{trialDaysLeft}</span> days left
              </>
            )}
          </span>
          <span className="text-caption font-semibold text-primary-foreground bg-primary rounded-full px-2.5 py-1 shrink-0">
            Subscribe
          </span>
        </button>
      )}
      {!isPro && !isInTrial && profile?.trialExpiresAt && (
        <button
          type="button"
          onClick={function () {
            setShowProModal(true);
          }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl w-full text-left bg-primary/8 hover:bg-primary/12 transition-colors"
        >
          <Sparkles
            aria-hidden="true"
            className="size-4 text-primary shrink-0"
          />
          <span className="text-xs font-medium text-foreground flex-1 text-pretty">
            Upgrade to Pro
          </span>
          <span className="text-caption font-semibold text-primary-foreground bg-primary rounded-full px-2.5 py-1 shrink-0">
            See plans
          </span>
        </button>
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

      {/* Nutr1 one-time explainer (expenditure-inclusive model). Dismiss-once
          via ContextualTipBanner's versioned localStorage key (the locked
          spec named a profile flag; reusing the established dismiss-once
          banner is lower-risk and per-device re-show is acceptable for a
          one-time migration aid). Surfaces the deficit×big-session tension
          the #976 lock required ("a deliberate deficit on your biggest
          days"). Shown once to any onboarded user. */}
      <ContextualTipBanner
        tipKey="nutrition-expenditure-inclusive-v1"
        lanePriority={10}
        title="Your activity is already in your target"
        description="No need to eat back exercise calories — your daily target already accounts for training. Big training days shift more carbs for fuel, so expect a deliberate deficit on your biggest days."
        visible={!!profile}
        ctaLabel="How targets work"
        ctaHref="/settings"
      />

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
            {/* One-shot discoverability hint. Latches off on first day-tap
              so users who already know don't keep seeing it. */}
            {showDayTapHint && !peekDate && (
              <p className="text-caption text-muted-foreground/70 text-center -mt-1">
                Tap a day to see details
              </p>
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

        {/* Progressive profiling (fast-start #1087 deferred goal weight).
          Onboarding now saves goalWeightKg == weightKg (a maintenance default,
          no direction expressed), so once the user has logged food, invite them
          to set a real target for a precise calorie offset. Hides once a goal
          weight diverges from current weight (a direction is set) or on
          dismiss. Lower priority than the age/sex gap (which breaks TDEE
          outright) but above the generic nutrition explainer. */}
        <ContextualTipBanner
          tipKey="goal-weight-v1"
          lanePriority={15}
          title="Set a goal weight"
          description="Add a target weight so we can dial in your calories — right now you're on a maintenance default."
          visible={
            !!profile &&
            totalLifetimeMeals > 0 &&
            (profile.goalWeightKg == null ||
              profile.goalWeightKg === profile.weightKg)
          }
          ctaLabel="Set a goal weight"
          ctaHref="/settings"
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
          ctaHref="/settings/training"
        />

        {/* Today's Energy promoted above the CTA stack — calorie/macro tracking
          is the primary daily answer this page has to give, and buried at the
          bottom of the scroll it was below the fold on first load. Now lives
          directly under the Health Score card so it's always visible in the
          first paint. */}
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
                  daysSinceLastMeal={daysSinceLastMeal}
                  mealsLoading={mealsLoading}
                  postWorkoutNudge={postWorkoutNudge}
                  nutritionInsight={topNutritionInsight}
                />
              </SectionErrorBoundary>
            </TrackSectionView>
          </motion.div>
        </section>

        {hybridGuidance && (
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
            }}
          >
            <SectionErrorBoundary sectionName="today-guidance">
              <TodayGuidanceCard guidance={hybridGuidance} />
            </SectionErrorBoundary>
          </motion.div>
        )}

        <motion.div
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
                  todayType={todayType}
                  navigate={function (p: string) {
                    closePeek();
                    navigate(p);
                  }}
                  waterGlasses={waterGlasses}
                  waterTarget={waterTarget}
                  onAddWater={function () {
                    closePeek();
                    logWater(1);
                  }}
                  onRemoveWater={function () {
                    setWaterAmount(waterGlasses - 1);
                  }}
                  lastWeight={lastWeightInfo?.weight || null}
                  weightUnit={weightUnit}
                  onLogWeight={function () {
                    closePeek();
                    setWeightInput(lastWeightInfo?.weight || "");
                    setShowWeightSheet(true);
                  }}
                  lastWeightDate={weightRelativeTime}
                  hideWeightNumber={profile?.hideWeightNumber}
                  weightTrend={weightTrend}
                  todayRun={todayRun}
                  userSegment={userSegment}
                  muscleGroups={muscleGroups}
                  firstWorkout={activationFraming.firstWorkout}
                  firstRun={activationFraming.firstRun}
                  firstMeal={activationFraming.firstMeal}
                />
              </SectionErrorBoundary>
            </TrackSectionView>
          )}
        </motion.div>

        {showInsightStrip && perfWeek?.insight && (
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
            }}
          >
            <TrackSectionView section="insights">
              <SectionErrorBoundary sectionName="insight-strip">
                {/* Home2d-pin-1: Suspense fallback dimensioned at ~80pt
                  to match InsightStrip's rendered height — prevents
                  layout shift on first hydration. */}
                <Suspense
                  fallback={
                    <div
                      className="h-20 rounded-xl bg-muted/40 animate-pulse"
                      aria-hidden="true"
                    />
                  }
                >
                  <InsightStrip
                    title={perfWeek.insight.title}
                    bullet={perfWeek.insight.bullets[0] || ""}
                    loadBand={perfLoadBand}
                  />
                </Suspense>
              </SectionErrorBoundary>
            </TrackSectionView>
          </motion.div>
        )}
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
        />
      </Suspense>

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
            // "My race moved" — clear the flag and route to the single date
            // editor (Run9e); retired the +7d auto-shift guess.
            void dismissFellBehindPrompt();
            navigate("/settings/training");
          }}
          raceModeActive={
            profile?.runMode === "race_prep" && !!profile.raceGoal
          }
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
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
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
