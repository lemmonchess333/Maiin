import { Beef, Wheat } from "lucide-react";
import { Avocado } from "@/components/icons/Avocado";
import {
  useCalorieRingMode,
  setCalorieRingMode,
} from "@/hooks/useCalorieRingMode";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import MacroColumn from "./MacroColumn";
import { LOG_MOMENT_MS } from "./logMoment";

const LOG_MOMENT_SEC = LOG_MOMENT_MS / 1000;

interface FoodMacroRowProps {
  /** From useEffectiveTargets(): the day's macro targets. */
  dailyTargets: EffectiveTargets;
  dailyTotals: { protein: number; carbs: number; fat: number };
  /** Fill the bars and count the figures up from zero on mount (the
   *  default). Food passes false once the person has switched day: the
   *  row is remounted per day, and a remount is a browse, not a log. */
  drawIn?: boolean;
}

/**
 * Food's macros: protein, carbs and fat as one row with no boxes (Food11
 * call 4), under the week strip. Three boxed tiles under the boxed ring
 * made four cards of the page's first screen, with each macro's name as a
 * 12px caption at its foot; the row reads as three lines of text with a
 * thin bar under each.
 *
 * It was the lower half of `FoodHeroCard`. It is its own component so the
 * page can set the week strip between the wheel and the macros without
 * putting the strip inside the hero, which is remounted on every day
 * change and would drop the focus from the day just tapped.
 *
 * Each macro reads the SAME shared mode as the calorie wheel, from the
 * store the wheel writes, and a tap on any of them flips it for all four.
 *
 * An explicit 3-column GRID rather than flex-1 children: flex-1 sizes
 * from content, so the widest macro number could take space from its
 * neighbours. grid-cols-3 makes the columns equal by construction, and
 * `min-w-0` on each lets a long number shrink inside its own column.
 * Under 14em (larger text on a narrow phone) they stack: three across,
 * "Protein" beside its icon ran past an 85px column at 1.35x text on a
 * 320px phone.
 */
export default function FoodMacroRow({
  dailyTargets,
  dailyTotals,
  drawIn = true,
}: FoodMacroRowProps) {
  const mode = useCalorieRingMode();
  const toggleMode = () => {
    haptic("light");
    setCalorieRingMode(mode === "left" ? "eaten" : "left");
  };
  /* A target below the essential-fat floor's own cost leaves protein and
     carbs with no goal to count against (Nutr3); the wheel's card says
     so in words. */
  const noGoal = dailyTargets.targetInfeasible;
  const shared = {
    size: "row",
    mode,
    onTap: toggleMode,
    numberDurationSec: LOG_MOMENT_SEC,
    barDurationSec: LOG_MOMENT_SEC,
    drawIn,
  } as const;
  return (
    <div className="@container">
      <div className="grid grid-cols-3 @max-[14em]:grid-cols-1 gap-x-4 gap-y-3">
        <MacroColumn
          {...shared}
          macroKey="protein"
          Icon={Beef}
          consumed={dailyTotals.protein}
          target={noGoal ? 0 : dailyTargets.protein}
          label="Protein"
          color={THEME.macros.protein}
        />
        <MacroColumn
          {...shared}
          macroKey="carbs"
          Icon={Wheat}
          consumed={dailyTotals.carbs}
          target={noGoal ? 0 : dailyTargets.carbs}
          label="Carbs"
          color={THEME.macros.carbs}
        />
        <MacroColumn
          {...shared}
          macroKey="fat"
          Icon={Avocado}
          consumed={dailyTotals.fat}
          target={dailyTargets.fat}
          label="Fat"
          color={THEME.macros.fat}
        />
      </div>
    </div>
  );
}
