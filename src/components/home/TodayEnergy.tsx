import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import type { DailyBurn } from "@/utils/dailyBurn";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";

/**
 * Today's Energy — compact row (home-declutter 2a, locked 2026-07-20).
 *
 * One glanceable answer ("how much do I have left?") and one tap
 * target: the WHOLE card links to /food — the Food tab is the
 * expansion. This replaced the expandable card (macro rings,
 * burned-today breakdown, embedded insight, post-workout nudge, plus
 * two separate log affordances); all of that detail lives in the Food
 * tab, and coaching copy lives in Home's single guidance slot (one
 * voice per screen).
 *
 * Kept honest: the phase chip is the label only (HOME-TARGET-01 — the
 * real adjustment is already inside `targets.finalTarget`), and the
 * over-target bar tick marks 100% when consumption passes the target.
 */
export default function TodayEnergy({
  calories,
  protein,
  carbs,
  fat,
  burn,
  targets,
  totalLifetimeMeals = 0,
  mealsLoading = false,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  burn: DailyBurn;
  targets: EffectiveTargets;
  totalLifetimeMeals?: number;
  mealsLoading?: boolean;
}) {
  const tCal = targets.finalTarget;
  const calPct = (calories / tCal) * 100;

  const proteinLeft = Math.max(0, Math.round(targets.protein - protein));
  const carbsLeft = Math.max(0, Math.round(targets.carbs - carbs));
  const fatLeft = Math.max(0, Math.round(targets.fat - fat));

  // Cold-start: a brand-new user with no meals ever — the macro line
  // carries no information, so the subline becomes the first-meal CTA
  // (Home2c single-sentence copy).
  const isColdStart =
    !mealsLoading && calories === 0 && totalLifetimeMeals === 0;

  // Over-target: bar fills to a scaled max (≤130%) with a tick at the
  // 100% mark, same behaviour as the pre-compact card.
  const maxPct = Math.max(100, Math.min(calPct, 130));
  const barWidth = Math.min((calPct / maxPct) * 100, 100);
  const tickPos = (100 / maxPct) * 100;

  return (
    <Link
      to="/food"
      onClick={() => haptic()}
      aria-label="Today's energy — open food log"
      className="block rounded-2xl bg-card px-4 py-3.5 motion-safe:active:scale-[0.99] transition-transform"
      style={{
        background:
          "linear-gradient(135deg, " +
          THEME.semantic.nutrition +
          "08 0%, transparent 70%)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <p
            className="text-xs font-semibold"
            style={{ color: THEME.text.muted }}
          >
            Today's Energy
          </p>
          {burn.phase && (
            // HOME-TARGET-01: label only — no fabricated delta; the real
            // adjustment already lives in `targets.finalTarget` below.
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {burn.phase === "lean bulk"
                ? "Bulk"
                : burn.phase === "cut"
                  ? "Cut"
                  : "Recomp"}
            </span>
          )}
        </div>
        <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
          {formatCalories(calories || 0)}
        </span>
        <span className="text-micro text-muted-foreground font-mono tabular-nums">
          / {formatCalories(tCal)} {CALORIE_UNIT}
        </span>
      </div>

      <div className="relative h-2">
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
          style={{ left: tickPos + "%", backgroundColor: THEME.text.muted }}
        />
      </div>

      {isColdStart ? (
        <p
          className="flex items-center gap-1.5 text-xs font-semibold pt-2.5"
          style={{ color: THEME.semantic.nutrition }}
          role="status"
          aria-label="No meals logged today. Log a meal to see your daily energy."
        >
          <UtensilsCrossed className="size-3.5" aria-hidden />
          Log a meal to see your daily energy
        </p>
      ) : (
        <p className="text-micro text-muted-foreground font-mono tabular-nums pt-2.5">
          P {proteinLeft}g · C {carbsLeft}g · F {fatLeft}g left
        </p>
      )}
    </Link>
  );
}
