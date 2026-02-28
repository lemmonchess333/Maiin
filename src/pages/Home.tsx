import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats, useWeeklyDayMap } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { useWorkouts } from "@/hooks/useWorkouts";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import { StreakCounter } from "@/components/StreakCounter";
import BodyweightLogger from "@/components/BodyweightLogger";
import { WeeklyDayFill } from "@/components/WeeklyDayFill";
import { useSubscription } from "@/lib/subscription";
import { calculateAdaptiveTDEE } from "@/lib/adaptiveTDEE";
import { useProgram } from "@/features/program/useProgram";
import RunDashboard from "@/components/run/RunDashboard";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Sparkles,
  Dumbbell,
  Flame,
  Beef,
  Wheat,
  Cookie,
  ChevronRight,
  Zap,
  Settings as SettingsIcon,
} from "lucide-react";
import { format } from "date-fns";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type DailyTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const MOTIVATIONAL_QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Consistency beats intensity. Show up today.",
  "You don't have to be extreme, just consistent.",
  "Small daily improvements lead to stunning results.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Discipline is choosing between what you want now and what you want most.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Success isn't always about greatness. It's about consistency.",
];

function getDailyQuote(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

function computeStreak(workoutDates: string[]): number {
  if (workoutDates.length === 0) return 0;

  const uniqueDates = [...new Set(workoutDates)].sort().reverse();
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) streak++;
    else break;
  }

  return streak;
}

