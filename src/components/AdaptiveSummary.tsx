// Home.tsx
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
import {
  Sparkles,
  Dumbbell,
  Flame,
  Beef,
  Wheat,
  Cookie,
  ChevronRight,
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

  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [confettiFired, setConfettiFired] = useState(false);

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
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
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
            <p className="text-xs text-muted-foreground">Full access to all features.</p>
          </div>
        </motion.div>
      )}

      {/* Streak */}
      <div className="space-y-2">
        <StreakCounter streak={computedStreak} />

        {/* Today status line */}
        <div className="text-[11px] text-muted-foreground">
          {safeNum(weeklyStats.workoutsDone)}/{safeNum(weeklyStats.workoutsTarget, 4)} workouts this week{" "}
          <span className="px-1">•</span>{" "}
          {todayMealsCount} meal{todayMealsCount === 1 ? "" : "s"} logged today
        </div>
      </div>

      {/* Next Workout */}
      {nextWorkout && (
        <Link to="/program">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "bg-card rounded-xl border border-border/50 p-4 space-y-2",
              "transition-transform active:scale-[0.99]"
            )}
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Next: {nextWorkout.dayName}</p>

              {/* Right side: dayType + subtle affordance */}
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

        <div className="grid grid-cols-4 gap-3 text-center">
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ backgroundColor: tint(macroColors.calories), color: macroColors.calories }}
          >
            <Flame className="w-6 h-6 mx-auto mb-2" />
            <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
              {safeNum(dailyTotals.calories)}
            </p>
            <p className="text-xs mt-1">cal</p>
          </div>

          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ backgroundColor: tint(macroColors.protein), color: macroColors.protein }}
          >
            <Beef className="w-6 h-6 mx-auto mb-2" />
            <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
              {safeNum(dailyTotals.protein)}g
            </p>
            <p className="text-xs mt-1">protein</p>
          </div>

          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ backgroundColor: tint(macroColors.carbs), color: macroColors.carbs }}
          >
            <Wheat className="w-6 h-6 mx-auto mb-2" />
            <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
              {safeNum(dailyTotals.carbs)}g
            </p>
            <p className="text-xs mt-1">carbs</p>
          </div>

          <div
            className="rounded-xl p-4 shadow-sm"
            style={{ backgroundColor: tint(macroColors.fat), color: macroColors.fat }}
          >
            <Cookie size={22} className="mx-auto mb-2" />
            <p className="text-2xl font-bold tabular-nums leading-none whitespace-nowrap">
              {safeNum(dailyTotals.fat)}g
            </p>
            <p className="text-xs mt-1">fat</p>
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
    </div>
  );
}

// AdaptiveSummary.tsx
import { useState, type ReactNode } from "react";
import {
  Trophy,
  Target,
  Flame,
  Zap,
  TrendingUp,
  TrendingDown,
  Lock,
  ChevronDown,
  Beef,
  Wheat,
  Cookie,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSubscription, pricing } from "@/lib/subscription";
import { toast } from "sonner";

/* ================================
   PHASE MODE CONFIG
================================ */

type PhaseMode = "lean bulk" | "cut" | "recomp" | "strength peak";

const phaseConfig: Record<
  PhaseMode,
  {
    calorieMultiplier: number;
    proteinRatio: number;
    fatRatio: number;
    plateauSensitivity: number;
  }
> = {
  "lean bulk": {
    calorieMultiplier: 1.1,
    proteinRatio: 2.2,
    fatRatio: 0.25,
    plateauSensitivity: 1,
  },
  cut: {
    calorieMultiplier: 0.85,
    proteinRatio: 2.4,
    fatRatio: 0.3,
    plateauSensitivity: 0.8,
  },
  recomp: {
    calorieMultiplier: 1,
    proteinRatio: 2.3,
    fatRatio: 0.25,
    plateauSensitivity: 1.2,
  },
  "strength peak": {
    calorieMultiplier: 1.15,
    proteinRatio: 2.2,
    fatRatio: 0.25,
    plateauSensitivity: 1.5,
  },
};

/* ================================
   SAFE NUMBER HELPER
================================ */

function safeNum(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  return fallback;
}

/* ================================
   PLATEAU DETECTION ENGINE
================================ */

interface PlateauResult {
  status: "progressing" | "stalling" | "regressing" | "weight_only";
  message: string;
  calorieAdjust: number;
  volumeAdjust: number;
  macroNote: string;
}

