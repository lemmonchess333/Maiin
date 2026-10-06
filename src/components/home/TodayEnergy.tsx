import { Link } from "react-router-dom";
import { Beef, Plus, Wheat } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { Skeleton } from "@/components/LoadingSkeleton";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import {
  setCalorieRingMode,
  useCalorieRingMode,
} from "@/hooks/useCalorieRingMode";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import { Avocado } from "@/components/icons/Avocado";
import CalorieRing from "@/components/food/CalorieRing";
import MacroColumn, {
  type MacroColumnKey,
} from "@/components/food/MacroColumn";
import { cardClasses } from "@/components/ui/cardClasses";
import { buttonClasses } from "@/components/ui/buttonClasses";

type MacroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Home's food card: the Food page's calorie ring and macro tiles, side by
 * side at a smaller size (owner call; DS3's STATUS lines).
 *
 * The two screens draw the same two components so the same day reads as
 * the same object on both: the same ring, the same tiles, the same
 * numbers, counting down by default. They share one left/logged switch
 * (`useCalorieRingMode`): tapping the ring or a tile here flips it, and
 * Food opens the way it was left. Drawing a separate set here is how the
 * two came to disagree, one counting the macros up and the other down.
 *
 * Home stays plain: the orange-and-purple wash is the Food page's, and
 * the Today card above keeps its place as Home's one big thing. Everything
 * stays visible, with no disclosure: macros are everyday information (the
 * 2026-09-08 note in DESIGN_GUIDE). The "Burned today" breakdown is not
 * here: Food's nutrition drill-down carries it.
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
  // carbs, so those two carry NO goal rather than a 0 g goal every meal
  // "meets". Fat keeps its floor figure. Food passes the same zeros.
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

  const mode = useCalorieRingMode();
  const toggleMode = () => {
    haptic("light");
    setCalorieRingMode(mode === "left" ? "eaten" : "left");
  };

  const nudgeText =
    postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0
      ? postWorkoutNudge.type === "run"
        ? "Post-run: refuel with carbs and protein soon"
        : // HOME-TARGET-01: grams left to the user's own protein target,
          // not a claimed recovery effect.
          `Post-lift: ${postWorkoutNudge.proteinRemaining} g protein to your target`
      : null;

  const macros: {
    key: MacroColumnKey;
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
    <section
      aria-label="Today's food"
      className={cardClasses({ className: "@container" })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      {/* The ring and the three macros in one row. The macros sit on the
          card with no box of their own: the card is already the box.
          While the day's meals are arriving they wait as placeholders of
          the same size, so the card does not grow when the meals land.
          Under 12em of card (larger text on the phone) the macros go
          under the ring instead: beside it they ran into each other. */}
      <div className="mt-3 flex items-center gap-2.5 @max-[12em]:flex-col">
        {caloriesPending ? (
          <span
            role="status"
            aria-label="Today's calories still loading"
            className="shrink-0"
          >
            <Skeleton className="size-26 rounded-full" />
          </span>
        ) : (
          <CalorieRing
            size="compact"
            consumed={logged}
            target={tCal}
            mode={mode}
            onToggleMode={toggleMode}
            trajectoryLabel={null}
          />
        )}
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 @max-[12em]:w-full">
          {macros.map((m) => (
            <div key={m.key} className="flex min-w-0 px-0.5 py-1">
              {caloriesPending ? (
                <div
                  role="group"
                  aria-label={`${m.label} loading`}
                  className="flex w-full flex-col items-center gap-1.5"
                >
                  <Skeleton className="size-5 rounded-md" />
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="mt-1 h-1.5 w-full rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ) : (
                <MacroColumn
                  size="compact"
                  macroKey={m.key}
                  Icon={m.Icon}
                  consumed={m.value}
                  target={m.target}
                  label={m.label}
                  color={THEME.macros[m.key]}
                  mode={mode}
                  onTap={toggleMode}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* A target below the essential-fat floor's own cost: the tiles
          above would otherwise read as if 0 g were the goal. Same sentence
          as Settings and Food (macroInfeasibility.ts). */}
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
