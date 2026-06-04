import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { THEME } from "@/lib/theme";

interface MealMacroBarProps {
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

/**
 * Thin 3-segment stacked bar showing the P/C/F kcal split of a single meal.
 *
 * Widths are derived from macro grams (not from the stated meal kcal) so the
 * three segments always sum to 100% regardless of rounding or missing data.
 *
 * NESTED LAYOUT GUARD:
 * The parent meal section wrapper uses Framer Motion `layout` for its
 * empty-↔-populated height transition. Nested layout animations would
 * recompute on every parent resize and cause flicker. Each segment here
 * uses `layout="size"` + `layoutDependency={pPct-cPct-fPct}` so it only
 * re-tweens when the actual percentages change, ignoring parent layout.
 */
export default function MealMacroBar({
  totalProtein,
  totalCarbs,
  totalFat,
}: MealMacroBarProps) {
  const reduce = useReducedMotion() === true;

  const pKcal = totalProtein * 4;
  const cKcal = totalCarbs * 4;
  const fKcal = totalFat * 9;
  const sum = pKcal + cKcal + fKcal;

  // No macro data → hide the bar entirely
  if (sum <= 0) return null;

  const pPct = (pKcal / sum) * 100;
  const cPct = (cKcal / sum) * 100;
  const fPct = (fKcal / sum) * 100;

  const layoutDep = `${pPct}-${cPct}-${fPct}`;

  return (
    <div
      className="h-1 w-full overflow-hidden rounded-sm flex"
      aria-hidden="true"
    >
      <motion.div
        layout={reduce ? false : "size"}
        layoutDependency={layoutDep}
        className="h-full"
        style={{
          width: `${pPct}%`,
          background: THEME.macros.protein,
          opacity: 0.85,
          borderTopLeftRadius: "2px",
          borderBottomLeftRadius: "2px",
        }}
      />
      <motion.div
        layout={reduce ? false : "size"}
        layoutDependency={layoutDep}
        className="h-full"
        style={{
          width: `${cPct}%`,
          background: THEME.macros.carbs,
          opacity: 0.85,
        }}
      />
      <motion.div
        layout={reduce ? false : "size"}
        layoutDependency={layoutDep}
        className="h-full"
        style={{
          width: `${fPct}%`,
          background: THEME.macros.fat,
          opacity: 0.85,
          borderTopRightRadius: "2px",
          borderBottomRightRadius: "2px",
        }}
      />
    </div>
  );
}
