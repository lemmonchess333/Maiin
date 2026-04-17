import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { UtensilsCrossed } from "lucide-react";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import type { DailyBurn } from "@/utils/dailyBurn";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import MacroRing from "@/components/home/MacroRing";
import BreakdownRow from "@/components/home/BreakdownRow";

export default function TodayEnergy({ calories, protein, burn, targets, totalLifetimeMeals = 0, daysSinceLastMeal = Infinity, mealsLoading = false, postWorkoutNudge, adaptiveTDEE, nutritionInsight }: {
  calories: number; protein: number; burn: DailyBurn; targets: EffectiveTargets; totalLifetimeMeals?: number; daysSinceLastMeal?: number; mealsLoading?: boolean;
  postWorkoutNudge?: { type: "lift" | "run" | "both"; proteinRemaining: number } | null;
  adaptiveTDEE?: { estimated: number; confidence: string } | null;
  nutritionInsight?: { type: "positive" | "warning" | "tip"; title: string; message: string } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const tCal = targets.finalTarget;
  const tProt = targets.protein;
  const tCarbs = targets.carbs;
  const tFat = targets.fat;
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
            <p className="text-xs font-semibold" style={{ color: THEME.text.muted }}>Today's Energy</p>
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
            {formatCalories(calories || 0)}
          </span>
          <span className="text-micro text-muted-foreground">/ {formatCalories(tCal)} {CALORIE_UNIT}</span>
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
              {burn.workoutCalories > 0 && (
                <BreakdownRow label="+ Workout" value={burn.workoutCalories} color={THEME.semantic.positive} />
              )}
              {burn.runCalories > 0 && (
                <BreakdownRow label="+ Run" value={burn.runCalories} color={THEME.semantic.vitals} />
              )}
              <BreakdownRow label="+ Steps" value={burn.stepCalories} placeholder="Connect Health App" color={THEME.textMuted} />
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Today's budget</span>
                <span className="text-xs font-bold font-mono tabular-nums" style={{ color: THEME.semantic.nutrition }}>
                  {burn.dailyBudget.toLocaleString()}
                </span>
              </div>
              {adaptiveTDEE && adaptiveTDEE.estimated > 0 && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Adaptive TDEE</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold font-mono tabular-nums text-foreground">{adaptiveTDEE.estimated.toLocaleString()}</span>
                      <span className="text-micro px-1.5 py-0.5 rounded-full font-medium" style={{
                        backgroundColor: (adaptiveTDEE.confidence === "high" ? THEME.semantic.positive : adaptiveTDEE.confidence === "medium" ? THEME.warning : THEME.semantic.vitals) + "20",
                        color: adaptiveTDEE.confidence === "high" ? THEME.semantic.positive : adaptiveTDEE.confidence === "medium" ? THEME.warning : THEME.semantic.vitals,
                      }}>{adaptiveTDEE.confidence}</span>
                    </div>
                  </div>
                </>
              )}
              {nutritionInsight && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{
                      background: nutritionInsight.type === "positive" ? THEME.semantic.positive : nutritionInsight.type === "warning" ? THEME.warning : THEME.brand,
                    }} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{nutritionInsight.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{nutritionInsight.message}</p>
                    </div>
                  </div>
                </>
              )}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ backgroundColor: THEME.semantic.nutrition + '08' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: THEME.semantic.nutrition + '14' }}>
              <UtensilsCrossed className="w-5 h-5" style={{ color: THEME.semantic.nutrition }} />
            </div>
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