/**
 * Analyzes meal patterns and provides actionable nutrition insights.
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

export interface NutritionInsight {
  id: string;
  type: "positive" | "warning" | "tip";
  title: string;
  message: string;
  priority: number;
}

export function analyzeNutritionPatterns(
  meals: MealEntry[],
  targets: { calories: number; protein: number; carbs: number; fat: number }
): NutritionInsight[] {
  if (meals.length === 0) return [];

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

  // Check protein consistency
  const dailyProtein = dates.map((d) => {
    const dayMeals = byDate.get(d) || [];
    return dayMeals.reduce((sum, m) => sum + m.protein, 0);
  });
  const avgProtein =
    dailyProtein.reduce((a, b) => a + b, 0) / dailyProtein.length;
  const proteinHitDays = dailyProtein.filter(
    (p) => p >= targets.protein * 0.9
  ).length;

  if (proteinHitDays >= dates.length * 0.8) {
    insights.push({
      id: "protein-consistent",
      type: "positive",
      title: "Protein consistency",
      message: `You hit your protein target ${proteinHitDays}/${dates.length} days. Great consistency!`,
      priority: 1,
    });
  } else if (avgProtein < targets.protein * 0.7) {
    insights.push({
      id: "protein-low",
      type: "warning",
      title: "Low protein intake",
      message: `Averaging ${Math.round(avgProtein)}g protein vs ${targets.protein}g target. Try adding a protein source to each meal.`,
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
      message: `You logged breakfast on ${breakfastCount} of the last ${dates.length} days. A high-protein breakfast can support your goals.`,
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
      message: `Your daily calories vary widely (${Math.round(avgCals - calStdDev)}–${Math.round(avgCals + calStdDev)} kcal). More consistency may help with your goals.`,
      priority: 2,
    });
  }

  // Check if hitting overall targets
  const onTargetDays = dailyCals.filter(
    (c) => c >= targets.calories * 0.85 && c <= targets.calories * 1.15
  ).length;
  if (onTargetDays >= dates.length * 0.7) {
    insights.push({
      id: "calories-on-target",
      type: "positive",
      title: "Great calorie control",
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
