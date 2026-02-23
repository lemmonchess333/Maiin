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
import { Sparkles, Dumbbell, Flame, Beef, Wheat, Egg } from "lucide-react";
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
    <div className="space-y-6">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {profile.displayName || "Athlete"}
        </h1>
        <p className="text-xs text-muted-foreground">Let's put in work today.</p>
      </motion.div>

      <StreakCounter streak={computedStreak} />

      {nextWorkout && (
        <Link to="/program">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/50 p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Next: {nextWorkout.dayName}
              </p>
            </div>
          </motion.div>
        </Link>
      )}

      <BodyweightLogger />

      {/* Today's Intake — Clean Tinted Cards */}
      <div className="bg-card rounded-2xl border border-border/50 p-5">
        <p className="text-sm font-medium text-foreground mb-4">Today's Intake</p>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: "rgba(249,115,22,0.12)" }}>
            <Flame className="w-6 h-6 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold text-orange-600">
              {safeNum(dailyTotals.calories)}
            </p>
            <p className="text-xs text-orange-500">cal</p>
          </div>

          <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: "rgba(59,130,246,0.12)" }}>
            <Beef className="w-6 h-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-blue-600">
              {safeNum(dailyTotals.protein)}g
            </p>
            <p className="text-xs text-blue-500">protein</p>
          </div>

          <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
            <Wheat className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600">
              {safeNum(dailyTotals.carbs)}g
            </p>
            <p className="text-xs text-amber-500">carbs</p>
          </div>

          <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: "rgba(168,85,247,0.12)" }}>
            <Egg className="w-6 h-6 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold text-purple-600">
              {safeNum(dailyTotals.fat)}g
            </p>
            <p className="text-xs text-purple-500">fat</p>
          </div>
        </div>
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

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-3 rounded-xl bg-primary/5 border border-primary/10"
      >
        <p className="text-xs text-muted-foreground italic">"{quote}"</p>
      </motion.div>
    </div>
  );
}