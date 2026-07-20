import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import type { DailyBurn } from "@/utils/dailyBurn";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import MacroRing from "@/components/home/MacroRing";

/**
 * Today's Energy — mid-size card (home-declutter 2a, revised
 * 2026-07-20 on operator feedback).
 *
 * The first compact pass reduced this to a two-line row and the
 * operator's verdict was that it lost the card's identity — the
 * colour-coded macro rings ARE the glanceable data. This landing
 * spot keeps the declutter's wins (no in-place expansion, no
 * burned-today breakdown, no embedded insight/nudges, ONE log
 * affordance) but the three rings are back, always visible, with the
 * cal.ai tap-to-flip (consumed ↔ left) preserved.
 *
 * Structure: the header block (label + honest phase chip + kcal +
 * bar) is the tap-through to /food; the ring row is its own flip
 * button. Kept honest: the phase chip is the label only
 * (HOME-TARGET-01 — the real adjustment already lives in
 * `targets.finalTarget`), and the bar's tick marks 100% when
 * consumption passes the target.
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
  // cal.ai-style tap-to-flip: rings show consumed by default, tap
  // toggles to "left" (target − consumed, clamped at 0). Lives at the
  // parent so all three rings stay in sync.
  const [macroMode, setMacroMode] = useState<"consumed" | "left">("consumed");

  const tCal = targets.finalTarget;
  const calPct = (calories / tCal) * 100;

  // Cold-start: a brand-new user with no meals ever — rings at 0g
  // carry no information, so the row becomes the first-meal CTA
  // (Home2c single-sentence copy).
  const isColdStart =
    !mealsLoading && calories === 0 && totalLifetimeMeals === 0;

  // Over-target: bar fills to a scaled max (≤130%) with a tick at the
  // 100% mark.
  const maxPct = Math.max(100, Math.min(calPct, 130));
  const barWidth = Math.min((calPct / maxPct) * 100, 100);
  const tickPos = (100 / maxPct) * 100;

  return (
    <div
      className="rounded-2xl bg-card overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, " +
          THEME.semantic.nutrition +
          "08 0%, transparent 70%)",
      }}
    >
      <Link
        to="/food"
        onClick={() => haptic()}
        aria-label="Today's energy — open food log"
        className="block px-4 pt-3.5 pb-3 motion-safe:active:scale-[0.99] transition-transform"
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
              // HOME-TARGET-01: label only — no fabricated delta; the
              // real adjustment already lives in `targets.finalTarget`.
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {burn.phase === "lean bulk"
                  ? "Bulk"
                  : burn.phase === "cut"
                    ? "Cut"
                    : "Recomp"}
              </span>
            )}
          </div>
          <ChevronRight
            className="size-3.5 text-muted-foreground"
            aria-hidden
          />
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
      </Link>

      {isColdStart ? (
        <Link
          to="/food"
          className="flex items-center gap-1.5 text-xs font-semibold px-4 pb-3.5"
          style={{ color: THEME.semantic.nutrition }}
          role="status"
          aria-label="No meals logged today. Log a meal to see your daily energy."
        >
          <UtensilsCrossed className="size-3.5" aria-hidden />
          Log a meal to see your daily energy
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            haptic();
            setMacroMode((m) => (m === "consumed" ? "left" : "consumed"));
          }}
          aria-label={
            macroMode === "consumed"
              ? "Macros showing consumed. Tap to switch to remaining."
              : "Macros showing remaining. Tap to switch to consumed."
          }
          className={cn(
            "w-full flex items-center justify-around px-4 pb-3.5 motion-safe:active:scale-[0.99] transition-transform",
            calories === 0 && "opacity-60"
          )}
        >
          <MacroRing
            value={protein}
            target={targets.protein}
            color={THEME.macros.protein}
            label="Protein"
            unit="g"
            displayMode={macroMode}
          />
          <MacroRing
            value={carbs}
            target={targets.carbs}
            color={THEME.macros.carbs}
            label="Carbs"
            unit="g"
            displayMode={macroMode}
          />
          <MacroRing
            value={fat}
            target={targets.fat}
            color={THEME.macros.fat}
            label="Fat"
            unit="g"
            displayMode={macroMode}
          />
        </button>
      )}
    </div>
  );
}
