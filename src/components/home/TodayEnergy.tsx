import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
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

export default function TodayEnergy({
  calories,
  protein,
  carbs,
  fat,
  burn,
  targets,
  totalLifetimeMeals = 0,
  daysSinceLastMeal = Infinity,
  mealsLoading = false,
  postWorkoutNudge,
  nutritionInsight,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  burn: DailyBurn;
  targets: EffectiveTargets;
  totalLifetimeMeals?: number;
  daysSinceLastMeal?: number;
  mealsLoading?: boolean;
  postWorkoutNudge?: {
    type: "lift" | "run" | "both";
    proteinRemaining: number;
  } | null;
  nutritionInsight?: {
    type: "positive" | "warning" | "tip";
    title: string;
    message: string;
  } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  // cal.ai-style tap-to-flip: macro rings show consumed by default,
  // tap toggles to "left" (target − consumed, clamped at 0). Lives
  // at the parent so all three rings stay in sync.
  const [macroMode, setMacroMode] = useState<"consumed" | "left">("consumed");
  const tCal = targets.finalTarget;
  const tProt = targets.protein;
  const tCarbs = targets.carbs;
  const tFat = targets.fat;
  const calPct = (calories / tCal) * 100;

  // Distinct macro colors from design tokens
  const proteinColor = THEME.macros.protein;
  const carbsColor = THEME.macros.carbs;
  const fatColor = THEME.macros.fat;

  // Wave3 E1 — collapsed macro summary. The three macro rings (pink/gold/sage
  // = 3 of the 6 accent hues the audit flagged on the Home scroll) now live
  // ONLY in the expanded breakdown; the collapsed default shows a single muted
  // mono line of grams-remaining instead, derived from the exact data the
  // rings use (target − consumed, clamped at 0). No macro colour rendered
  // collapsed, so the accent count drops to purple/orange/coral + neutrals.
  const proteinLeft = Math.max(0, Math.round(tProt - protein));
  const carbsLeft = Math.max(0, Math.round(tCarbs - carbs));
  const fatLeft = Math.max(0, Math.round(tFat - fat));

  // Cold-start: a brand-new user with no meals ever. The macro rings carry
  // no information at 0g (their targets already live in the calorie header),
  // so we render a clean inline CTA in their place rather than overlaying
  // near-transparent CTA text on top of faded rings — that overlay collided
  // with the ring labels and read as a rendering bug. Returning users with a
  // logged history still see the rings (faded) + a "log today" nudge below.
  const isColdStart =
    !mealsLoading && calories === 0 && totalLifetimeMeals === 0;

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      {/* Calorie header -- tappable to expand */}
      <button
        type="button"
        onClick={function () {
          haptic();
          setExpanded(function (e) {
            return !e;
          });
        }}
        className="w-full text-left px-4 pt-4 pb-3 border-b border-border/30"
        style={{
          background:
            "linear-gradient(135deg, " +
            THEME.semantic.nutrition +
            "08 0%, transparent 70%)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p
              className="text-xs font-semibold"
              style={{ color: THEME.text.muted }}
            >
              Today's Energy
            </p>
            {burn.phase && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {burn.phase === "lean bulk"
                  ? "Bulk"
                  : burn.phase === "cut"
                    ? "Cut"
                    : "Recomp"}
                {burn.phase === "lean bulk"
                  ? " · +300"
                  : burn.phase === "cut"
                    ? " · −500"
                    : ""}
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-2xl font-bold font-mono tabular-nums leading-none text-foreground">
            {formatCalories(calories || 0)}
          </span>
          <span className="text-micro text-muted-foreground font-mono tabular-nums">
            / {formatCalories(tCal)} {CALORIE_UNIT}
          </span>
        </div>
        {(() => {
          const maxPct = Math.max(100, Math.min(calPct, 130));
          const barWidth = Math.min((calPct / maxPct) * 100, 100);
          const tickPos = (100 / maxPct) * 100;
          return (
            <div className="relative h-2.5">
              <div className="absolute inset-0 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: barWidth + "%" }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: THEME.semantic.nutrition }}
                />
              </div>
              <div
                className="absolute top-0 h-full w-0.5 rounded-full"
                style={{
                  left: tickPos + "%",
                  backgroundColor: THEME.text.muted,
                }}
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
            <div className="p-4 space-y-2.5">
              {/* Wave3 E1 — the macro rings live here, in the expanded
                  breakdown (collapsed shows a muted summary line instead).
                  Tap-to-flip consumed/left preserved; unchanged macro
                  colours (semantics are fixed in DESIGN_GUIDE 3e). */}
              {!isColdStart && (
                <motion.button
                  type="button"
                  layout
                  onClick={() => {
                    haptic();
                    setMacroMode((m) =>
                      m === "consumed" ? "left" : "consumed"
                    );
                  }}
                  aria-label={
                    macroMode === "consumed"
                      ? "Macros showing consumed. Tap to switch to remaining."
                      : "Macros showing remaining. Tap to switch to consumed."
                  }
                  className={cn(
                    "w-full flex items-center justify-around pb-1 motion-safe:active:scale-[0.99] transition-transform",
                    calories === 0 && "opacity-50"
                  )}
                >
                  <MacroRing
                    value={protein}
                    target={tProt}
                    color={proteinColor}
                    label="Protein"
                    unit="g"
                    displayMode={macroMode}
                  />
                  <MacroRing
                    value={carbs}
                    target={tCarbs}
                    color={carbsColor}
                    label="Carbs"
                    unit="g"
                    displayMode={macroMode}
                  />
                  <MacroRing
                    value={fat}
                    target={tFat}
                    color={fatColor}
                    label="Fat"
                    unit="g"
                    displayMode={macroMode}
                  />
                </motion.button>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Daily target ({burn.phaseLabel})
                </span>
                <span
                  className="text-xs font-bold font-mono tabular-nums"
                  style={{ color: THEME.semantic.nutrition }}
                >
                  {burn.phaseAdjustedTdee.toLocaleString()}
                </span>
              </div>
              {/* Nutr1: activity is INFORMATIONAL — it's already counted in
                  the target above, never added back (no eat-back budget). */}
              {(burn.workoutCalories > 0 ||
                burn.runCalories > 0 ||
                burn.stepCalories > 0) && (
                <>
                  <div className="h-px bg-border/50" />
                  <SectionLabel
                    tier="section"
                    style={{ color: THEME.text.muted }}
                  >
                    Burned today · already in your target
                  </SectionLabel>
                  {burn.workoutCalories > 0 && (
                    <BreakdownRow
                      label="Workout"
                      value={burn.workoutCalories}
                      color={THEME.semantic.positive}
                    />
                  )}
                  {burn.runCalories > 0 && (
                    <BreakdownRow
                      label="Run"
                      value={burn.runCalories}
                      color={THEME.semantic.vitals}
                    />
                  )}
                  {burn.stepCalories > 0 && (
                    <BreakdownRow
                      label="Steps"
                      value={burn.stepCalories}
                      color={THEME.text.muted}
                    />
                  )}
                </>
              )}
              {nutritionInsight && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-start gap-2">
                    <span
                      className="size-1.5 rounded-full mt-1 shrink-0"
                      style={{
                        background:
                          nutritionInsight.type === "positive"
                            ? THEME.semantic.positive
                            : nutritionInsight.type === "warning"
                              ? THEME.warning
                              : THEME.brand,
                      }}
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {nutritionInsight.title}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {nutritionInsight.message}
                      </p>
                    </div>
                  </div>
                </>
              )}
              <Link
                to="/food"
                className="inline-flex items-center gap-1 text-xs font-medium pt-1"
                style={{ color: THEME.brand }}
              >
                View food log &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Macro area. Collapsed (default) shows a single muted mono line of
          grams-remaining; the full colour rings live in the expanded
          breakdown above (Wave3 E1). Cold-start shows its CTA in both
          states. */}
      <div className="block relative">
        {postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0 && (
          <p
            className="text-xs font-medium text-center px-4 pt-2"
            style={{ color: THEME.semantic.nutrition }}
          >
            {postWorkoutNudge.type === "run"
              ? "Post-run — refuel with carbs + protein soon"
              : `Post-lift — ${postWorkoutNudge.proteinRemaining}g protein for recovery`}
          </p>
        )}
        {!isColdStart && !expanded && (
          <p className="text-micro text-muted-foreground font-mono tabular-nums text-center px-4 py-3">
            P {proteinLeft}g · C {carbsLeft}g · F {fatLeft}g left
          </p>
        )}
        {isColdStart && (
          /* Home2c-locked empty-state copy. Single sentence per spec
             (was a two-line title/sub: "Log your first meal" + "Tap
             to start tracking"). Rendered INLINE in place of the macro
             rings — not as an absolute overlay — so the CTA can't collide
             with the faded ring labels underneath (the previous overlay
             read as a rendering bug). aria-label keeps the same intent
             for screen readers. */
          <Link
            to="/food"
            className="flex flex-col items-center justify-center rounded-xl px-6 py-5"
            style={{ backgroundColor: THEME.semantic.nutrition + "0A" }}
            role="status"
            aria-label="No meals logged today. Log a meal to see your daily energy."
          >
            <div
              className="size-10 rounded-lg flex items-center justify-center mb-2"
              style={{ backgroundColor: THEME.semantic.nutrition + "14" }}
            >
              <UtensilsCrossed
                className="size-5"
                style={{ color: THEME.semantic.nutrition }}
              />
            </div>
            <p
              className="text-sm font-semibold text-center"
              style={{ color: THEME.semantic.nutrition }}
            >
              Log a meal to see your daily energy
            </p>
          </Link>
        )}
        {!mealsLoading &&
          calories === 0 &&
          totalLifetimeMeals > 0 &&
          daysSinceLastMeal >= 3 && (
            <Link
              to="/food"
              className="block text-center text-xs font-medium pb-1"
              style={{ color: THEME.semantic.nutrition, opacity: 0.7 }}
            >
              Log today's meals
            </Link>
          )}
      </div>

      {/* Always-on "Log" affordance (#973). The most-repeated daily action
          (food logging) gets a permanent, signposted entry point on the very
          surface that displays its result — for ALL segments, not just the
          cold-start empty state (the overlay above is new-user-only). Its own
          control (a Link, not nested in the header/ring buttons), nutrition-
          orange, full 44px target, haptic on tap. */}
      <Link
        to="/food"
        onClick={() => haptic()}
        className="flex items-center justify-center gap-1.5 w-full min-h-[44px] border-t border-border/30 text-sm font-semibold motion-safe:active:scale-[0.99] transition-transform"
        style={{ color: THEME.semantic.nutrition }}
        aria-label="Log food"
      >
        <UtensilsCrossed className="size-4" />
        Log food
      </Link>
    </div>
  );
}
