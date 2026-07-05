/**
 * Analyzes meal patterns and provides actionable nutrition insights.
 *
 * NUTR-L4 (#1107): a past day's target is day-type-dependent (taper weeks,
 * adaptive-TDEE steps, target edits) and can't be faithfully re-derived later
 * — the same principle the nutrition badges follow (dailyNutritionSnapshot.ts).
 * `targetsByDate` carries the per-day snapshotted targets; each day is judged
 * against the target as it stood ON that day, falling back to the flat
 * `targets` for days with no snapshot (pre-feature history).
 */

export interface MealEntry {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  date: string;
  time?: string;
}

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionInsight {
  id: string;
  type: "positive" | "warning" | "tip";
  title: string;
  message: string;
  priority: number;
}

export function analyzeNutritionPatterns(
  meals: MealEntry[],
  targets: DailyTargets,
  /** date → the target snapshotted ON that day (users/{uid}/dailyNutrition). */
  targetsByDate?: ReadonlyMap<string, DailyTargets>
): NutritionInsight[] {
  if (meals.length === 0) return [];

  // Per-day target resolution: the day's snapshot when it exists and carries a
  // usable (positive) value for the field, else the flat fallback. A snapshot
  // with a zero field (e.g. legacy doc missing targetCalories) must not judge
  // every intake as an automatic hit/miss.
  const targetFor = (date: string): DailyTargets => {
    const snap = targetsByDate?.get(date);
    if (!snap) return targets;
    return {
      calories: snap.calories > 0 ? snap.calories : targets.calories,
      protein: snap.protein > 0 ? snap.protein : targets.protein,
      carbs: snap.carbs > 0 ? snap.carbs : targets.carbs,
      fat: snap.fat > 0 ? snap.fat : targets.fat,
    };
  };

  const insights: NutritionInsight[] = [];

  // Group meals by date
  const byDate = new Map<string, MealEntry[]>();
  for (const meal of meals) {
    const existing = byDate.get(meal.date) || [];
    existing.push(meal);
    byDate.set(meal.date, existing);
  }

  const dates = Array.from(byDate.keys()).sort().slice(-7);
  if (dates.length < 3) return insights;

  // Check protein consistency — each day against ITS OWN target (NUTR-L4).
  const dailyProtein = dates.map((d) => {
    const dayMeals = byDate.get(d) || [];
    return dayMeals.reduce((sum, m) => sum + m.protein, 0);
  });
  const avgProtein =
    dailyProtein.reduce((a, b) => a + b, 0) / dailyProtein.length;
  const avgProteinTarget =
    dates.reduce((sum, d) => sum + targetFor(d).protein, 0) / dates.length;
  const proteinHitDays = dailyProtein.filter(
    (p, i) => p >= targetFor(dates[i]).protein * 0.9
  ).length;

  if (proteinHitDays >= dates.length * 0.8) {
    insights.push({
      id: "protein-consistent",
      type: "positive",
      title: "Protein consistency",
      message: `You hit your protein target ${proteinHitDays} of the last ${dates.length} days.`,
      priority: 1,
    });
  } else if (avgProtein < avgProteinTarget * 0.7) {
    insights.push({
      id: "protein-low",
      type: "warning",
      title: "Low protein intake",
      message: `Averaging ${Math.round(avgProtein)}g protein vs ${Math.round(avgProteinTarget)}g target. Add a protein source to each meal.`,
      priority: 3,
    });
  }

  // Check meal timing distribution
  const mealTypes = new Map<string, number>();
  for (const meal of meals.filter((m) => dates.includes(m.date))) {
    mealTypes.set(meal.mealType, (mealTypes.get(meal.mealType) || 0) + 1);
  }

  const breakfastCount = mealTypes.get("breakfast") || 0;
  const breakfastThreshold = Math.ceil(dates.length * 0.3);
  if (breakfastCount < breakfastThreshold) {
    insights.push({
      id: "skipping-breakfast",
      type: "tip",
      title: "Breakfast pattern",
      message: `You logged breakfast on ${breakfastCount} of the last ${dates.length} days. A protein-rich breakfast helps recovery.`,
      priority: 2,
    });
  }

  // Check calorie consistency
  const dailyCals = dates.map((d) => {
    const dayMeals = byDate.get(d) || [];
    return dayMeals.reduce((sum, m) => sum + m.calories, 0);
  });
  const avgCals = dailyCals.reduce((a, b) => a + b, 0) / dailyCals.length;
  const calVariance =
    dailyCals.reduce((sum, c) => sum + Math.pow(c - avgCals, 2), 0) /
    dailyCals.length;
  const calStdDev = Math.sqrt(calVariance);

  if (calStdDev > avgCals * 0.3 && avgCals > 0) {
    insights.push({
      id: "calorie-inconsistent",
      type: "tip",
      title: "Calorie swings",
      message: `Your daily calories vary widely (${Math.round(avgCals - calStdDev)}–${Math.round(avgCals + calStdDev)} kcal). Steadier intake makes your trends easier to read.`,
      priority: 2,
    });
  }

  // Check if hitting overall targets — per-day calories (NUTR-L4), so a taper
  // week's contracted target or an adaptive-TDEE step isn't judged against
  // today's number. (The calorie-swings check above stays anchored on raw
  // intake: it's a logging/trend-readability signal, deliberately
  // target-agnostic.)
  const onTargetDays = dailyCals.filter((c, i) => {
    const dayCals = targetFor(dates[i]).calories;
    return c >= dayCals * 0.85 && c <= dayCals * 1.15;
  }).length;
  if (onTargetDays >= dates.length * 0.7) {
    insights.push({
      id: "calories-on-target",
      type: "positive",
      title: "Consistent calories",
      message: `You were within 15% of your calorie target on ${onTargetDays}/${dates.length} days.`,
      priority: 1,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

export function getMacroBalance(
  protein: number,
  carbs: number,
  fat: number
): { proteinPct: number; carbsPct: number; fatPct: number } {
  const totalCals = protein * 4 + carbs * 4 + fat * 9;
  if (totalCals === 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  return {
    proteinPct: Math.round(((protein * 4) / totalCals) * 100),
    carbsPct: Math.round(((carbs * 4) / totalCals) * 100),
    fatPct: Math.round(((fat * 9) / totalCals) * 100),
  };
}