function detectPlateau(
  avgLiftChange: number,
  avgWeightChange: number,
  sensitivity: number
): PlateauResult {
  const threshold = 0.1 * sensitivity;

  if (avgLiftChange < -threshold) {
    return {
      status: "regressing",
      message: "Strength declining. Consider a deload week or reduce volume by 10%.",
      calorieAdjust: 100,
      volumeAdjust: -0.1,
      macroNote: "Increase carbs slightly to support recovery.",
    };
  }

  if (Math.abs(avgLiftChange) < threshold && Math.abs(avgWeightChange) < 0.2) {
    return {
      status: "stalling",
      message: "Performance stagnant. Increase calories by ~150 to break plateau.",
      calorieAdjust: 150,
      volumeAdjust: 0,
      macroNote: "Add 20-30g carbs around training.",
    };
  }

  if (avgWeightChange > 0.4 && avgLiftChange < threshold) {
    return {
      status: "weight_only",
      message: "Weight rising without strength gains. Shift macros toward protein and carbs.",
      calorieAdjust: -100,
      volumeAdjust: 0,
      macroNote: "Reduce fat by 10g, increase protein by 15g.",
    };
  }

  return {
    status: "progressing",
    message: "Progress trending well. Stay consistent with current plan.",
    calorieAdjust: 0,
    volumeAdjust: 0,
    macroNote: "No changes needed.",
  };
}

/* ================================
   AI MACRO ADJUSTMENT ENGINE
================================ */

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function calculateAdaptiveMacros(
  bodyweight: number,
  avgLiftChange: number,
  avgWeightChange: number,
  phase: PhaseMode
): MacroTargets {
  const config = phaseConfig[phase];
  const bw = safeNum(bodyweight, 70);

  let baseCalories = bw * 33;

  if (avgLiftChange <= 0 && avgWeightChange <= 0) {
    baseCalories += 150;
  }
  if (avgWeightChange > 0.5 && avgLiftChange <= 0) {
    baseCalories -= 100;
  }

  const adjustedCalories = Math.round(baseCalories * config.calorieMultiplier);
  const protein = Math.round(bw * config.proteinRatio);
  const fats = Math.round((adjustedCalories * config.fatRatio) / 9);
  const carbs = Math.round((adjustedCalories - protein * 4 - fats * 9) / 4);

  return {
    calories: adjustedCalories,
    protein,
    carbs: Math.max(carbs, 50),
    fat: fats,
  };
}

/* ================================
   BADGE SYSTEM
================================ */

function getBadgeInfo(
  newPR: boolean,
  workoutsDone: number,
  workoutsTarget: number,
  mealsDone: number,
  mealsTarget: number
) {
  if (newPR) {
    return {
      badge: "PR Crusher",
      icon: Trophy,
      motivational: "New personal best! Small wins, huge gains.",
    };
  }
  if (workoutsDone >= workoutsTarget && mealsDone >= mealsTarget) {
    return {
      badge: "Consistency Champ",
      icon: Target,
      motivational: "Consistency compounds faster than motivation!",
    };
  }
  if (workoutsDone >= workoutsTarget) {
    return {
      badge: "Iron Regular",
      icon: Target,
      motivational: "All workouts done. Keep the nutrition tight!",
    };
  }
  if (mealsDone >= mealsTarget) {
    return {
      badge: "Protein Hero",
      icon: Flame,
      motivational: "Nutrition goals hit. Muscle growth is on track!",
    };
  }
  return {
    badge: "Weekly Warrior",
    icon: Zap,
    motivational: "Keep going! Progress is built one session at a time.",
  };
}

/* ================================
   PERCENTILE
================================ */

function calculatePercentile(
  workoutsDone: number,
  workoutsTarget: number,
  mealsDone: number,
  mealsTarget: number,
  newPR: boolean
) {
  const workoutScore = Math.min(workoutsDone / Math.max(workoutsTarget, 1), 1) * 50;
  const mealScore = Math.min(mealsDone / Math.max(mealsTarget, 1), 1) * 30;
  const PRScore = newPR ? 20 : 0;
  const performanceScore = workoutScore + mealScore + PRScore;

  if (performanceScore >= 95) return 5;
  if (performanceScore >= 85) return 10;
  if (performanceScore >= 70) return 25;
  if (performanceScore >= 50) return 50;
  return 75;
}

/* ================================
   TINT HELPER
================================ */

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

/* ================================
   PROGRESS BAR
================================ */

