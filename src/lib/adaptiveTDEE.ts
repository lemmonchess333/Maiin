/**
 * Adaptive TDEE Algorithm
 *
 * Back-calculates real TDEE from weight trends + calorie intake.
 * Adjusts macro targets weekly to keep users on track for their goal.
 */

export interface TDEECalculation {
  estimatedTDEE: number;
  adjustedCalories: number;
  adjustedProtein: number;
  adjustedCarbs: number;
  adjustedFat: number;
  confidence: "low" | "medium" | "high";
  weeklyWeightChange: number;
  targetWeightChange: number;
}

interface WeightLog {
  date: string;
  weight: number;
}

interface CalorieLog {
  date: string;
  calories: number;
}

function getTargetWeeklyChange(goal: string): number {
  switch (goal) {
    case "lean bulk":
    case "bulk":
      return 0.3; // +0.3 kg/week
    case "cut":
      return -0.5; // -0.5 kg/week
    case "maintain":
    case "recomp":
    default:
      return 0;
  }
}

export function linearTrend(weights: WeightLog[]): number {
  if (weights.length < 2) return 0;
  const n = weights.length;
  const xs = weights.map((_, i) => i);
  const ys = weights.map((w) => w.weight);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function calculateAdaptiveTDEE(
  weightLogs: WeightLog[],
  calorieLogs: CalorieLog[],
  goal: string,
  currentTargets: { calories: number; protein: number; carbs: number; fat: number },
  weightKg: number,
): TDEECalculation {
  const targetWeightChange = getTargetWeeklyChange(goal);

  // Need at least 2 weeks of data with overlapping date ranges
  if (weightLogs.length < 4 || calorieLogs.length < 7) {
    return {
      estimatedTDEE: currentTargets.calories,
      adjustedCalories: currentTargets.calories,
      adjustedProtein: currentTargets.protein,
      adjustedCarbs: currentTargets.carbs,
      adjustedFat: currentTargets.fat,
      confidence: "low",
      weeklyWeightChange: 0,
      targetWeightChange,
    };
  }

  // Verify weight and calorie logs overlap in time (at least 7 days)
  const weightDates = weightLogs.map(w => new Date(w.date).getTime());
  const calDates = calorieLogs.map(c => new Date(c.date).getTime());
  const overlapStart = Math.max(Math.min(...weightDates), Math.min(...calDates));
  const overlapEnd = Math.min(Math.max(...weightDates), Math.max(...calDates));
  const overlapDays = (overlapEnd - overlapStart) / 86400000;
  if (overlapDays < 7) {
    return {
      estimatedTDEE: currentTargets.calories,
      adjustedCalories: currentTargets.calories,
      adjustedProtein: currentTargets.protein,
      adjustedCarbs: currentTargets.carbs,
      adjustedFat: currentTargets.fat,
      confidence: "low",
      weeklyWeightChange: 0,
      targetWeightChange,
    };
  }

  // Recent 14 days of calorie data — sort descending to ensure most recent first
  const recentCalories = [...calorieLogs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 14);
  const avgDailyCalories =
    recentCalories.reduce((s, m) => s + m.calories, 0) / Math.max(recentCalories.length, 1);

  // Weight trend (daily slope) — sort chronologically first, then take most recent 14
  const recentWeights = [...weightLogs]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-14);
  const dailySlope = linearTrend(recentWeights);
  const weeklyWeightChange = dailySlope * 7;

  // Back-calculate TDEE: 1kg body weight ~ 7700 kcal
  const dailySurplusDeficit = (weeklyWeightChange * 7700) / 7;
  const estimatedTDEE = Math.round(avgDailyCalories - dailySurplusDeficit);

  // New calorie target based on goal
  const targetDailyDelta = (targetWeightChange * 7700) / 7;
  const adjustedCalories = Math.round(estimatedTDEE + targetDailyDelta);

  // Distribute macros
  const bw = Math.max(weightKg, 50);
  const proteinGrams = Math.round(bw * 2.0);
  const proteinCals = proteinGrams * 4;
  const fatCals = Math.round(adjustedCalories * 0.25);
  const fatGrams = Math.round(fatCals / 9);
  const carbCals = Math.max(adjustedCalories - proteinCals - fatCals, 200);
  const carbGrams = Math.round(carbCals / 4);

  const confidence: TDEECalculation["confidence"] =
    recentCalories.length >= 12 && recentWeights.length >= 10
      ? "high"
      : recentCalories.length >= 7
        ? "medium"
        : "low";

  return {
    estimatedTDEE,
    adjustedCalories,
    adjustedProtein: proteinGrams,
    adjustedCarbs: carbGrams,
    adjustedFat: fatGrams,
    confidence,
    weeklyWeightChange,
    targetWeightChange,
  };
}
