import type { Meal } from "@/hooks/useMeals";
import type { MealCopySelection } from "./mealCopy";
import { isActiveMealDoc } from "./mealTotals";

export interface CopyPreviousDayPlan {
  selections: MealCopySelection[];
  mealCount: number;
  totalCalories: number;
}

/**
 * Builds a deterministic copy plan for duplicating the previous day's meals
 * onto `targetDate`. Excludes any meal IDs in `excludedIds` (such as pending
 * deletes). Returns `null` when no copyable meals remain.
 */
export function buildCopyPreviousDay(
  previousMeals: readonly Meal[],
  targetDate: string,
  excludedIds?: ReadonlySet<string>
): CopyPreviousDayPlan | null {
  const eligible = previousMeals.filter(
    (meal) =>
      isActiveMealDoc(meal) && (!excludedIds || !excludedIds.has(meal.id))
  );
  if (eligible.length === 0) return null;

  const selections: MealCopySelection[] = eligible.map((source) => ({
    source,
    multiplier: 1,
    destinationId: `copy-day-${targetDate}-${source.id}`,
  }));

  const totalCalories = Math.round(
    eligible.reduce(
      (sum, meal) =>
        sum +
        (typeof meal.totalCalories === "number" &&
        Number.isFinite(meal.totalCalories)
          ? meal.totalCalories
          : 0),
      0
    )
  );

  return {
    selections,
    mealCount: selections.length,
    totalCalories,
  };
}
