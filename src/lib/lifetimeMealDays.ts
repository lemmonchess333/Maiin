/**
 * Lifetime food days (`foodDay.ts`) from two sources laid over each other.
 *
 * History already holds a live window of the newest meals (`useMeals`). For
 * an account whose every meal fits in that window, the window is the whole
 * answer and nothing else needs reading. For a longer-standing account the
 * older meals are read once and the window is laid over them, so a meal
 * logged, binned or restored a moment ago shows without reading everything
 * again.
 *
 * Pure: the hook (`useLifetimeMealStats`) owns the reads.
 */
import { isFoodDay } from "@/lib/foodDay";
import { isActiveMealDoc, sumMealTotals } from "@/lib/mealTotals";

export interface LifetimeMealStats {
  mealCount: number;
  /** The food days (`foodDay.ts`): distinct local dates whose kept meals
   *  reach 800 kcal. */
  daysLogged: number;
}

/** What a lifetime total needs of one meal: its day, its calories and
 *  whether it was kept. */
export interface MealDay {
  date: string | null;
  calories: number;
  kept: boolean;
}

/** A meal as the live window holds it. */
export interface WindowMeal {
  id: string;
  date?: unknown;
  totalCalories?: number;
}

const dayOf = (date: unknown): string | null =>
  typeof date === "string" ? date : null;

/** A meal's calories, with an older meal's bare `calories` field, as every
 *  day's total reads them (`sumMealTotals`). */
const caloriesOf = (meal: { totalCalories?: unknown; calories?: unknown }) =>
  sumMealTotals([
    {
      totalCalories:
        typeof meal.totalCalories === "number" ? meal.totalCalories : undefined,
      calories: typeof meal.calories === "number" ? meal.calories : undefined,
    },
  ]).calories;

/** One stored meal document, reduced to its day, its calories and whether
 *  it was kept. */
export function mealDay(doc: {
  date?: unknown;
  deletedAt?: unknown;
  totalCalories?: unknown;
  calories?: unknown;
}): MealDay {
  return {
    date: dayOf(doc.date),
    calories: caloriesOf(doc),
    kept: isActiveMealDoc(doc),
  };
}

/**
 * `older` with the live window over it. The window is newer for every meal
 * it holds: one binned since `older` was read stops counting, one restored
 * counts again, and one logged since is added. A meal `older` holds and the
 * window does not is left as it was read. Its absence from a window that
 * stops at the newest few hundred says nothing about it.
 */
export function overlayWindow(
  older: ReadonlyMap<string, MealDay>,
  kept: readonly WindowMeal[],
  binned: readonly WindowMeal[]
): Map<string, MealDay> {
  const all = new Map(older);
  for (const meal of kept) {
    all.set(meal.id, {
      date: dayOf(meal.date),
      calories: caloriesOf(meal),
      kept: true,
    });
  }
  for (const meal of binned) {
    all.set(meal.id, {
      date: dayOf(meal.date),
      calories: caloriesOf(meal),
      kept: false,
    });
  }
  return all;
}

/** Soft-deleted meals do not count: the tile says what was logged and kept.
 *  A day counts once its kept meals make it a food day. */
export function lifetimeMealStats(
  meals: ReadonlyMap<string, MealDay>
): LifetimeMealStats {
  let mealCount = 0;
  const days = new Map<string, number>();
  for (const meal of meals.values()) {
    if (!meal.kept) continue;
    mealCount += 1;
    if (meal.date !== null)
      days.set(meal.date, (days.get(meal.date) ?? 0) + meal.calories);
  }
  let daysLogged = 0;
  for (const calories of days.values()) if (isFoodDay(calories)) daysLogged++;
  return { mealCount, daysLogged };
}