function ProgressBar({
  done,
  target,
  label,
  trackColor,
}: {
  done: number;
  target: number;
  label: string;
  trackColor: string;
}) {
  const safeDone = safeNum(done);
  const safeTarget = safeNum(target, 1);
  const ratio = Math.min(safeDone / Math.max(safeTarget, 1), 1);
  const pct = Math.round(ratio * 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {safeDone}/{safeTarget}
        </span>
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-primary rounded-full"
        />
      </div>
    </div>
  );
}

/* ================================
   MAIN COMPONENT
================================ */

interface AdaptiveSummaryProps {
  athleteType?: string;
  mode?: "weekly" | "monthly";
  weightKg?: number;
  heightCm?: number;
  weeklyWorkoutsDone?: number;
  weeklyWorkoutsTarget?: number;
  weeklyMealsDone?: number;
  weeklyMealsTarget?: number;
  weeklyPR?: boolean;
  weeklyBodyweightTrend?: number[];
  monthlyWorkoutsDone?: number;
  monthlyWorkoutsTarget?: number;
  monthlyMealsDone?: number;
  monthlyMealsTarget?: number;
  monthlyPR?: boolean;
  monthlyBodyweightTrend?: number[];
}

export function AdaptiveSummary({
  athleteType = "Lifter",
  mode = "weekly",
  weightKg = 70,
  weeklyWorkoutsDone = 0,
  weeklyWorkoutsTarget = 4,
  weeklyMealsDone = 0,
  weeklyMealsTarget = 10,
  weeklyPR = false,
  weeklyBodyweightTrend = [],
  monthlyWorkoutsDone = 0,
  monthlyWorkoutsTarget = 16,
  monthlyMealsDone = 0,
  monthlyMealsTarget = 40,
  monthlyPR = false,
  monthlyBodyweightTrend = [],
}: AdaptiveSummaryProps) {
  const { isPro } = useSubscription();

  const [phase, setPhase] = useState<PhaseMode>("recomp");
  const [calorieBoost, setCalorieBoost] = useState(0);

  const workoutsDone = safeNum(mode === "weekly" ? weeklyWorkoutsDone : monthlyWorkoutsDone);
  const workoutsTarget = safeNum(
    mode === "weekly" ? weeklyWorkoutsTarget : monthlyWorkoutsTarget,
    4
  );
  const mealsDone = safeNum(mode === "weekly" ? weeklyMealsDone : monthlyMealsDone);
  const mealsTarget = safeNum(mode === "weekly" ? weeklyMealsTarget : monthlyMealsTarget, 10);
  const newPR = mode === "weekly" ? weeklyPR : monthlyPR;
  const bodyweightTrend =
    (mode === "weekly" ? weeklyBodyweightTrend : monthlyBodyweightTrend) || [];

  const badgeInfo = getBadgeInfo(newPR, workoutsDone, workoutsTarget, mealsDone, mealsTarget);
  const BadgeIcon = badgeInfo.icon;
  const percentile = calculatePercentile(workoutsDone, workoutsTarget, mealsDone, mealsTarget, newPR);

  const recentWeights = bodyweightTrend
    .slice(-3)
    .filter((v) => typeof v === "number" && !isNaN(v));
  const avgWeightChange =
    recentWeights.length > 0
      ? recentWeights.reduce((a, b) => a + b, 0) / recentWeights.length
      : 0;

  const avgLiftChange = newPR ? 1 : 0;

  const config = phaseConfig[phase];
  const plateau = detectPlateau(avgLiftChange, avgWeightChange, config.plateauSensitivity);
  const macros = calculateAdaptiveMacros(safeNum(weightKg, 70), avgLiftChange, avgWeightChange, phase);

  const displayMacros = { ...macros, calories: macros.calories + calorieBoost };

  const weightTrending =
    avgWeightChange > 0.1 ? "up" : avgWeightChange < -0.1 ? "down" : "stable";

  let athleteLabel = athleteType;
  if (badgeInfo.badge === "PR Crusher") athleteLabel += " PR Crushers";
  else if (badgeInfo.badge === "Consistency Champ") athleteLabel += " Champions";
  else if (badgeInfo.badge === "Protein Hero") athleteLabel += " Nutrition Heroes";
  else athleteLabel += " Warriors";

  const showApplyButton = isPro && plateau.calorieAdjust !== 0;

  const macroColors = {
    calories: "#f97316",
    protein: "#3b82f6",
    carbs: "#f59e0b",
    fat: "#a855f6",
  };

  // Subtle premium track tint (so it doesn't read grey/heavy)
  const progressTrack = tint("#7c3aed", 0.92);

  function MacroCard({
    icon,
    value,
    label,
    color,
  }: {
    icon: ReactNode;
    value: string | number;
    label: string;
    color: string;
  }) {
    return (
      <div
        className="rounded-xl p-3.5 shadow-sm border text-center"
        style={{
          backgroundColor: tint(color),
          borderColor: tint(color, 0.72),
          color,
        }}
      >
        <div className="flex items-center justify-center mb-2">{icon}</div>
        <p className="font-bold tabular-nums leading-none text-[22px] sm:text-2xl whitespace-nowrap">
          {value}
        </p>
        <p className="text-[11px] leading-tight mt-1 opacity-90">{label}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border/50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 bg-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BadgeIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {athleteType} {mode.charAt(0).toUpperCase() + mode.slice(1)} Summary
            </h3>
            <p className="text-sm text-muted-foreground">{badgeInfo.badge}</p>
          </div>
          {weightTrending !== "stable" && (
            <div className="flex items-center gap-1 text-xs">
              {weightTrending === "up" ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span className={weightTrending === "up" ? "text-green-500" : "text-blue-500"}>
                {avgWeightChange > 0 ? "+" : ""}
                {safeNum(avgWeightChange).toFixed(1)}kg
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Progress Bars */}
        <div className="space-y-3">
          <ProgressBar
            done={workoutsDone}
            target={workoutsTarget}
            label="Workouts"
            trackColor={progressTrack}
          />
          <ProgressBar
            done={mealsDone}
            target={mealsTarget}
            label="Protein meals"
            trackColor={progressTrack}
          />
        </div>

        {/* Badge/Motivation */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-muted-foreground">{badgeInfo.motivational}</p>
        </div>

        {/* PRO GATE */}
        {!isPro && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center space-y-3">
            <Lock className="mx-auto w-5 h-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Unlock Performance Engine</p>
            <p className="text-xs text-muted-foreground">
              AI macro adjustments, plateau detection, phase modes, and performance insights.
            </p>
            <p className="text-xs font-semibold text-foreground">
              £{pricing.monthly}/month or £{pricing.yearly}/year
            </p>
          </div>
        )}

        {/* PRO: Phase Selector + AI Engine */}
        {isPro && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Training Phase</p>
              <div className="relative">
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as PhaseMode)}
                  className="appearance-none text-xs px-3 py-1.5 pr-7 rounded-lg border border-border bg-muted text-foreground"
                >
                  <option value="lean bulk">Lean Bulk</option>
                  <option value="cut">Cut</option>
                  <option value="recomp">Recomp</option>
                  <option value="strength peak">Strength Peak</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm">
              <p className="text-sm font-medium text-foreground">Performance Insight</p>
              <p className="text-xs text-muted-foreground mt-1">{plateau.message}</p>
              {plateau.macroNote !== "No changes needed." && (
                <p className="text-xs text-muted-foreground mt-1 italic">{plateau.macroNote}</p>
              )}

              {showApplyButton && (
                <button
                  onClick={() => {
                    setCalorieBoost((prev) => prev + plateau.calorieAdjust);
                    toast.success(
                      `Suggestion applied! +${plateau.calorieAdjust} cal added to targets. ${plateau.macroNote}`
                    );
                  }}
                  className="mt-3 w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 active:bg-primary/95 transition-all shadow-sm"
                >
                  Apply Suggestion (+{plateau.calorieAdjust} cal)
                </button>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-4">AI Macro Targets</p>
              <div className="grid grid-cols-4 gap-3">
                <MacroCard
                  color={macroColors.calories}
                  icon={<Flame className="w-6 h-6" />}
                  value={displayMacros.calories}
                  label="cal"
                />
                <MacroCard
                  color={macroColors.protein}
                  icon={<Beef className="w-6 h-6" />}
                  value={`${displayMacros.protein}g`}
                  label="protein"
                />
                <MacroCard
                  color={macroColors.carbs}
                  icon={<Wheat className="w-6 h-6" />}
                  value={`${displayMacros.carbs}g`}
                  label="carbs"
                />
                <MacroCard
                  color={macroColors.fat}
                  icon={<Cookie className="w-6 h-6" />}
                  value={`${displayMacros.fat}g`}
                  label="fat"
                />
              </div>
            </div>
          </>
        )}

        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            You're in the top{" "}
            <span className="font-semibold text-foreground">{percentile}%</span>{" "}
            of {athleteLabel} this {mode}
          </p>
        </div>
      </div>
    </motion.div>
  );
}