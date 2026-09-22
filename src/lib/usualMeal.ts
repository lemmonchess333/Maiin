import { isActiveMealDoc } from "@/lib/mealTotals";
import type { Meal } from "@/hooks/useMeals";
import type { MealKey } from "@/components/food/mealConstants";
import type { QuickAddItem } from "@/lib/quickAddOrder";
import { mealLoggedAt, mealSlotFor } from "@/lib/mealSlots";

/** "Your usual" is a claim about frequency: the meal has to have repeated.
 *  Below this the row is still offered — a one-tap repeat is most useful to
 *  a new account — but it is named for what it is, the last time. */
export const USUAL_MIN_LOGS = 2;

export type UsualMeal = QuickAddItem & {
  /** Earlier logs of this meal in this slot, among the meals passed in
   *  (Food passes its last 30 days). */
  timesLogged: number;
};

/** Rank real slot history by frequency; carry the latest portion and its macros. */
export function usualMeal(
  meals: readonly Meal[],
  slot: MealKey,
  date: string
): UsualMeal | null {
  if (
    meals.some(
      (meal) =>
        isActiveMealDoc(meal) &&
        meal.date === date &&
        mealSlotFor(meal) === slot
    )
  )
    return null;
  const groups = new Map<string, { count: number; latest: Meal }>();
  for (const meal of meals) {
    if (
      !isActiveMealDoc(meal) ||
      meal.date >= date ||
      mealSlotFor(meal) !== slot ||
      !meal.foodName.trim()
    )
      continue;
    const key = meal.foodName.toLowerCase().trim();
    const group = groups.get(key);
    if (!group) groups.set(key, { count: 1, latest: meal });
    else {
      group.count++;
      const newer =
        meal.date > group.latest.date ||
        (meal.date === group.latest.date &&
          (mealLoggedAt(meal.createdAt)?.getTime() ?? 0) >
            (mealLoggedAt(group.latest.createdAt)?.getTime() ?? 0));
      if (newer) group.latest = meal;
    }
  }
  const top = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date)
  )[0];
  if (!top) return null;
  const chosen = top.latest;
  return {
    key: chosen.foodName.toLowerCase().trim(),
    name: chosen.foodName,
    cal: chosen.totalCalories,
    pro: chosen.totalProtein,
    carb: chosen.totalCarbs,
    fat: chosen.totalFat,
    portionSize:
      chosen.items.length === 1
        ? chosen.items[0].portionSize || "1 serving"
        : "1 meal",
    bundle:
      chosen.items.length > 1
        ? { foodName: chosen.foodName, items: chosen.items }
        : undefined,
    timesLogged: top.count,
  };
}

/* "at snacks" is not English; the slot KEY is not copy. */
const SLOT_PHRASE: Record<MealKey, string> = {
  breakfast: "at breakfast",
  lunch: "at lunch",
  snacks: "at snack time",
  dinner: "at dinner",
};

/** The row's heading. When the chosen meal was logged once, every candidate
 *  was (the ranking is by count), so the tiebreak has picked the most recent
 *  day's — "Last time" is literally what it is. */
export function usualMealHeading(usual: UsualMeal, slot: MealKey): string {
  const claim =
    usual.timesLogged >= USUAL_MIN_LOGS ? "Your usual" : "Last time";
  return `${claim} ${SLOT_PHRASE[slot]}`;
}

/** The portion shown beside the kcal, or null. A multi-food meal has no
 *  portion of its own — `portionSize` carries a fixed "1 meal" as the unit
 *  the Change-portion sheet multiplies — so the row shows none rather than a
 *  filler that reads like a count ("365 kcal · 1 meal"). */
export function usualMealPortion(usual: UsualMeal): string | null {
  return usual.bundle ? null : usual.portionSize;
}
