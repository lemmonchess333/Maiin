/**
 * The Food page's week: the calendar week holding the day in view, Monday
 * to Sunday as on Home, and how much of each day's calorie target was
 * eaten.
 *
 * Owner call, 2026-09-28: Food keeps its layout and gains a week strip
 * above the calorie card, in the food orange. Home's strip says what was
 * trained on each day; this one says how each day's eating went, so each
 * circle fills as a ring instead of taking a sport's colour.
 *
 * Pure, so the rules below are pinned without a page: which target a day
 * is measured against, what counts as eaten, and which days open.
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
  startOfLocalWeek,
} from "@/lib/dateHelpers";
import { sumMealTotals, type MealTotalsInput } from "@/lib/mealTotals";
import type { DayTarget } from "@/lib/foodDays";

export interface FoodWeekDay {
  /** Local "YYYY-MM-DD". */
  key: string;
  isToday: boolean;
  isSelected: boolean;
  /** After today: nothing has been eaten yet, and the diary cannot open it. */
  isFuture: boolean;
  /** The diary can open this day: from `minKey` to today. */
  isSelectable: boolean;
  /** Calories eaten, from the meals the page has loaded. */
  eaten: number;
  /** The calorie target the day is measured against; null when none is
   *  known, and then the day draws no arc. */
  target: number | null;
  /** Share of the target eaten, 0 to 1. Null without a target. */
  progress: number | null;
  /** How far past the target the day went, as a share of it, capped at 1.
   *  0 when it did not go past. */
  over: number;
}

interface WeekMeal extends MealTotalsInput {
  id: string;
  /** Local "YYYY-MM-DD". */
  date: string;
}

/** The first day of the week holding `dayKey`, as local "YYYY-MM-DD". */
export function foodWeekStart(dayKey: string): string {
  return localDateString(startOfLocalWeek(parseLocalDate(dayKey)));
}

function usable(target: number | null | undefined): number | null {
  return typeof target === "number" && Number.isFinite(target) && target > 0
    ? target
    : null;
}

export function foodWeek({
  selectedKey,
  todayKey,
  minKey,
  meals,
  hiddenMealIds,
  snapshots,
  selectedTarget,
}: {
  /** The day the page is showing. */
  selectedKey: string;
  todayKey: string;
  /** The oldest day the diary can open. */
  minKey: string;
  meals: readonly WeekMeal[];
  /** Meals on their way out (the delete undo window): already gone from
   *  the day's list and its total, so gone from its ring too. */
  hiddenMealIds: ReadonlySet<string>;
  /** Each day's target as it stood that day (`dailyNutrition`). */
  snapshots: ReadonlyMap<string, DayTarget>;
  /** The calorie card's own target for the day in view. */
  selectedTarget: number;
}): FoodWeekDay[] {
  const start = parseLocalDate(foodWeekStart(selectedKey));
  const keys = Array.from({ length: 7 }, (_, i) =>
    localDateString(addLocalDays(start, i))
  );
  const byDay = new Map<string, WeekMeal[]>(keys.map((k) => [k, []]));
  for (const meal of meals) {
    if (hiddenMealIds.has(meal.id)) continue;
    byDay.get(meal.date)?.push(meal);
  }

  return keys.map((key) => {
    const isFuture = key > todayKey;
    const eaten = isFuture ? 0 : sumMealTotals(byDay.get(key) ?? []).calories;
    /* The day in view is measured against the calorie card's target, so
       the strip and the card never disagree about the day on screen. Every
       other day is measured against its target as it stood that day, as
       the page's other readers of past days are (foodDays). The two are
       the same number unless the target has moved since: the calorie
       target is flat across day types, and today's snapshot is written
       from the card's own hook. A day with neither is measured against
       nothing rather than a guess. */
    const target = isFuture
      ? null
      : key === selectedKey
        ? usable(selectedTarget)
        : usable(snapshots.get(key)?.calories);
    const eatenSafe = Math.max(0, eaten);
    return {
      key,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      isFuture,
      isSelectable: key >= minKey && key <= todayKey,
      eaten: eatenSafe,
      target,
      progress: target === null ? null : Math.min(eatenSafe / target, 1),
      over:
        target === null || eatenSafe <= target
          ? 0
          : Math.min((eatenSafe - target) / target, 1),
    };
  });
}
