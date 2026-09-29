/**
 * How a range's days of eating went, one day at a time: how many landed
 * on that day's calorie target, how many met protein, and whether the
 * weekend eats differently from the week.
 *
 * The Food page stated averages. An average of 2,200 against a 2,350
 * target reads as close, and can be a fortnight of 1,700-calorie weekdays
 * and 3,400-calorie Saturdays. Counting days answers the question an
 * average hides, and it is how the apps people cut and bulk with report
 * adherence.
 *
 * Each day is judged against ITS target, the snapshot written that day
 * (`dailyNutrition`), because a lift day's target is not a rest day's. A
 * day with no snapshot is judged against nothing, and today is left out:
 * it is not over, and half a day of eating is not a miss.
 */

/** A day's target, as it stood that day. */
export interface DayTarget {
  calories: number;
  protein: number;
}

interface DayMeal {
  /** Local "YYYY-MM-DD". */
  date: string;
  totalCalories?: number;
  totalProtein?: number;
}

/** "On target" is within this fraction of the day's calories. */
export const CALORIE_TARGET_BAND = 0.1;
/** The fewest days of each kind a weekday-weekend comparison needs. */
export const MIN_WEEKEND_DAYS = 2;
export const MIN_WEEKDAYS = 3;

export interface FoodDaysReading {
  /** Finished logged days with a calorie target, and how many were within
   *  the band of it. */
  calories: { onTarget: number; judged: number };
  /** Finished logged days with a protein target, and how many met it. */
  protein: { met: number; judged: number };
  /** Average calories on logged weekend and weekdays, when there are
   *  enough of each to compare. */
  weekendCalories: number | null;
  weekdayCalories: number | null;
  /** Average protein a day over the finished logged days, or null before
   *  there is one. The protein per kilogram row reads it, so it counts the
   *  same days as the rows beside it. */
  averageProtein: number | null;
}

function isWeekend(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

export function foodDaysReading({
  meals,
  targets,
  sinceKey,
  todayKey,
}: {
  meals: readonly DayMeal[];
  targets: ReadonlyMap<string, DayTarget>;
  sinceKey: string;
  todayKey: string;
}): FoodDaysReading {
  const totals = new Map<string, { calories: number; protein: number }>();
  for (const m of meals) {
    if (m.date < sinceKey || m.date >= todayKey) continue;
    const day = totals.get(m.date) ?? { calories: 0, protein: 0 };
    day.calories += Number.isFinite(m.totalCalories) ? m.totalCalories! : 0;
    day.protein += Number.isFinite(m.totalProtein) ? m.totalProtein! : 0;
    totals.set(m.date, day);
  }

  const calories = { onTarget: 0, judged: 0 };
  const protein = { met: 0, judged: 0 };
  const weekend: number[] = [];
  const weekday: number[] = [];
  const dayProtein: number[] = [];
  for (const [date, day] of totals) {
    // A day logged as nothing is a day not logged.
    if (day.calories <= 0) continue;
    dayProtein.push(day.protein);
    const target = targets.get(date);
    if (target && target.calories > 0) {
      calories.judged += 1;
      if (
        Math.abs(day.calories - target.calories) / target.calories <=
        CALORIE_TARGET_BAND
      ) {
        calories.onTarget += 1;
      }
    }
    if (target && target.protein > 0) {
      protein.judged += 1;
      if (day.protein >= target.protein) protein.met += 1;
    }
    (isWeekend(date) ? weekend : weekday).push(day.calories);
  }

  const mean = (xs: number[]) =>
    Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const comparable =
    weekend.length >= MIN_WEEKEND_DAYS && weekday.length >= MIN_WEEKDAYS;
  return {
    calories,
    protein,
    weekendCalories: comparable ? mean(weekend) : null,
    weekdayCalories: comparable ? mean(weekday) : null,
    averageProtein: dayProtein.length
      ? dayProtein.reduce((a, b) => a + b, 0) / dayProtein.length
      : null,
  };
}
