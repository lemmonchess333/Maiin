import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useWeeklyStats, useMonthlyStats } from "@/hooks/useFirestore";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import { StreakCounter } from "@/components/StreakCounter";
import BodyweightLogger from "@/components/BodyweightLogger";
import { useSubscription } from "@/lib/subscription";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles } from "lucide-react";

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

export default function Home() {
  const { user, profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const bodyweightTrend = useBodyweightTrend();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [confettiFired, setConfettiFired] = useState(false);

  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  const quote = useMemo(() => getDailyQuote(), []);

  // Fetch today's meal totals
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

  // Fire confetti on PR
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

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your {mode} summary
        </p>
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
              Pro Trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}{" "}
              left
            </p>
            <p className="text-xs text-muted-foreground">
              Full access to all features. Upgrade to keep it!
            </p>
          </div>
        </motion.div>
      )}

      {/* Streak counter */}
      <StreakCounter streak={profile.currentStreak || 0} />

      {/* Mode Toggle */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["weekly", "monthly"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Today's Intake */}
      <div className="bg-card rounded-xl border border-border/50 p-4">
        <p className="text-sm font-medium text-foreground mb-3">Today's Intake</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2">
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{dailyTotals.calories}</p>
            <p className="text-xs text-orange-500">cal</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{dailyTotals.protein}g</p>
            <p className="text-xs text-blue-500">protein</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{dailyTotals.carbs}g</p>
            <p className="text-xs text-amber-500">carbs</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2">
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{dailyTotals.fat}g</p>
            <p className="text-xs text-purple-500">fat</p>
          </div>
        </div>
      </div>

      {/* Adaptive Summary */}
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

      {/* Bodyweight Logger */}
      <BodyweightLogger />

      {/* Motivational quote */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-4 rounded-xl bg-primary/5 border border-primary/10"
      >
        <p className="text-sm text-foreground font-medium">Daily Motivation</p>
        <p className="text-xs text-muted-foreground mt-1 italic">"{quote}"</p>
      </motion.div>

      {/* Pro upsell if not pro */}
      {!isPro && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="p-4 rounded-xl bg-card border border-border/50 text-center space-y-2"
        >
          <p className="text-sm font-medium text-foreground">
            Unlock AI Photo Logging & Performance Engine
          </p>
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro for full access — from just £2.99/mo
          </p>
        </motion.div>
      )}
    </div>
  );
}
