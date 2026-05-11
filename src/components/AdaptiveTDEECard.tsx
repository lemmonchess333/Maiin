import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { calculateAdaptiveTDEE, type TDEECalculation } from "@/lib/adaptiveTDEE";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs, type BodyweightLog } from "@/lib/api";
import { useMeals } from "@/hooks/useMeals";
import { ProGate } from "@/components/ProGate";

export function AdaptiveTDEECard() {
  const { user, profile, updateProfile } = useAuth();
  const [weightEntries, setWeightEntries] = useState<BodyweightLog[]>([]);
  const { meals } = useMeals();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchBodyweightLogs(user.uid).then(setWeightEntries);
  }, [user]);

  const tdeeResult = useMemo<TDEECalculation>(() => {
    if (!profile) return {
      estimatedTDEE: 0, adjustedCalories: 0, adjustedProtein: 0,
      adjustedCarbs: 0, adjustedFat: 0, confidence: "low",
      weeklyWeightChange: 0, targetWeightChange: 0,
    };

    const weightLogs = weightEntries.map((e) => ({
      date: e.date,
      weight: e.weight,
    }));

    // Aggregate calories per day from meals
    const calByDate = new Map<string, number>();
    for (const m of meals) {
      calByDate.set(m.date, (calByDate.get(m.date) || 0) + m.totalCalories);
    }
    const calorieLogs = Array.from(calByDate.entries())
      .map(([date, calories]) => ({ date, calories }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return calculateAdaptiveTDEE(
      weightLogs,
      calorieLogs,
      profile.program?.goal || "recomp",
      {
        calories: profile.targetCalories || 2200,
        protein: profile.targetProtein || 160,
        carbs: profile.targetCarbs || 250,
        fat: profile.targetFat || 60,
      },
      profile.weightKg || 70
    );
  }, [weightEntries, meals, profile]);

  const confidenceColor = {
    low: "#EF4444",
    medium: "#FFB547",
    high: "#34D399",
  }[tdeeResult.confidence];

  const handleApply = async () => {
    if (!profile) return;
    const adjustment = tdeeResult.adjustedCalories - (profile.tdeeBase || 2200);
    await updateProfile({
      aiCalorieAdjustment: adjustment,
      targetCalories: tdeeResult.adjustedCalories,
      targetProtein: tdeeResult.adjustedProtein,
      targetCarbs: tdeeResult.adjustedCarbs,
      targetFat: tdeeResult.adjustedFat,
    });
    // No success toast — calorie + macro target numbers update visibly
    // on the same card, which is the confirmation.
  };

  const trendIcon = tdeeResult.weeklyWeightChange > 0.05
    ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
    : tdeeResult.weeklyWeightChange < -0.05
      ? <TrendingDown className="w-3.5 h-3.5 text-red-500" />
      : <Minus className="w-3.5 h-3.5 text-muted-foreground" />;

  return (
    <ProGate featureKey="adaptive_tdee">
      <div className="p-4 rounded-2xl bg-card space-y-3">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10">
            <Brain className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Adaptive TDEE</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {tdeeResult.estimatedTDEE > 0 ? `${tdeeResult.estimatedTDEE} cal/day` : "Collecting data..."}
              </p>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: confidenceColor + "20", color: confidenceColor }}>
                {tdeeResult.confidence}
              </span>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-3 border-t border-border/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground">Estimated TDEE</p>
                    <p className="text-lg font-bold text-foreground">{tdeeResult.estimatedTDEE}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <p className="text-xs text-muted-foreground">Suggested Target</p>
                    <p className="text-lg font-bold text-primary">{tdeeResult.adjustedCalories}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {trendIcon}
                  <span>
                    Weekly weight change: {tdeeResult.weeklyWeightChange >= 0 ? "+" : ""}
                    {tdeeResult.weeklyWeightChange.toFixed(2)}kg
                    (target: {tdeeResult.targetWeightChange >= 0 ? "+" : ""}{tdeeResult.targetWeightChange.toFixed(1)}kg)
                  </span>
                </div>

                {tdeeResult.confidence !== "low" && (
                  <button
                    onClick={handleApply}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    Apply Suggested Targets
                  </button>
                )}

                {tdeeResult.confidence === "low" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Log more meals and weigh-ins for accurate estimates
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ProGate>
  );
}
