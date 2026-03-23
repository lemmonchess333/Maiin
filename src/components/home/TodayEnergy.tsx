import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DailyBurn } from "@/utils/dailyBurn";
import MacroRing from "@/components/home/MacroRing";
import BreakdownRow from "@/components/home/BreakdownRow";

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

export default function TodayEnergy({ calories, protein, burn, targetProtein: initProt, totalLifetimeMeals = 0, daysSinceLastMeal = Infinity, mealsLoading = false, postWorkoutNudge }: {
  calories: number; protein: number; burn: DailyBurn; targetProtein: number; totalLifetimeMeals?: number; daysSinceLastMeal?: number; mealsLoading?: boolean;
  postWorkoutNudge?: { type: "lift" | "run" | "both"; proteinRemaining: number } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const tCal = burn.dailyBudget > 0 ? burn.dailyBudget : 2200;
  const tProt = initProt > 0 ? initProt : 160;
  const tCarbs = Math.round((tCal * 0.45) / 4);
  const tFat = Math.round((tCal * 0.28) / 9);
  const proteinCal = protein * 4;
  const remaining = Math.max(calories - proteinCal, 0);
  const estimatedCarbs = Math.round((remaining * 0.62) / 4);
  const estimatedFat = Math.round((remaining * 0.38) / 9);
  const calPct = Math.min((calories / tCal) * 100, 100);
  const caloriesLeft = Math.max(tCal - calories, 0);

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      {/* Calorie header -- tappable to expand */}
      <button
        onClick={function() { haptic(); setExpanded(function(e) { return !e; }); }}
        className="w-full text-left px-4 pt-4 pb-3 border-b border-border/30 accent-edge"
        style={{ '--accent-edge-color': THEME.semantic.nutrition } as React.CSSProperties}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Today's Energy</p>
            {burn.phase && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: THEME.semantic.nutrition + '15', color: THEME.semantic.nutrition }}>
                {burn.phase === 'lean bulk' ? 'Bulk' : burn.phase === 'cut' ? 'Cut' : 'Recomp'}
                {burn.phase === 'lean bulk' ? ' · +300' : burn.phase === 'cut' ? ' · −500' : ''}
              </span>
            )}
          </div>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-[28px] font-extrabold font-mono tabular-nums leading-none" style={{ color: THEME.semantic.nutrition }}>
            {(calories || 0).toLocaleString()}
          </span>
          <span className="text-[13px]" style={{ color: THEME.text.muted }}>/ {tCal.toLocaleString()} kcal</span>
          {caloriesLeft > 0 && (
            <span className="ml-auto text-[11px] text-muted-foreground">{caloriesLeft} left</span>
          )}
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-muted">
          <motion.div initial={{ width: 0 }} animate={{ width: calPct + "%" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ backgroundColor: calPct >= 98 ? THEME.semantic.positive : THEME.semantic.nutrition }} />
        </div>
      </button>

      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="breakdown"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2.5">
              <BreakdownRow label={"Base TDEE (" + burn.phaseLabel + ")"} value={burn.phaseAdjustedTdee} />
              <BreakdownRow label="+ Workout" value={burn.workoutCalories} color={THEME.semantic.positive} />
              <BreakdownRow label="+ Run" value={burn.runCalories} color={THEME.semantic.vitals} />
              <BreakdownRow label="+ Steps" value={burn.stepCalories} placeholder="Connect Apple Health" /* TODO: "Connect Google Fit" on Android */ color={THEME.textMuted} />
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Today's budget</span>
                <span className="text-xs font-bold font-mono tabular-nums" style={{ color: THEME.semantic.nutrition }}>
                  {burn.dailyBudget.toLocaleString()}
                </span>
              </div>
              <Link to="/log" state={{ tab: 'food' }} className="block text-center text-[11px] font-medium pt-1" style={{ color: THEME.brand }}>
                View food log &rarr;
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Link to="/log" state={{ tab: 'food' }} className="block relative">
              {postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0 && (
                <p className="text-[11px] font-medium text-center px-4 pt-2" style={{ color: THEME.semantic.nutrition }}>
                  {postWorkoutNudge.type === "run"
                    ? "Post-run — refuel with carbs + protein soon"
                    : `Post-lift — ${postWorkoutNudge.proteinRemaining}g protein for recovery`
                  }
                </p>
              )}
              <div className={cn("flex items-center justify-around px-4 py-4", calories === 0 && "opacity-50")}>
                <MacroRing value={protein} target={tProt} color={THEME.semantic.hydration} label="Protein" unit="g" />
                <MacroRing value={estimatedCarbs} target={tCarbs} color={THEME.semantic.activity} label="Carbs" unit="g" />
                <MacroRing value={estimatedFat} target={tFat} color={THEME.semantic.nutrition} label="Fat" unit="g" />
              </div>
              {!mealsLoading && calories === 0 && totalLifetimeMeals === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[14px] font-semibold" style={{ color: THEME.semantic.nutrition }}>Log your first meal</p>
                  <p className="text-[11px] mt-0.5" style={{ color: THEME.text.muted }}>Tap to start tracking</p>
                </div>
              )}
              {!mealsLoading && calories === 0 && totalLifetimeMeals > 0 && daysSinceLastMeal >= 3 && (
                <p className="text-center text-[11px] font-medium pb-1" style={{ color: THEME.semantic.nutrition, opacity: 0.7 }}>
                  Tap to log today's meals
                </p>
              )}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
