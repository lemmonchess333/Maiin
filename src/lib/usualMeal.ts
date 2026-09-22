import { isActiveMealDoc } from "@/lib/mealTotals";
import type { Meal } from "@/hooks/useMeals";
import type { MealKey } from "@/components/food/mealConstants";
import type { QuickAddItem } from "@/lib/quickAddOrder";
import { mealLoggedAt, mealSlotFor } from "@/lib/mealSlots";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/* "Your usual" claims the meal is what this slot has been, lately. The row
   sits above the composer, and on a 390x844 phone it is what pushes the
   composer under the tab bar — so a wrong guess costs the page's main input
   on every day it shows. It shows only when, in the USUAL_WINDOW_DAYS before
   the day, the meal was logged on at least USUAL_MIN_DAYS days AND on at
   least USUAL_MIN_SHARE of the days that slot was logged at all.

   Days, not entries: oats and a coffee logged separately each morning are
   still every morning. The share is what "usual" means — the one repeat in
   twenty different dinners is not a habit. The window is short so the row
   follows a change of habit instead of offering the old one for weeks.
   Below the bar there is no row: a one-off repeat is two taps away in the
   composer's Quick Add list. */
export const USUAL_WINDOW_DAYS = 14;
export const USUAL_MIN_DAYS = 3;
export const USUAL_MIN_SHARE = 0.5;

/** The slot's usual meal, carrying its latest portion and macros, or null. */
export function usualMeal(
  meals: readonly Meal[],
  slot: MealKey,
  date: string
): QuickAddItem | null {
  if (
    meals.some(
      (meal) =>
        isActiveMealDoc(meal) &&
        meal.date === date &&
        mealSlotFor(meal) === slot
    )
  )
    return null;
  // Exclusive of `date`, so the window holds exactly USUAL_WINDOW_DAYS dates.
  const from = localDateString(
    addLocalDays(parseLocalDate(date), -USUAL_WINDOW_DAYS)
  );
  const slotDays = new Set<string>();
  const groups = new Map<string, { days: Set<string>; latest: Meal }>();
  for (const meal of meals) {
    if (
      !isActiveMealDoc(meal) ||
      meal.date >= date ||
      meal.date < from ||
      mealSlotFor(meal) !== slot
    )
      continue;
    slotDays.add(meal.date);
    if (!meal.foodName.trim()) continue;
    const key = meal.foodName.toLowerCase().trim();
    const group = groups.get(key);
    if (!group) groups.set(key, { days: new Set([meal.date]), latest: meal });
    else {
      group.days.add(meal.date);
      const newer =
        meal.date > group.latest.date ||
        (meal.date === group.latest.date &&
          (mealLoggedAt(meal.createdAt)?.getTime() ?? 0) >
            (mealLoggedAt(group.latest.createdAt)?.getTime() ?? 0));
      if (newer) group.latest = meal;
    }
  }
  const top = [...groups.values()].sort(
    (a, b) =>
      b.days.size - a.days.size || b.latest.date.localeCompare(a.latest.date)
  )[0];
  if (
    !top ||
    top.days.size < USUAL_MIN_DAYS ||
    top.days.size < slotDays.size * USUAL_MIN_SHARE
  )
    return null;
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
  };
}

/* "at snacks" is not English; the slot KEY is not copy. */
const SLOT_PHRASE: Record<MealKey, string> = {
  breakfast: "at breakfast",
  lunch: "at lunch",
  snacks: "at snack time",
  dinner: "at dinner",
};

/** The row's heading, e.g. "Your usual at dinner". */
export function usualMealHeading(slot: MealKey): string {
  return `Your usual ${SLOT_PHRASE[slot]}`;
}

/** The portion shown beside the kcal, or null. A multi-food meal has no
 *  portion of its own — `portionSize` carries a fixed "1 meal" as the unit
 *  the Change-portion sheet multiplies — so the row shows none rather than a
 *  filler that reads like a count ("365 kcal · 1 meal"). */
export function usualMealPortion(usual: QuickAddItem): string | null {
  return usual.bundle ? null : usual.portionSize;
}
