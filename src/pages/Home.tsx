import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  useWeeklyStats,
  useMonthlyStats,
  useHistoryData,
} from "@/hooks/useFirestore";
import { AdaptiveSummary } from "@/components/AdaptiveSummary";
import { StreakCounter } from "@/components/StreakCounter";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles } from "lucide-react";

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
  const { profile } = useAuth();
  const weeklyStats = useWeeklyStats();
  const monthlyStats = useMonthlyStats();
  const { data: historyData, loading: historyLoading } = useHistoryData(30);
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [compactMode, setCompactMode] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);

  const quote = useMemo(() => getDailyQuote(), []);

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

  if (!profile || historyLoading) return <HomeSkeleton />;

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

      {/* Controls */}
      <div className="flex gap-2">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["weekly", "monthly"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCompactMode(!compactMode)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
            compactMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Compact
        </button>
      </div>

      {/* Summary Card */}
      <AdaptiveSummary
        athleteType={profile.athleteType}
        mode={mode}
        compactMode={compactMode}
        weightKg={profile.weightKg}
        heightCm={profile.heightCm}
        weeklyWorkoutsDone={weeklyStats.workoutsDone}
        weeklyWorkoutsTarget={weeklyStats.workoutsTarget}
        weeklyMealsDone={weeklyStats.mealsDone}
        weeklyMealsTarget={weeklyStats.mealsTarget}
        weeklyPR={weeklyStats.hasPR}
        monthlyWorkoutsDone={monthlyStats.workoutsDone}
        monthlyWorkoutsTarget={monthlyStats.workoutsTarget}
        monthlyMealsDone={monthlyStats.mealsDone}
        monthlyMealsTarget={monthlyStats.mealsTarget}
        monthlyPR={monthlyStats.hasPR}
        historyData={historyData}
      />

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

      {/* Phase 2 & 3 placeholders */}
      {/* TODO Phase 2: Apple Health / Google Fit sync widget */}
      {/* TODO Phase 2: Social share workout summary card */}
      {/* TODO Phase 3: Community feed preview */}
      {/* TODO Phase 3: Active challenges widget */}
    </div>
  );
}
