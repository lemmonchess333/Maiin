import { isActiveMealDoc } from "@/lib/mealTotals";
import type { Meal } from "@/hooks/useMeals";
import type { MealKey } from "@/components/food/mealConstants";
import type { QuickAddItem } from "@/lib/quickAddOrder";
import { mealLoggedAt, mealSlotFor } from "@/lib/mealSlots";

/** Rank real slot history by frequency; carry the latest portion and its macros. */
export function usualMeal(meals: readonly Meal[], slot: MealKey, date: string): QuickAddItem | null {
  if (meals.some((meal) => isActiveMealDoc(meal) && meal.date === date && mealSlotFor(meal) === slot)) return null;
  const groups = new Map<string, { count: number; latest: Meal }>();
  for (const meal of meals) {
    if (!isActiveMealDoc(meal) || meal.date >= date || mealSlotFor(meal) !== slot || !meal.foodName.trim()) continue;
    const key = meal.foodName.toLowerCase().trim();
    const group = groups.get(key);
    if (!group) groups.set(key, { count: 1, latest: meal });
    else {
      group.count++;
      const newer = meal.date > group.latest.date || (meal.date === group.latest.date &&
        (mealLoggedAt(meal.createdAt)?.getTime() ?? 0) > (mealLoggedAt(group.latest.createdAt)?.getTime() ?? 0));
      if (newer) group.latest = meal;
    }
  }
  const chosen = [...groups.values()].sort((a, b) => b.count - a.count || b.latest.date.localeCompare(a.latest.date))[0]?.latest;
  if (!chosen) return null;
  return { key: chosen.foodName.toLowerCase().trim(), name: chosen.foodName,
    cal: chosen.totalCalories, pro: chosen.totalProtein, carb: chosen.totalCarbs, fat: chosen.totalFat,
    portionSize: chosen.items.length === 1 ? chosen.items[0].portionSize || "1 serving" : "1 meal",
    bundle: chosen.items.length > 1 ? { foodName: chosen.foodName, items: chosen.items } : undefined };
}
