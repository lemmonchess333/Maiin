import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ChevronDown, ChevronUp } from "lucide-react";
import { calculateHealthScore, getScoreColor, getScoreLabel } from "@/lib/healthScore";
import { useMeals } from "@/hooks/useMeals";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { format } from "date-fns";

export function HealthScoreCard() {
  const { profile } = useAuth();
  const { getDailyTotals } = useMeals();
  const [expanded, setExpanded] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const totals = getDailyTotals(today);

  const { score, breakdown } = useMemo(() => {
    return calculateHealthScore(
      {
        calories: totals.calories,
        protein: totals.protein,
        fiber: totals.fiber,
        sugar: totals.sugar,
        sodium: totals.sodium,
        mealCount: totals.mealCount,
      },
      {
        calories: profile?.targetCalories || 2200,
        protein: profile?.targetProtein || 160,
        fiber: profile?.targetFiber || 30,
        sugar: profile?.targetSugar || 30,
        sodium: profile?.targetSodium || 2300,
      }
    );
  }, [totals, profile]);

  const scoreColor = score != null ? getScoreColor(score) : undefined;

  const breakdownItems = [
    { label: "Workouts", pts: breakdown.workouts, max: 35 },
    { label: "Nutrition", pts: breakdown.nutrition, max: 30 },
    { label: "Water", pts: breakdown.water, max: 15 },
    { label: "Activity", pts: breakdown.activity, max: 20 },
  ];

  return (
    <div className="p-4 rounded-2xl bg-card">
      <button
        onClick={() => score != null && setExpanded(!expanded)}
        className="w-full flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
          <Heart className="w-5 h-5" style={{ color: THEME.semantic.vitals }} />
        </div>

        <div className="flex-1 text-left">
          <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Health Score</p>
          {score != null ? (
            <div className="flex items-center gap-2">
              <p className="text-[28px] font-extrabold leading-none" style={{ color: scoreColor }}>
                {score}
              </p>
              <p className="text-xs text-muted-foreground">{getScoreLabel(score)}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Log activity to see score</p>
          )}
        </div>

        {score != null && (
          <>
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.6 }}
                className="h-full rounded-full"
                style={{ backgroundColor: scoreColor }}
              />
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </>
        )}
      </button>

      <AnimatePresence>
        {expanded && score != null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border/30 space-y-2">
              {breakdownItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-20">{item.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(item.pts / item.max) * 100}%`,
                        backgroundColor: scoreColor,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                    {item.pts}/{item.max}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
