/**
 * The food and water sections of the widgets' snapshot (Wid1), in whole
 * numbers. Home's whole snapshot (`homeWidgetSnapshot.ts`) and the
 * sections written on their own, by Food and by the water writer above
 * the routes (`useHomeWidgetSections`), all come through here.
 *
 * Kept apart from the snapshot's builder so a screen that writes only a
 * section loads only this: the builder reads today's session, the hero's
 * words and the drawings, which Food has no need of.
 */
import { formatWaterVolume, WATER_PRESETS } from "@/lib/waterUnits";
import type { WidgetFood, WidgetWater } from "@/lib/homeWidgetContract";

/** The day's food as Home's and Food's cards hold it: calories and
 *  protein logged, against the day's targets (`useEffectiveTargets`). */
export interface FoodFigures {
  eaten: number;
  target: number;
  protein: number;
  /** 0 for no protein goal (an infeasible split, Nutr3). */
  proteinTarget: number;
}

/** The day's water as `useWaterLog` holds it. */
export interface WaterFigures {
  ml: number;
  targetMl: number;
  servingMl: number;
  drinkIds: readonly string[];
}

/** The water step's name on the widget's button: the container Home's
 *  size sheet calls it ("Glass"), or its volume. */
export function servingLabel(ml: number): string {
  return (
    WATER_PRESETS.find((preset) => preset.ml === ml)?.label ??
    formatWaterVolume(ml)
  );
}

export const whole = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

/** The food section, whole numbers, for `dateKey`. Home's snapshot and
 *  Food's own section write both come through here. */
export function widgetFoodSection(
  dateKey: string,
  food: FoodFigures,
  nowMs: number
): WidgetFood {
  return {
    date: dateKey,
    eaten: Math.max(0, whole(food.eaten)),
    target: Math.max(0, whole(food.target)),
    protein: Math.max(0, whole(food.protein)),
    proteinTarget: Math.max(0, whole(food.proteinTarget)),
    updatedAt: Math.round(nowMs),
  };
}

/** The water section, whole numbers, for `dateKey`. Home's snapshot and
 *  the water writer above the routes both come through here. */
export function widgetWaterSection(
  dateKey: string,
  water: WaterFigures,
  nowMs: number
): WidgetWater {
  return {
    date: dateKey,
    ml: Math.max(0, whole(water.ml)),
    targetMl: Math.max(0, whole(water.targetMl)),
    servingMl: whole(water.servingMl),
    servingLabel: servingLabel(whole(water.servingMl)),
    drinkIds: [...water.drinkIds],
    updatedAt: Math.round(nowMs),
  };
}
