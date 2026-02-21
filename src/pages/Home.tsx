import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { useWorkouts } from "@/hooks/useWorkouts";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import { StreakCounter } from "@/components/StreakCounter";
import BodyweightLogger from "@/components/BodyweightLogger";
import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles, Dumbbell, Flame, Beef, Wheat, Droplet } from "lucide-react";
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

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();
  const { workouts } = useWorkouts();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const { programState } = useProgram();

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [confettiFired, setConfettiFired] = useState(false);

  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

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

  // Safe number helper (for perfect consistency with Log page)
  const safeNum = (value: any): number => {
    const num = Number(value);
    return isNaN(num) || value == null ? 0 : num;
  };

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    (async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const mealsRef = collection(db, "users", uid, "meals");
        const q = query(
          mealsRef,
          where("createdAt", ">=", Timestamp.fromDate(todayStart))
        );

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
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading your profile...
      </div>
    );
  }

  const nextWorkout = programState?.workouts.find((d) => !d.completed);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"}
        </h1>
        <p className="text-xs text-muted-foreground">Let's put in work today.</p>
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
            <p className="text-xs text-muted-foreground">
              Full access to all features.
            </p>
          </div>
        </motion.div>
      )}

      {/* Streak */}
      <StreakCounter streak={computedStreak} />

      {/* Next Workout — strength-first */}
      {nextWorkout && (
        <Link to="/program">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/50 p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Next: {nextWorkout.dayName}</p>
              <span className="ml-auto text-[10px] text-muted-foreground capitalize">
                {nextWorkout.dayType}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {nextWorkout.exercises.slice(0, 4).map((ex, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
                >
                  {ex.name}
                </span>
              ))}
              {nextWorkout.exercises.length > 4 && (
                <span className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                  +{nextWorkout.exercises.length - 4} more
                </span>
              )}
            </div>
          </motion.div>
        </Link>
      )}

      {/* Bodyweight Logger */}
      <BodyweightLogger />

      {/* Today's Intake - gradient cards with icons */}
      <div className="bg-card rounded-2xl border border-border/50 p-5">
        <p className="text-sm font-medium text-foreground mb-4">Today's Intake</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          {/* Calories */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-950/60 rounded-xl p-3 shadow-sm border border-orange-100/60 dark:border-orange-900/40">
            <Flame className="w-6 h-6 mx-auto mb-2 text-orange-500 dark:text-orange-400" />
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {safeNum(dailyTotals.calories)}
            </p>
            <p className="text-xs text-orange-500 dark:text-orange-400/80">cal</p>
          </div>

          {/* Protein */}
          <div className="bg-gradient-to-br from-blue-50 to-sky-100 dark:from-blue-950 dark:to-sky-950/60 rounded-xl p-3 shadow-sm border border-blue-100/60 dark:border-blue-900/40">
            <Beef className="w-6 h-6 mx-auto mb-2 text-blue-500 dark:text-blue-400" />
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {safeNum(dailyTotals.protein)}g
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400/80">protein</p>
          </div>

          {/* Carbs */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-100 dark:from-amber-950 dark:to-yellow-950/60 rounded-xl p-3 shadow-sm border border-amber-100/60 dark:border-amber-900/40">
            <Wheat className="w-6 h-6 mx-auto mb-2 text-amber-500 dark:text-amber-400" />
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {safeNum(dailyTotals.carbs)}g
            </p>
            <p className="text-xs text-amber-500 dark:text-amber-400/80">carbs</p>
          </div>

          {/* Fat */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950 dark:to-violet-950/60 rounded-xl p-3 shadow-sm border border-purple-100/60 dark:border-purple-900/40">
            <Droplet className="w-6 h-6 mx-auto mb-2 text-purple-500 dark:text-purple-400" />
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {safeNum(dailyTotals.fat)}g
            </p>
            <p className="text-xs text-purple-500 dark:text-purple-400/80">fat</p>
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
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
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
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro — from just £2.99/mo
          </p>
        </motion.div>
      )}
    </div>
  );
}
