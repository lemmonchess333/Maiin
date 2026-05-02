import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useMeals } from "@/hooks/useMeals";
import { useHomeData } from "@/hooks/useHomeData";

import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { getExerciseById } from "@/lib/exercises";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Sparkles, Settings as SettingsIcon, Flame, Footprints, X, Target, Minus, Plus, Check } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { calculateHealthScore } from "@/lib/healthScore";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { format } from "date-fns";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTodaySchedule, generateSchedule } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { calcDailyBurn } from "@/utils/dailyBurn";
import type { FitnessGoal } from "@/lib/tdee";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useCoachMarks } from "@/hooks/useCoachMarks";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCountUp } from "@/hooks/useCountUp";

import { StreakFlame } from "@/components/StreakFlame";
import WeekStrip from "@/components/home/WeekStrip";
import DayPeekCard from "@/components/home/DayPeekCard";
import StackedCTACards from "@/components/home/StackedCTACards";
import HealthScoreCard from "@/components/home/HealthScoreCard";
import InsightStrip from "@/components/home/InsightStrip";

import TodayEnergy from "@/components/home/TodayEnergy";

import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { analyzeNutritionPatterns, type MealEntry } from "@/lib/nutritionInsights";

const ProModal = lazy(() => import("@/components/ProModal"));

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  const { workouts, getWorkoutsForDate } = useWorkouts();
  const { meals, loading: mealsLoading, getDailyTotals } = useMeals();

  const effectiveTargets = useEffectiveTargets();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const { programState, loading: programLoading } = useProgram();
  const weeklyDayMap = useWeeklyDayMap();
  const navigate = useNavigate();
  const { currentStreak: streak, newBadge, dismissNewBadge } = useStreaks();
  const { glasses: waterGlasses, target: waterTarget, logWater, setWaterAmount } = useWaterLog();
  const [prevHealthScore, setPrevHealthScore] = useState<number | null>(null);
  const prevStreakRef = useRef<number>(0);
  const [streakBounce, setStreakBounce] = useState(false);
  const [showWeightSheet, setShowWeightSheet] = useState(false);
  const weightSheetRef = useFocusTrap<HTMLDivElement>(showWeightSheet);
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const { showCoachMarks, dismiss: dismissCoachMarks } = useCoachMarks();

  // One-time trial expiry modal
  useEffect(function() {
    if (!profile) return;
    if (!isInTrial && profile.trialExpiresAt && !profile.trialExpiryPromptShown) {
      const expiresAt = new Date(profile.trialExpiresAt);
      if (expiresAt.getTime() < Date.now()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time check on mount
        setShowTrialExpiredModal(true);
      }
    }
  }, [profile, isInTrial]);

  const schedule = useMemo<ScheduleDay[]>(function() {
    if (profile?.weekSchedule && profile.weekSchedule.length === 7) return profile.weekSchedule;
    return generateSchedule(profile?.weeklyWorkoutsTarget || 3, profile?.weeklyRunsTarget || 2);
  }, [profile?.weekSchedule, profile?.weeklyWorkoutsTarget, profile?.weeklyRunsTarget]);

  const todayType = (getTodaySchedule(schedule)?.type || "rest") as "lift" | "run" | "both" | "rest";
  const streakDisplay = useCountUp(streak, { sessionKey: "streak", duration: 0.5 });

  useEffect(function() {
    if (streak > prevStreakRef.current && prevStreakRef.current > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from streak change event
      setStreakBounce(true);
      const t = setTimeout(function() { setStreakBounce(false); }, 800);
      return function() { clearTimeout(t); };
    }
    prevStreakRef.current = streak;
  }, [streak]);

  const weightUnit = profile?.preferredWeightUnit || "kg";
  const { dailyCal, dailyProt, dailyCarbs, dailyFat, todayWorkoutCals, todayRunCals, lastWeightInfo, setLastWeightInfo, postWorkoutNudge } = useHomeData(user, profile, workouts, weightUnit);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayTotals = getDailyTotals(todayKey);
  const todayWorkoutCount = useMemo(function() {
    const tk = format(new Date(), "yyyy-MM-dd");
    return workouts.filter(function(w) { return w.date === tk; }).length;
  }, [workouts]);

  const healthScoreResult = useMemo(function() {
    return calculateHealthScore(
      {
        calories: todayTotals.calories,
        protein: todayTotals.protein,
        mealCount: todayTotals.mealCount,
      },
      {
        calories: effectiveTargets.finalTarget,
        protein: effectiveTargets.protein,
      },
      {
        workoutsToday: todayWorkoutCount,
        waterGlasses: waterGlasses,
        waterTarget: waterTarget,
        isRestDay: todayType === "rest",
      }
    );
  }, [todayTotals, effectiveTargets, todayWorkoutCount, waterGlasses, waterTarget, todayType]);
  const healthScore = healthScoreResult.score;

  useEffect(function() {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tracking previous value for animation
    if (healthScore != null) setPrevHealthScore(healthScore);
  }, [healthScore]);

  // Daily burn for Today's Energy card

  const dailyBurn = useMemo(function() {
    // Base now reads profile.targetCalories directly — the stored value
    // already includes activityLevel-aware TDEE + phase deficit from
    // calculateTDEE. This avoids the previous double-count / underestimate
    // where calcDailyBurn was recomputing with a fixed 1.2 NEAT.
    const targetCalories = profile?.targetCalories ?? 2200;
    const phase = (profile?.program?.goal as FitnessGoal) || "recomp";
    return calcDailyBurn(targetCalories, phase, todayWorkoutCals, todayRunCals, 0);
  }, [profile?.targetCalories, profile?.program?.goal, todayWorkoutCals, todayRunCals]);

  // Performance data for InsightStrip
  const { currentWeek: perfWeek } = usePerformanceWeeks(1);
  const perfLoadBand = perfWeek?.labels?.loadBand || perfWeek?.loadBand || "";
  const showInsightStrip = perfWeek?.insight && (perfLoadBand === "high" || perfLoadBand === "overreach" || perfWeek?.flags?.deloadRecommended);

  // Nutrition insight from meal patterns
  const topNutritionInsight = useMemo(function() {
    if (meals.length < 5) return null;
    const mapped: MealEntry[] = meals.slice(0, 100).map(function(m) {
      let mealType: "breakfast" | "lunch" | "dinner" | "snack" = "dinner";
      if (m.createdAt && typeof (m.createdAt as { toDate?: () => Date }).toDate === "function") {
        const hour = ((m.createdAt as { toDate: () => Date }).toDate()).getHours();
        if (hour < 10) mealType = "breakfast";
        else if (hour < 14) mealType = "lunch";
        else if (hour < 18) mealType = "snack";
      }
      return { calories: m.totalCalories, protein: m.totalProtein, carbs: m.totalCarbs, fat: m.totalFat, mealType, date: m.date };
    });
    const insights = analyzeNutritionPatterns(mapped, {
      calories: effectiveTargets.finalTarget,
      protein: effectiveTargets.protein,
      carbs: effectiveTargets.carbs,
      fat: effectiveTargets.fat,
    });
    return insights.length > 0 ? insights[0] : null;
  }, [meals, effectiveTargets]);

  // Meal history for conditional "Log first meal" CTA
  const totalLifetimeMeals = meals.length;
  const [daysSinceLastMeal, setDaysSinceLastMeal] = useState(Infinity);
  useEffect(function() {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- time-dependent computation requires useEffect
    if (meals.length === 0) { setDaysSinceLastMeal(Infinity); return; }
    const lastDate = meals[0].date;
    setDaysSinceLastMeal(Math.floor((Date.now() - new Date(lastDate + "T12:00:00").getTime()) / 86400000));
  }, [meals]);
  const userSegment = useMemo(function() {
    if (totalLifetimeMeals === 0) return "new" as const;
    if (streak >= 3) return "active" as const;
    if (streak === 0 && daysSinceLastMeal >= 3) return "returning" as const;
    return "casual" as const;
  }, [totalLifetimeMeals, streak, daysSinceLastMeal]);

  // Relative time string for weight tile
  const weightRelativeTime = useMemo(function() {
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
  }, [lastWeightInfo]);

  const adjustWeight = function(delta: number) {
    const current = parseFloat(weightInput) || 0;
    const next = Math.max(0, current + delta).toFixed(1);
    setWeightInput(next);
  };

  const handleLogWeight = async function() {
    if (!weightInput || !user) return;
    const raw = Number(weightInput);
    if (Number.isNaN(raw) || raw <= 0) return;
    const storeW = weightUnit === "lbs" ? raw / 2.20462 : raw;
    if (storeW < 20 || storeW > 350) return;
    setWeightSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      await addDoc(collection(db, "users", user.uid, "bodyweightLogs"), { date: today, weight: storeW, createdAt: serverTimestamp() });
      const disp = weightUnit === "lbs" ? (storeW * 2.20462).toFixed(1) : storeW.toFixed(1);
      setLastWeightInfo({ weight: disp, date: format(new Date(), "MMM d"), rawDate: today });
      setWeightSaved(true);
      haptic("success");
      setTimeout(function() { setWeightSaved(false); setWeightInput(""); setShowWeightSheet(false); }, 500);
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
  const handleDayTap = useCallback(function(dk: string) {
    setPeekDate(function(p) { return p === dk ? null : dk; });
    try { localStorage.setItem("home-day-tap-seen", "1"); } catch { /* private mode — hint will re-show, minor */ }
    setShowDayTapHint(false);
  }, []);
  const closePeek = useCallback(function() { setPeekDate(null); }, []);
  const weekStripRef = useRef<HTMLDivElement>(null);
  useEffect(function() {
    if (!peekDate || !weekStripRef.current) return;
    const observer = new IntersectionObserver(function(entries) {
      if (!entries[0].isIntersecting) setPeekDate(null);
    }, { threshold: 0.1 });
    observer.observe(weekStripRef.current);
    return function() { observer.disconnect(); };
  }, [peekDate]);
  const peekW = useMemo(function() { return peekDate ? getWorkoutsForDate(peekDate) : []; }, [peekDate, getWorkoutsForDate]);
  const peekT = useMemo(function() { return peekDate ? getDailyTotals(peekDate) : { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }; }, [peekDate, getDailyTotals]);
  const nextWorkout = programState?.workouts?.find(function(d) { return !d.completed; }) || null;
  const muscleGroups = useMemo(function() {
    if (!nextWorkout) return "";
    const groups = nextWorkout.exercises
      .map(function(ex) { return getExerciseById((ex as { exerciseId?: string }).exerciseId ?? "")?.category; })
      .filter(Boolean);
    const unique = [...new Set(groups)] as string[];
    if (unique.length === 0) return "";
    if (unique.length <= 3) return unique.join(" · ");
    return unique.slice(0, 3).join(" · ") + " + more";
  }, [nextWorkout]);

  // Find today's scheduled run (if any)
  const todayDayIndex = new Date().getDay(); // 0=Sun, 6=Sat
  const runDays = programState?.runDays;
  const todayRun = useMemo(function() {
    if (!runDays) return null;
    const rd = runDays.find(function(r) { return r.dayIndex === todayDayIndex && !r.completed; });
    return rd || null;
  }, [runDays, todayDayIndex]);

  if (!profile) return <HomeSkeleton />;

  return (
    <motion.div className="flex flex-col gap-4 pb-6" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>

      <header>
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="flex items-center justify-between pt-1 pb-1">
          <div className="flex flex-col">
            {/* TROPOS wordmark only — the hexagon icon was removed because it's
                redundant with the iOS Home Screen / PWA launch icon. The icon
                SVG itself is intentionally kept in `public/` and the manifest
                so the device installer still has it. */}
            <h1 className="text-xl font-extrabold tracking-wider text-foreground uppercase leading-tight">
              TROPOS
            </h1>
            {programState && (
              <span className="text-xs font-medium text-muted-foreground mt-0.5">
                {"Week " + programState.weekNumber + " · " + programState.currentPhase + " phase"}
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
            <Link to="/settings" aria-label="Settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <SettingsIcon aria-hidden="true" className="w-4.5 h-4.5 text-muted-foreground/60" />
            </Link>
          </div>
        </motion.div>
      </header>

      {/* Persistent trial / upgrade strip */}
      {isInTrial && (
        <button
          onClick={function() { if (trialDaysLeft <= 2) { setShowProModal(true); } else { navigate("/upgrade"); } }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl w-full text-left transition-colors",
            trialDaysLeft <= 2 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-primary/8"
          )}
        >
          <Sparkles className={cn("w-3.5 h-3.5 shrink-0", trialDaysLeft <= 2 ? "text-orange-500" : "text-primary")} />
          <span className={cn("text-xs font-medium flex-1", trialDaysLeft <= 2 ? "text-orange-700 dark:text-orange-400" : "text-foreground")}>
            {trialDaysLeft <= 1 ? "Trial ends tomorrow \u2014 subscribe to keep Pro" : trialDaysLeft === 2 ? "Last 2 days of trial" : `Pro trial \u00B7 ${trialDaysLeft} days left`}
          </span>
          <span className={cn("text-xs font-medium", trialDaysLeft <= 2 ? "text-orange-600 dark:text-orange-400" : "text-primary")}>Subscribe &rarr;</span>
        </button>
      )}
      {!isPro && !isInTrial && profile?.trialExpiresAt && (
        <button
          onClick={function() { setShowProModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl w-full text-left bg-primary/8 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground flex-1">Upgrade to Pro</span>
          <span className="text-xs font-medium text-primary">See plans &rarr;</span>
        </button>
      )}

      {/* First-time coach marks */}
      {showCoachMarks && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
          className="p-4 rounded-2xl bg-card border border-primary/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">Welcome to Tropos!</p>
            <button onClick={dismissCoachMarks} aria-label="Dismiss welcome message" className="p-1 rounded-lg hover:bg-muted"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Dumbbell className="w-4 h-4 text-primary shrink-0" />
              <span>Tap <strong className="text-foreground">Programme</strong> to start a workout</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Footprints className="w-4 h-4 shrink-0" style={{ color: THEME.running }} />
              <span>Tap <strong className="text-foreground">Log</strong> to track runs and meals</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <span>Check <strong className="text-foreground">History</strong> to view your progress</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Streak at-risk nudge — show when streak > 2 and nothing logged today */}
      {streak >= 3 && !weeklyDayMap.get(format(new Date(), "yyyy-MM-dd"))?.workouts && !weeklyDayMap.get(format(new Date(), "yyyy-MM-dd"))?.meals && dailyCal === 0 && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
          className="flex items-center gap-3 p-3 rounded-xl border"
          style={{ background: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.2)" }}>
          <Flame className="w-5 h-5 text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-500">{streak}-day streak at risk</p>
            <p className="text-xs text-muted-foreground">Log a workout, run or meal to keep it alive.</p>
          </div>
        </motion.div>
      )}

      <motion.div ref={weekStripRef} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="space-y-3">
        <WeekStrip dayMap={weeklyDayMap} schedule={schedule} selectedDate={peekDate} onDayTap={handleDayTap} />
        {/* One-shot discoverability hint. Latches off on first day-tap
            so users who already know don't keep seeing it. */}
        {showDayTapHint && !peekDate && (
          <p className="text-[10px] text-muted-foreground/70 text-center -mt-1">
            Tap a day to see details
          </p>
        )}
        <AnimatePresence>
          {peekDate && <DayPeekCard dateKey={peekDate} schedule={schedule} workouts={peekW} dailyTotals={peekT} onClose={function() { setPeekDate(null); }} />}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <HealthScoreCard healthScore={healthScore} prevHealthScore={prevHealthScore} />
      </motion.div>

      {/* Today's Energy promoted above the CTA stack — calorie/macro tracking
          is the primary daily answer this page has to give, and buried at the
          bottom of the scroll it was below the fold on first load. Now lives
          directly under the Health Score card so it's always visible in the
          first paint. */}
      <section aria-label="Today's energy">
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
          <SectionErrorBoundary sectionName="today-intake">
            <TodayEnergy calories={dailyCal} protein={dailyProt} carbs={dailyCarbs} fat={dailyFat} burn={dailyBurn} targets={effectiveTargets} totalLifetimeMeals={totalLifetimeMeals} daysSinceLastMeal={daysSinceLastMeal} mealsLoading={mealsLoading} postWorkoutNudge={postWorkoutNudge} nutritionInsight={topNutritionInsight} />
          </SectionErrorBoundary>
        </motion.div>
      </section>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        {programLoading ? <div className="h-20 rounded-2xl bg-muted animate-pulse" /> : (
          <StackedCTACards nextWorkout={nextWorkout} todayType={todayType} navigate={function(p: string) { closePeek(); navigate(p); }}
            waterGlasses={waterGlasses} waterTarget={waterTarget} onAddWater={function() { closePeek(); logWater(1); }} onRemoveWater={function() { setWaterAmount(waterGlasses - 1); }}
            lastWeight={lastWeightInfo?.weight || null}
            weightUnit={weightUnit} onLogWeight={function() { closePeek(); setWeightInput(lastWeightInfo?.weight || ""); setShowWeightSheet(true); }} lastWeightDate={weightRelativeTime} todayRun={todayRun} userSegment={userSegment} muscleGroups={muscleGroups} />
        )}
      </motion.div>

      {showInsightStrip && perfWeek?.insight && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
          <SectionErrorBoundary sectionName="insight-strip">
            <InsightStrip title={perfWeek.insight.title} bullet={perfWeek.insight.bullets[0] || ""} loadBand={perfLoadBand} />
          </SectionErrorBoundary>
        </motion.div>
      )}

      {/* Weight Log Bottom Sheet */}
      <AnimatePresence>
        {showWeightSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={function() { if (!weightSaved) { setShowWeightSheet(false); } }} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div ref={weightSheetRef} role="dialog" aria-modal="true" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50">
              <div className="max-w-md mx-auto p-4 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-foreground">Log Weight</p>
                  <button onClick={function() { setShowWeightSheet(false); }} aria-label="Close weight log" className="p-2 -m-1 rounded-lg hover:bg-muted touch-target"><X aria-hidden="true" className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                {lastWeightInfo && (
                  <p className="text-micro" style={{ color: THEME.text.muted }}>
                    Last: {lastWeightInfo.weight} {weightUnit === "lbs" ? "lb" : weightUnit}{lastWeightInfo.rawDate ? " \u00b7 " + weightRelativeTime.replace("Logged ", "") : ""}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={function() { haptic(); adjustWeight(-0.1); }} aria-label="Decrease by 0.1" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border border-border/50 active:scale-95 transition-transform">
                    <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={weightInput} onChange={function(e) { setWeightInput(e.target.value); }} onFocus={function(e) { e.target.select(); }} placeholder={"Weight in " + weightUnit} aria-label={"Body weight in " + weightUnit} className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-xl font-bold font-mono tabular-nums text-center" />
                  <button onClick={function() { haptic(); adjustWeight(0.1); }} aria-label="Increase by 0.1" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border border-border/50 active:scale-95 transition-transform">
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                <motion.button onClick={handleLogWeight} disabled={!weightInput || weightSaving || weightSaved} aria-label="Save weight" className={cn("w-full py-3.5 rounded-xl font-semibold text-base transition-all", !weightInput || weightSaving ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed" : "text-white")} style={weightInput && !weightSaving ? { backgroundColor: THEME.brand } : undefined}>
                  <AnimatePresence mode="wait">
                    {weightSaved ? (
                      <motion.span key="saved" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-2">
                        <Check className="w-5 h-5" /> Saved!
                      </motion.span>
                    ) : (
                      <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

      <BadgeEarnedModal badge={newBadge} onDismiss={dismissNewBadge} />

      {/* Trial expired — one-time prompt */}
      <AnimatePresence>
        {showTrialExpiredModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={function() { setShowTrialExpiredModal(false); updateProfile({ trialExpiryPromptShown: true }); }} />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-2xl bg-card p-6 space-y-4 shadow-xl border border-border/50"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <p className="text-base font-semibold text-foreground">Your free trial has ended</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Your 7-day trial is over. Subscribe to keep AI photo logging, adaptive macros, and performance insights.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={function() { setShowTrialExpiredModal(false); updateProfile({ trialExpiryPromptShown: true }); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Maybe later
                </button>
                <button
                  onClick={function() { setShowTrialExpiredModal(false); updateProfile({ trialExpiryPromptShown: true }); navigate("/upgrade"); }}
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
            <ProModal onClose={function() { setShowProModal(false); }} />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
