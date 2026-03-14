export interface ScoreBreakdown {
  workouts: number;
  nutrition: number;
  water: number;
  activity: number;
  total: number;
}

export function calculateHealthScore(
  consumed: {
    calories: number;
    protein: number;
    fiber: number;
    sugar: number;
    sodium: number;
    mealCount: number;
  },
  targets: {
    calories: number;
    protein: number;
    fiber: number;
    sugar: number;
    sodium: number;
  },
  extra?: {
    workoutsToday?: number;
    waterGlasses?: number;
    waterTarget?: number;
    steps?: number;
    stepsTarget?: number;
  }
): { score: number | null; breakdown: ScoreBreakdown } {
  const e = extra ?? {};
  const hasAnyData = consumed.mealCount > 0 || (e.workoutsToday ?? 0) > 0 || (e.waterGlasses ?? 0) > 0;
  if (!hasAnyData) {
    return { score: null, breakdown: { workouts: 0, nutrition: 0, water: 0, activity: 0, total: 0 } };
  }

  // Weights: workouts 35%, nutrition 30%, water 15%, activity 20%
  // If a category has no data, redistribute its weight proportionally

  // --- Workouts (35 pts) ---
  const hasWorkout = (e.workoutsToday ?? 0) > 0;
  const workoutScore = hasWorkout ? 35 : 0;

  // --- Nutrition (30 pts) ---
  let nutritionScore = 0;
  if (consumed.mealCount >= 1 && targets.calories > 0) {
    const calRatio = consumed.calories / targets.calories;
    const calPts = calRatio >= 0.9 && calRatio <= 1.1
      ? 15 : Math.max(0, 15 - Math.abs(1 - calRatio) * 30);
    const protRatio = targets.protein > 0 ? consumed.protein / targets.protein : 0;
    const protPts = protRatio >= 0.9 && protRatio <= 1.1
      ? 15 : Math.max(0, 15 - Math.abs(1 - protRatio) * 30);
    nutritionScore = Math.round(calPts + protPts);
  }

  // --- Water (15 pts) ---
  const waterTarget = e.waterTarget ?? 8;
  const waterGlasses = e.waterGlasses ?? 0;
  const hasWater = waterGlasses > 0;
  const waterScore = hasWater ? Math.min(15, Math.round((waterGlasses / waterTarget) * 15)) : 0;

  // --- Activity / Steps (20 pts) ---
  const stepsTarget = e.stepsTarget ?? 10000;
  const steps = e.steps ?? 0;
  const hasSteps = steps > 0;
  const activityScore = hasSteps ? Math.min(20, Math.round((steps / stepsTarget) * 20)) : 0;

  // Redistribution: if a category isn't available, spread its weight to others
  const categories = [
    { score: workoutScore, max: 35, available: hasWorkout },
    { score: nutritionScore, max: 30, available: consumed.mealCount >= 1 },
    { score: waterScore, max: 15, available: hasWater },
    { score: activityScore, max: 20, available: hasSteps },
  ];

  const availableMax = categories.filter(c => c.available).reduce((s, c) => s + c.max, 0);
  const rawTotal = categories.filter(c => c.available).reduce((s, c) => s + c.score, 0);
  const total = availableMax > 0 ? Math.round((rawTotal / availableMax) * 100) : 0;

  return {
    score: Math.max(0, Math.min(100, total)),
    breakdown: {
      workouts: Math.round(workoutScore),
      nutrition: Math.round(nutritionScore),
      water: Math.round(waterScore),
      activity: Math.round(activityScore),
      total: Math.max(0, Math.min(100, total)),
    },
  };
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#34D399";
  if (score >= 60) return "#FFB547";
  if (score >= 40) return "#f97316";
  return "#EF4444";
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Work";
}