// Simple tint helper (lightens the hex color)
function tint(hex: string, factor: number = 0.85): string {
  if (!hex || !hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
  const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
  const newB = Math.min(255, Math.floor(b + (255 - b) * factor));

  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();
  const { workouts } = useWorkouts();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const { programState } = useProgram();
  const weeklyDayMap = useWeeklyDayMap();

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [homeMode, setHomeMode] = useState<"lift" | "run">("lift");
  const [confettiFired, setConfettiFired] = useState(false);

  // Adaptive TDEE computation for Pro users
  const tdeeResult = useMemo(() => {
    if (!isPro || !profile) return null;
    // Build weight logs from bodyweight trend
    const weightLogs = (bodyweightTrend.monthly ?? []).map((entry: any) => ({
      date: entry.date ?? "",
      weight: entry.weight ?? entry.value ?? 0,
    })).filter((w: any) => w.weight > 0);

    // Build calorie logs from daily totals (we only have today's, so skip if insufficient)
    // For a real implementation this would come from a Firestore query of recent meals
    // For now, show the card if we have enough weight data
    if (weightLogs.length < 4) return null;

    const currentTargets = {
      calories: profile.targetCalories ?? 2200,
      protein: profile.targetProtein ?? 160,
      carbs: profile.targetCarbs ?? 250,
      fat: profile.targetFat ?? 60,
    };

    // Simple calorie logs from today as seed (in production, fetch last 14 days)
    const calorieLogs = weightLogs.map((w: any) => ({
      date: w.date,
      calories: currentTargets.calories, // approximate
    }));

    return calculateAdaptiveTDEE(
      weightLogs,
      calorieLogs,
      profile.goal ?? "recomp",
      currentTargets,
      profile.weightKg ?? 70,
    );
  }, [isPro, profile, bodyweightTrend.monthly]);

  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  const [todayMealsCount, setTodayMealsCount] = useState(0);

  const quote = useMemo(() => getDailyQuote(), []);

  const computedStreak = useMemo(() => {
    const dates = workouts.map((w) => w.date);
    return computeStreak(dates);
  }, [workouts]);

  useEffect(() => {
    if (profile && computedStreak !== profile.currentStreak) {
      updateProfile({ currentStreak: computedStreak });
    }
  }, [computedStreak, profile, updateProfile]);

  // Safe number helper (NOW supports fallback)
  const safeNum = (value: any, fallback: number = 0): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? fallback : num;
  };

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    (async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const mealsRef = collection(db, "users", uid, "meals");
        const q = query(mealsRef, where("createdAt", ">=", Timestamp.fromDate(todayStart)));

        const snapshot = await getDocs(q);

        const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          totals.calories += data.totalCalories || data.calories || 0;
          totals.protein += data.totalProtein || data.protein || 0;
          totals.carbs += data.totalCarbs || data.carbs || 0;
          totals.fat += data.totalFat || data.fat || 0;
        });

        setDailyTotals(totals);
        setTodayMealsCount(snapshot.size);
      } catch (error) {
        console.error("Error fetching today's meals:", error);
      }
    })();
  }, [user]);

  useEffect(() => {
    if ((weeklyStats.hasPR || monthlyStats.hasPR) && !confettiFired) {
      setConfettiFired(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#7c3aed", "#a78bfa", "#c4b5fd", "#fbbf24"],
      });
    }
  }, [weeklyStats.hasPR, monthlyStats.hasPR, confettiFired]);

  if (!profile) {
    return <div className="p-8 text-center text-muted-foreground">Loading your profile...</div>;
  }

  const nextWorkout = programState?.workouts.find((d) => !d.completed);

  const macroColors = {
    calories: "#f97316",
    protein: "#3b82f6",
    carbs: "#f59e0b",
    fat: "#a855f6",
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {/* Header with Settings gear + Lift/Run toggle */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Hey, {profile.displayName || "Athlete"}
            </h1>
            <p className="text-xs text-muted-foreground">Let's put in work today.</p>
          </div>
          <Link to="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <SettingsIcon className="w-5 h-5 text-muted-foreground" />
          </Link>
        </div>

        {/* Lift / Run segmented control */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["lift", "run"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setHomeMode(m)}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                "active:scale-[0.99] transition-transform",
                homeMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "lift" ? "Lift" : "Run"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Trial banner */}
      {isInTrial && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10"
        >
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Pro Trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left
            </p>
            <p className="text-xs text-muted-foreground">Full access to all features.</p>
          </div>
        </motion.div>
      )}

      {/* Run mode dashboard */}
      {homeMode === "run" && <RunDashboard />}

      {/* Lift mode dashboard */}
      {homeMode === "lift" && (
        <>
          {/* Streak */}
          <div className="space-y-3">
            <StreakCounter streak={computedStreak} />
            <div className="text-[11px] text-muted-foreground">
              {safeNum(weeklyStats.workoutsDone)}/{safeNum(weeklyStats.workoutsTarget, 4)} workouts this week{" "}
              <span className="px-1">•</span>{" "}
              {todayMealsCount} meal{todayMealsCount === 1 ? "" : "s"} logged today
            </div>
          </div>

          {/* Weekly Day Fill Summary */}
          <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">This Week</p>
            <WeeklyDayFill dayMap={weeklyDayMap} workoutsTarget={safeNum(weeklyStats.workoutsTarget, 4)} />
          </div>

          {/* Adaptive TDEE Card (Pro) */}
          {tdeeResult && tdeeResult.confidence !== "low" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl border border-border/50 p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-medium text-foreground">Adaptive TDEE</p>
                <span className={cn(
                  "ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full",
                  tdeeResult.confidence === "high"
                    ? "bg-green-100 text-green-600"
                    : "bg-yellow-100 text-yellow-600"
                )}>
                  {tdeeResult.confidence} confidence
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{tdeeResult.estimatedTDEE}</p>
                  <p className="text-[10px] text-muted-foreground">Est. TDEE</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-primary">{tdeeResult.adjustedCalories}</p>
                  <p className="text-[10px] text-muted-foreground">Target cal</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Weekly weight change: <span className={cn(
                  "font-medium",
                  tdeeResult.weeklyWeightChange > 0 ? "text-green-500" : tdeeResult.weeklyWeightChange < 0 ? "text-red-500" : "text-foreground"
                )}>
                  {tdeeResult.weeklyWeightChange > 0 ? "+" : ""}{tdeeResult.weeklyWeightChange.toFixed(2)}kg
                </span></span>
                <span>Target: {tdeeResult.targetWeightChange > 0 ? "+" : ""}{tdeeResult.targetWeightChange}kg/wk</span>
              </div>

              <div className="flex gap-2 text-[10px]">
                <span className="px-2 py-1 rounded bg-blue-50 text-blue-600 font-medium">P: {tdeeResult.adjustedProtein}g</span>
                <span className="px-2 py-1 rounded bg-amber-50 text-amber-600 font-medium">C: {tdeeResult.adjustedCarbs}g</span>
                <span className="px-2 py-1 rounded bg-purple-50 text-purple-600 font-medium">F: {tdeeResult.adjustedFat}g</span>
              </div>
            </motion.div>
          )}

          {/* Next Workout */}
          {nextWorkout && (
            <Link to="/program">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-card rounded-2xl border border-border/50 p-5 space-y-2",
                  "transition-transform active:scale-[0.99]"
                )}
              >
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Next: {nextWorkout.dayName}</p>

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground capitalize">{nextWorkout.dayType}</span>
                    <span className="text-[10px] text-muted-foreground">Open</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {nextWorkout.exercises.slice(0, 4).map((ex, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded border text-[10px]"
                      style={{
                        backgroundColor: tint("#7c3aed", 0.92),
                        borderColor: tint("#7c3aed", 0.75),
                        color: "#4c1d95",
                      }}
                    >
                      {ex.name}
                    </span>
                  ))}
                  {nextWorkout.exercises.length > 4 && (
                    <span
                      className="px-2 py-0.5 rounded border text-[10px]"
                      style={{
                        backgroundColor: tint("#7c3aed", 0.92),
                        borderColor: tint("#7c3aed", 0.75),
                        color: "#4c1d95",
                      }}
                    >
                      +{nextWorkout.exercises.length - 4} more
                    </span>
                  )}
                </div>
              </motion.div>
            </Link>
          )}

          {/* Bodyweight Logger */}
          <BodyweightLogger />

          {/* Today's Intake */}
          <div className="bg-card rounded-2xl border border-border/50 p-5">
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground">Today's Intake</p>
              <p className="text-[11px] text-muted-foreground mt-1">From meals logged today</p>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center overflow-hidden">
              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{ backgroundColor: tint(macroColors.calories), color: macroColors.calories }}
              >
                <Flame className="w-5 h-5 mx-auto mb-1.5" />
                <p className="text-xl font-bold tabular-nums leading-none truncate">
                  {safeNum(dailyTotals.calories)}
                </p>
                <p className="text-[10px] mt-1">cal</p>
              </div>

              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{ backgroundColor: tint(macroColors.protein), color: macroColors.protein }}
              >
                <Beef className="w-5 h-5 mx-auto mb-1.5" />
                <p className="text-xl font-bold tabular-nums leading-none truncate">
                  {safeNum(dailyTotals.protein)}g
                </p>
                <p className="text-[10px] mt-1">protein</p>
              </div>

              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{ backgroundColor: tint(macroColors.carbs), color: macroColors.carbs }}
              >
                <Wheat className="w-5 h-5 mx-auto mb-1.5" />
                <p className="text-xl font-bold tabular-nums leading-none truncate">
                  {safeNum(dailyTotals.carbs)}g
                </p>
                <p className="text-[10px] mt-1">carbs</p>
              </div>

              <div
                className="min-w-0 rounded-xl p-3 shadow-sm"
                style={{ backgroundColor: tint(macroColors.fat), color: macroColors.fat }}
              >
                <Cookie size={20} className="mx-auto mb-1.5" />
                <p className="text-xl font-bold tabular-nums leading-none truncate">
                  {safeNum(dailyTotals.fat)}g
                </p>
                <p className="text-[10px] mt-1">fat</p>
              </div>
            </div>
          </div>

          {/* Mode Toggle + Adaptive Summary */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(["weekly", "monthly"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  "active:scale-[0.99] transition-transform",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <AdaptiveSummary
            athleteType={profile.athleteType || "Lifter"}
            mode={mode}
            weightKg={profile.weightKg ?? 70}
            weeklyWorkoutsDone={weeklyStats.workoutsDone ?? 0}
            weeklyWorkoutsTarget={weeklyStats.workoutsTarget ?? 4}
            weeklyMealsDone={weeklyStats.mealsDone ?? 0}
            weeklyMealsTarget={weeklyStats.mealsTarget ?? 10}
            weeklyPR={weeklyStats.hasPR ?? false}
            weeklyBodyweightTrend={bodyweightTrend.weekly ?? []}
            monthlyWorkoutsDone={monthlyStats.workoutsDone ?? 0}
            monthlyWorkoutsTarget={monthlyStats.workoutsTarget ?? 16}
            monthlyMealsDone={monthlyStats.mealsDone ?? 0}
            monthlyMealsTarget={monthlyStats.mealsTarget ?? 40}
            monthlyPR={monthlyStats.hasPR ?? false}
            monthlyBodyweightTrend={bodyweightTrend.monthly ?? []}
          />

          {/* Motivational quote */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="p-3 rounded-xl bg-primary/5 border border-primary/10"
          >
            <p className="text-xs text-muted-foreground italic">"{quote}"</p>
          </motion.div>

          {/* Pro upsell */}
          {!isPro && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="p-3 rounded-xl bg-card border border-border/50 text-center space-y-1"
            >
              <p className="text-sm font-medium text-foreground">
                Unlock AI Photo Logging & Performance Engine
              </p>
              <p className="text-xs text-muted-foreground">Upgrade to Pro — from just £2.99/mo</p>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
