import { energyBarGeometry } from "@/lib/energyBarGeometry";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { UtensilsCrossed } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import { Skeleton } from "@/components/LoadingSkeleton";
import type { DailyBurn } from "@/utils/dailyBurn";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import MacroRing from "@/components/home/MacroRing";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";

/**
 * Today's nutrition — Home's food summary.
 *
 * One card, everything visible, no disclosure. Calories against their
 * target, the three macros against theirs, and a single way into the
 * food log. Calories and macros are everyday information: they were
 * behind a "Details" toggle, with a compact "P 98/140g · C 141/273g ·
 * F 38/61g" line standing in for them, which asked the reader to decode
 * a string to learn what three rings say at a glance — and cost a tap
 * to see the rings that were the point.
 *
 * The verb is "logged", not "eaten". The app knows what reached the
 * diary; it does not know what reached the person. An empty diary is a
 * statement about the log, so an empty card reads "0 kcal logged"
 * rather than asserting the reader has eaten nothing.
 *
 * The "Burned today" breakdown is deliberately NOT here, and its absence
 * is a de-duplication rather than a loss: Food's nutrition drill-down
 * already carries an "Activity today" section with the same figures split
 * by lifting and running, the same total, and the same Nutr1 sentence
 * about not eating them back. Keeping both meant the one surface a user
 * reads every day paid 93px for a copy of the explanation, and paid it
 * only on the days they had actually trained, which is when the card is
 * most crowded.
 *
 * Two rows were removed because nothing could ever render them: a
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
  mealsLoading = false,
  postWorkoutNudge,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  burn: DailyBurn;
  targets: EffectiveTargets;
  mealsLoading?: boolean;
  postWorkoutNudge?: {
    type: "lift" | "run" | "both";
    proteinRemaining: number;
  } | null;
}) {
  const tCal = targets.finalTarget;
  // Nutr3: below the essential-fat floor the split funds no protein or
  // carbs, so those two carry NO goal ("No target" on the rings) rather
  // than a 0 g goal every meal "meets". Fat keeps its floor figure.
  const tProt = targets.targetInfeasible ? 0 : targets.protein;
  const tCarbs = targets.targetInfeasible ? 0 : targets.carbs;
  const tFat = targets.fat;
  const calPct = (calories / tCal) * 100;

  /**
   * A confident "0 kcal logged" while the day's meals are still arriving
   * is a false statement, not a neutral placeholder: it is
   * indistinguishable from a day with nothing logged, and the reader most
   * likely to see it is the returning user who logged a full day
   * yesterday. The guard is `calories === 0` rather than `mealsLoading`
   * alone so a load that already has a figure keeps showing it instead of
   * flickering back to a skeleton. Same shape as WeightStepsTiles'
   * `pending`.
   *
   * It gates the RINGS as well as the calorie figure, which is also what
   * keeps MacroRing's completion flash honest: mounting the rings only
   * once the day has settled means their `done` baseline is the real one,
   * so arriving data cannot fire a celebration for a target that was
   * already met before this render.
   */
  const caloriesPending = mealsLoading && calories === 0;
  const nudgeText =
    postWorkoutNudge && postWorkoutNudge.proteinRemaining > 0
      ? postWorkoutNudge.type === "run"
        ? "Post-run — refuel with carbs + protein soon"
        : // HOME-TARGET-01: grams left to the user's own protein target,
          // not a claimed recovery effect.
          `Post-lift — ${postWorkoutNudge.proteinRemaining}g protein to your target`
      : null;

  const macros = [
    {
      label: "Protein",
      value: protein,
      target: tProt,
      color: THEME.macros.protein,
    },
    { label: "Carbs", value: carbs, target: tCarbs, color: THEME.macros.carbs },
    { label: "Fat", value: fat, target: tFat, color: THEME.macros.fat },
  ];

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      <div
        className="px-4 pt-4 pb-4"
        style={{
          background:
            "linear-gradient(135deg, " +
            THEME.semantic.nutrition +
            "08 0%, transparent 70%)",
        }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <SectionLabel>Today's nutrition</SectionLabel>
          {burn.phase && (
            // HOME-TARGET-01: the phase label only — the real adjustment
            // already lives in `targets.finalTarget`, the number below.
            <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {burn.phase === "lean bulk"
                ? "Bulk"
                : burn.phase === "cut"
                  ? "Cut"
                  : "Recomp"}
            </span>
          )}
        </div>

        {/* Calories. The target is NAMED rather than implied by a slash:
            "/ 2,200 kcal" beside a big number leaves the reader to infer
            which of the two figures is the goal. */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-1.5 min-w-0">
            {caloriesPending ? (
              <span role="status" aria-label="Today's calories still loading">
                <Skeleton className="h-7 w-20" />
              </span>
            ) : (
              <span className="text-3xl font-extrabold font-mono tabular-nums leading-none text-foreground">
                {formatCalories(calories || 0)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {CALORIE_UNIT} logged
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums whitespace-nowrap">
            Target {formatCalories(tCal)} {CALORIE_UNIT}
          </span>
        </div>

        {(() => {
          const { barWidth, tickPct } = energyBarGeometry(calPct);
          return (
            <div className="relative h-2.5 mt-2.5">
              {/* Same neutral groove as the macro rings below. `bg-muted`
                  measures 1.06:1 against the card, so an unfilled bar was
                  as invisible as the rings were. */}
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{
                  backgroundColor: "hsl(var(--muted-foreground) / 0.22)",
                }}
              >
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

        {/* The three macros, always visible. */}
        <div className="mt-3.5 grid grid-cols-3 gap-1">
          {caloriesPending
            ? macros.map((m) => (
                <div
                  key={m.label}
                  className="flex flex-col items-center gap-1.5"
                  aria-hidden="true"
                >
                  <Skeleton className="size-16 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))
            : macros.map((m) => (
                <MacroRing
                  key={m.label}
                  value={m.value}
                  target={m.target}
                  color={m.color}
                  label={m.label}
                  unit="g"
                />
              ))}
        </div>
      </div>

      {/* A target below the essential-fat floor's own cost: the rings
          above would otherwise read "Target 0g" as if 0 g were the goal.
          Same sentence as Settings and Food (macroInfeasibility.ts). */}
      {targets.targetInfeasible && (
        <p
          role="status"
          className="px-4 py-2.5 text-xs leading-snug border-t border-border/30"
          style={{ color: "hsl(var(--warning-strong))" }}
        >
          {macroInfeasibilityMessage(targets.minFeasibleKcal)}
        </p>
      )}

      {/* Situational note — never a second way into the food log. */}
      {nudgeText && (
        <p
          className="px-4 pb-3 text-xs font-medium text-center"
          style={{ color: THEME.semantic.nutrition }}
        >
          {nudgeText}
        </p>
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
