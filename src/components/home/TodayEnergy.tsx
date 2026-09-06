import { useState } from "react";
import { energyBarGeometry } from "@/lib/energyBarGeometry";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import type { DailyBurn } from "@/utils/dailyBurn";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import MacroRing from "@/components/home/MacroRing";
import BreakdownRow from "@/components/home/BreakdownRow";
import { usePersistedToggle } from "@/hooks/usePersistedToggle";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";

/**
 * Today's Energy — Home's nutrition summary.
 *
 * One compact summary, one logging action, one disclosure. The header
 * carries everything a glance needs — calories eaten / target, the phase,
 * the progress bar and the three macros in the same eaten/target
 * framing — and is the single tap that opens the details. The details
 * hold only what explains the target: the macro rings (with their
 * consumed/remaining flip), what today's training already contributed, and
 * the post-workout protein nudge. The one way into the food log is the
 * "Log food" action at the foot of the card; the cold-start state is a
 * status line above it, not a second link.
 *
 * Two rows left on 2026-09-06 because nothing could ever render them: a
 * "Plan target" line shown when the header's target differed from the
 * breakdown's — but Home builds the breakdown FROM the header's target
 * (HOME-TARGET-01), so they never differ — and a `nutritionInsight` prop no
 * caller produced.
 */
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
  uid,
  postWorkoutNudge,
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
  /** Scopes the remembered expand state per account (shared-device rule). */
  uid?: string | null;
  postWorkoutNudge?: {
    type: "lift" | "run" | "both";
    proteinRemaining: number;
  } | null;
}) {
  // Remembered per account, closed by default (Wave3 E1 keeps the Home
  // scroll calm by holding the three macro hues inside the disclosure);
  // opening it counts as a choice, and a shared device must not carry one
  // account's layout into another's session.
  const { value: expanded, toggle: toggleExpanded } = usePersistedToggle(
    `tropos-today-energy-expanded:${uid ?? "anon"}`
  );
  // Macro rings flip between consumed and remaining on tap; the mode lives
  // here so all three rings stay in sync.
  const [macroMode, setMacroMode] = useState<"consumed" | "left">("consumed");
  const tCal = targets.finalTarget;
  const tProt = targets.protein;
  const tCarbs = targets.carbs;
  const tFat = targets.fat;
  const calPct = (calories / tCal) * 100;

  const proteinColor = THEME.macros.protein;
  const carbsColor = THEME.macros.carbs;
  const fatColor = THEME.macros.fat;

  // The compact macros read eaten/target exactly as the calorie line does.
  // Nothing is clamped: an over-target macro shows as "200/160g", so going
  // over stays visible without colour saying it (no macro hue renders
  // collapsed). Grams are unspaced on the food surface, house style.
  const macroSummary = `P ${Math.round(protein)}/${Math.round(tProt)}g · C ${Math.round(carbs)}/${Math.round(tCarbs)}g · F ${Math.round(fat)}/${Math.round(tFat)}g`;

  // A brand-new user with no meals ever: the macros carry no information
  // at 0g, so the summary line yields to a status line that says what to
  // do. Returning users with a logged history keep the summary.
  const isColdStart =
    !mealsLoading && calories === 0 && totalLifetimeMeals === 0;
  const nudgeText =
    postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0
      ? postWorkoutNudge.type === "run"
        ? "Post-run — refuel with carbs + protein soon"
        : // HOME-TARGET-01: grams left to the user's own protein target,
          // not a claimed recovery effect.
          `Post-lift — ${postWorkoutNudge.proteinRemaining}g protein to your target`
      : null;
  const showLapsedNote =
    !mealsLoading &&
    calories === 0 &&
    totalLifetimeMeals > 0 &&
    daysSinceLastMeal >= 3;

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      {/* Summary header — the one tap that opens the details. */}
      <button
        type="button"
        onClick={function () {
          haptic();
          toggleExpanded();
        }}
        aria-expanded={expanded}
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
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Today's Energy
            </p>
            {burn.phase && (
              // HOME-TARGET-01: the phase label only — the real adjustment
              // already lives in `targets.finalTarget`, the number below.
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {burn.phase === "lean bulk"
                  ? "Bulk"
                  : burn.phase === "cut"
                    ? "Cut"
                    : "Recomp"}
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            Details
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tabular-nums leading-none text-foreground">
            {formatCalories(calories || 0)}
          </span>
          <span className="text-micro text-muted-foreground">eaten</span>
          <span className="text-micro text-muted-foreground font-mono tabular-nums">
            / {formatCalories(tCal)} {CALORIE_UNIT}
          </span>
        </div>
        {(() => {
          const { barWidth, tickPct } = energyBarGeometry(calPct);
          return (
            <div className="relative h-2.5 mt-2.5">
              <div className="absolute inset-0 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: barWidth + "%" }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: THEME.semantic.nutrition }}
                />
              </div>
              {/* The target tick appears only once the track has stretched
                  past target — under target the track's end IS the target.
                  Centred on its position so a 2px marker lands on the value
                  rather than beside it. */}
              {tickPct !== null && (
                <div
                  aria-hidden="true"
                  className="absolute top-0 h-full w-0.5 rounded-full -translate-x-1/2"
                  style={{
                    left: tickPct + "%",
                    backgroundColor: "hsl(var(--muted-foreground))",
                  }}
                />
              )}
            </div>
          );
        })()}
        {!isColdStart && !expanded && (
          <p className="mt-2.5 text-micro text-muted-foreground font-mono tabular-nums">
            {macroSummary}
          </p>
        )}
      </button>

      {/* A target below the essential-fat floor's own cost: the summary
          above would otherwise read "P 125/0g" as if 0 g were the goal.
          Same sentence as Settings and Food (macroInfeasibility.ts). */}
      {targets.targetInfeasible && (
        <p
          role="status"
          className="px-4 py-2.5 text-xs leading-snug border-b border-border/30"
          style={{ color: "hsl(var(--warning-strong))" }}
        >
          {macroInfeasibilityMessage(targets.minFeasibleKcal)}
        </p>
      )}

      {/* Details — only what explains the numbers above. */}
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
              {/* Nutr1: activity is INFORMATIONAL — it's already counted in
                  the target above, never added back (no eat-back budget). */}
              {(burn.workoutCalories > 0 ||
                burn.runCalories > 0 ||
                burn.stepCalories > 0) && (
                <>
                  <div className="h-px bg-border/50" />
                  <SectionLabel tier="section">
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
                      color={"hsl(var(--muted-foreground))"}
                    />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Situational notes — never a second way into the food log. */}
      {(nudgeText || showLapsedNote || isColdStart) && (
        <div className="px-4 pt-3 pb-3 space-y-2">
          {nudgeText && (
            <p
              className="text-xs font-medium text-center"
              style={{ color: THEME.semantic.nutrition }}
            >
              {nudgeText}
            </p>
          )}
          {showLapsedNote && (
            <p className="text-xs text-muted-foreground text-center">
              Nothing logged yet today
            </p>
          )}
          {isColdStart && (
            /* Home2c-locked phrase, one sentence. A status, not a link: the
               Log food action directly below is the one way in, so this
               block explains rather than duplicates it. */
            <div
              role="status"
              aria-label="No meals logged today. Log a meal to see your daily energy."
              className="flex flex-col items-center justify-center rounded-xl px-6 py-5"
              style={{ backgroundColor: THEME.semantic.nutrition + "0A" }}
            >
              <div
                className="size-10 rounded-lg flex items-center justify-center mb-2"
                style={{ backgroundColor: THEME.semantic.nutrition + "14" }}
              >
                <UtensilsCrossed
                  className="size-5"
                  style={{ color: THEME.semantic.nutrition }}
                  aria-hidden="true"
                />
              </div>
              <p
                className="text-sm font-semibold text-center"
                style={{ color: THEME.semantic.nutrition }}
              >
                Log a meal to see your daily energy
              </p>
            </div>
          )}
        </div>
      )}

      {/* The one logging action (#973): its own control, nutrition-orange,
          full 44px target, haptic on tap, for every segment. */}
      <Link
        to="/food"
        onClick={() => haptic()}
        className="flex items-center justify-center gap-1.5 w-full min-h-[44px] border-t border-border/30 text-sm font-semibold motion-safe:active:scale-[0.99] transition-transform"
        style={{ color: THEME.semantic.nutrition }}
        aria-label="Log food"
      >
        <UtensilsCrossed className="size-4" aria-hidden="true" />
        Log food
      </Link>
    </div>
  );
}
