import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { DailyBurn } from "@/utils/dailyBurn";
import MacroRing from "@/components/home/MacroRing";
import BreakdownRow from "@/components/home/BreakdownRow";

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
  const calPct = (calories / tCal) * 100;

  // Distinct macro colors from design tokens
  const proteinColor = THEME.macros.protein;
  const carbsColor = THEME.macros.carbs;
  const fatColor = THEME.macros.fat;

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      {/* Calorie header -- tappable to expand */}
      <button
        onClick={function() { haptic(); setExpanded(function(e) { return !e; }); }}
        className="w-full text-left px-4 pt-4 pb-3 border-b border-border/30"
        style={{ background: "linear-gradient(135deg, " + THEME.semantic.nutrition + "08 0%, transparent 70%)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>Today's Energy</p>
            {burn.phase && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: THEME.semantic.nutrition + '15', color: THEME.semantic.nutrition }}>
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
          <span className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
            {(calories || 0).toLocaleString()}
          </span>
          <span className="text-micro text-muted-foreground">/ {tCal.toLocaleString()} kcal</span>
        </div>
        {(() => {
          const maxPct = Math.max(100, Math.min(calPct, 130));
          const barWidth = Math.min((calPct / maxPct) * 100, 100);
          const tickPos = (100 / maxPct) * 100;
          return (
            <div className="relative h-2">
              <div className="absolute inset-0 rounded-full bg-muted overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: barWidth + "%" }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: THEME.semantic.nutrition }} />
              </div>
              <div
                className="absolute top-0 h-full w-0.5 rounded-full"
                style={{ left: tickPos + "%", backgroundColor: THEME.text.muted }}
              />
            </div>
          );
        })()}
      </button>

      {/* Expandable breakdown */}
      <AnimatePresence>
        {expanded && (
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
              <Link to="/food" className="inline-flex items-center gap-1 text-xs font-medium pt-1" style={{ color: THEME.brand }}>
                View food log &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Macro rings — always visible */}
      <Link to="/food" className="block relative">
        {postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0 && (
          <p className="text-xs font-medium text-center px-4 pt-2" style={{ color: THEME.semantic.nutrition }}>
            {postWorkoutNudge.type === "run"
              ? "Post-run — refuel with carbs + protein soon"
              : `Post-lift — ${postWorkoutNudge.proteinRemaining}g protein for recovery`
            }
          </p>
        )}
        <motion.div layout className={cn("flex items-center justify-around px-4 py-3", calories === 0 && "opacity-50")}>
          <MacroRing value={protein} target={tProt} color={proteinColor} label="Protein" unit="g" />
          <MacroRing value={estimatedCarbs} target={tCarbs} color={carbsColor} label="Carbs" unit="g" />
          <MacroRing value={estimatedFat} target={tFat} color={fatColor} label="Fat" unit="g" />
        </motion.div>
        {!mealsLoading && calories === 0 && totalLifetimeMeals === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-sm font-semibold" style={{ color: THEME.semantic.nutrition }}>Log your first meal</p>
            <p className="text-xs mt-0.5" style={{ color: THEME.text.muted }}>Tap to start tracking</p>
          </div>
        )}
        {!mealsLoading && calories === 0 && totalLifetimeMeals > 0 && daysSinceLastMeal >= 3 && (
          <p className="text-center text-xs font-medium pb-1" style={{ color: THEME.semantic.nutrition, opacity: 0.7 }}>
            Tap to log today's meals
          </p>
        )}
      </Link>
    </div>
  );
}