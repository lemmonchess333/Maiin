import { Link } from "react-router-dom";
import { Beef, Plus, Wheat } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import { macroRingState } from "@/utils/formatters";
import { Skeleton } from "@/components/LoadingSkeleton";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import { Avocado } from "@/components/icons/Avocado";
import ProgressRing from "@/components/ui/ProgressRing";
import { cardClasses } from "@/components/ui/cardClasses";
import { buttonClasses } from "@/components/ui/buttonClasses";

type MacroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Home's food card (DS3).
 *
 * Calories lead: an orange ring for the share of the target logged, and
 * beside it what is left of the target (or how far past it the day is).
 * The line under that says what was logged against what. Then protein,
 * carbs and fat, each with its icon and colour from the Food page, its
 * figure against its target and a bar.
 *
 * The verb is "logged", not "eaten". The app knows what reached the
 * diary, not what reached the person, so an empty diary reads "0 of 2,200
 * kcal logged" rather than asserting the reader ate nothing. "Left" is a
 * statement about the target, which the app does know.
 *
 * Everything stays visible, with no disclosure: macros are everyday
 * information (the 2026-09-08 note in DESIGN_GUIDE). The "Burned today"
 * breakdown is not here: Food's nutrition drill-down carries it.
 */
export default function TodayEnergy({
  calories,
  protein,
  carbs,
  fat,
  targets,
  mealsLoading = false,
  postWorkoutNudge,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targets: EffectiveTargets;
  mealsLoading?: boolean;
  postWorkoutNudge?: {
    type: "lift" | "run" | "both";
    proteinRemaining: number;
  } | null;
}) {
  const tCal = targets.finalTarget;
  // Nutr3: below the essential-fat floor the split funds no protein or
  // carbs, so those two carry NO goal ("No target") rather than a 0 g
  // goal every meal "meets". Fat keeps its floor figure.
  const tProt = targets.targetInfeasible ? 0 : targets.protein;
  const tCarbs = targets.targetInfeasible ? 0 : targets.carbs;
  const tFat = targets.fat;

  /**
   * A confident "0 kcal" while the day's meals are still arriving is a
   * false statement, not a neutral placeholder: it is indistinguishable
   * from a day with nothing logged, and the reader most likely to see it
   * is the returning user who logged a full day yesterday. The guard is
   * `calories === 0` rather than `mealsLoading` alone, so a load that
   * already has a figure keeps showing it instead of flickering back to a
   * skeleton. Same shape as WeightStepsTiles' `pending`.
   */
  const caloriesPending = mealsLoading && calories === 0;
  const logged = Math.round(calories || 0);
  const hasTarget = tCal > 0;
  const over = hasTarget && logged > tCal;
  const headline = hasTarget ? Math.abs(tCal - logged) : logged;
  const headlineUnit = !hasTarget
    ? `${CALORIE_UNIT} logged`
    : over
      ? `${CALORIE_UNIT} over`
      : `${CALORIE_UNIT} left`;

  const nudgeText =
    postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0
      ? postWorkoutNudge.type === "run"
        ? "Post-run: refuel with carbs and protein soon"
        : // HOME-TARGET-01: grams left to the user's own protein target,
          // not a claimed recovery effect.
          `Post-lift: ${postWorkoutNudge.proteinRemaining} g protein to your target`
      : null;

  /* Text colours are the palette's THEME-AWARE step: on a white card the
     raw carbs yellow is 1.92:1, so light mode swaps to the darker set
     (useMacroPalette). The bars keep the identity colours, which are
     fills rather than text. */
  const { accent, text } = useMacroPalette();
  const macros: {
    key: "protein" | "carbs" | "fat";
    label: string;
    Icon: MacroIcon;
    value: number;
    target: number;
  }[] = [
    {
      key: "protein",
      label: "Protein",
      Icon: Beef,
      value: protein,
      target: tProt,
    },
    { key: "carbs", label: "Carbs", Icon: Wheat, value: carbs, target: tCarbs },
    { key: "fat", label: "Fat", Icon: Avocado, value: fat, target: tFat },
  ];

  return (
    <section aria-label="Today's food" className={cardClasses()}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Food</h2>
        {/* The one way into the food log: nutrition-tinted, a full 44px
            target. The orange is the -strong step, not the identity: the
            identity is a fill colour and reads 2.77:1 as text here. */}
        <Link
          to="/food"
          onClick={() => haptic()}
          className={buttonClasses({
            variant: "nutrition-tinted",
            className: "rounded-full",
          })}
        >
          <Plus className="size-4" aria-hidden="true" />
          Log food
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <ProgressRing
          value={hasTarget ? logged / tCal : 0}
          size={84}
          stroke={10}
          color={THEME.semantic.nutrition}
        />
        <div className="min-w-0">
          {caloriesPending ? (
            <span role="status" aria-label="Today's calories still loading">
              <Skeleton className="h-9 w-28" />
            </span>
          ) : (
            <p className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold font-mono tabular-nums leading-none text-foreground">
                {formatCalories(headline)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                {headlineUnit}
              </span>
            </p>
          )}
          {/* The target is NAMED in words, not implied by a slash. */}
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatCalories(logged)}
            </span>{" "}
            of{" "}
            <span className="font-mono tabular-nums">
              {formatCalories(tCal)}
            </span>{" "}
            {CALORIE_UNIT} logged
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3 grid grid-cols-3 gap-3">
        {macros.map((m) => {
          const share = m.target > 0 ? Math.min(1, m.value / m.target) : 0;
          /* Reached means within 10% of the target either way, the rule
             the macro rings used (`macroRingState`): 200 g of a 160 g
             protein target is over it, not "reached". */
          const met = m.target > 0 && macroRingState(m.value, m.target).done;
          return (
            <div
              key={m.key}
              data-macro={m.key}
              className="min-w-0"
              aria-label={
                caloriesPending
                  ? `${m.label} loading`
                  : m.target > 0
                    ? `${m.label} ${Math.round(m.value)} of ${m.target} grams${met ? ", target reached" : ""}`
                    : `${m.label} ${Math.round(m.value)} grams, no target`
              }
              role="group"
            >
              <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <m.Icon
                  className="size-3.5 shrink-0"
                  style={{ color: text[m.key] }}
                  aria-hidden="true"
                />
                {m.label}
              </p>
              {caloriesPending ? (
                <Skeleton className="mt-1.5 h-5 w-16" />
              ) : (
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  <span className="text-base font-extrabold font-mono tabular-nums text-foreground">
                    {Math.round(m.value)}
                  </span>
                  {m.target > 0 ? (
                    <>
                      {" / "}
                      <span className="font-mono tabular-nums">
                        {m.target}
                      </span>{" "}
                      g
                    </>
                  ) : (
                    " g · No target"
                  )}
                </p>
              )}
              <div
                className="mt-1.5 h-1.5 rounded-full overflow-hidden"
                style={{
                  backgroundColor: "hsl(var(--muted-foreground) / 0.22)",
                }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700"
                  style={{
                    width: `${share * 100}%`,
                    backgroundColor: accent[m.key],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* A target below the essential-fat floor's own cost: the figures
          above would otherwise read "/ 0 g" as if 0 g were the goal.
          Same sentence as Settings and Food (macroInfeasibility.ts). */}
      {targets.targetInfeasible && (
        <p
          role="status"
          className="mt-3 text-xs leading-snug"
          style={{ color: "hsl(var(--warning-strong))" }}
        >
          {macroInfeasibilityMessage(targets.minFeasibleKcal)}
        </p>
      )}

      {/* Situational note — never a second way into the food log. */}
      {nudgeText && (
        <p className="mt-3 text-xs font-medium text-nutrition-strong">
          {nudgeText}
        </p>
      )}
    </section>
  );
}
