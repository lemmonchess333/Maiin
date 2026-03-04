export interface ScoreBreakdown {
  calories: number;
  protein: number;
  fiber: number;
  sugar: number;
  sodium: number;
  distribution: number;
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
  }
): { score: number | null; breakdown: ScoreBreakdown } {
  // Need at least 2 meals to calculate
  if (consumed.mealCount < 2) {
    return {
      score: null,
      breakdown: { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, distribution: 0, total: 0 },
    };
  }

  // Calorie adherence (25 pts) — within ±10% of target
  const calRatio = targets.calories > 0 ? consumed.calories / targets.calories : 0;
  const calScore = calRatio >= 0.9 && calRatio <= 1.1
    ? 25
    : Math.max(0, 25 - Math.abs(1 - calRatio) * 50);

  // Protein adherence (25 pts) — within ±10%
  const protRatio = targets.protein > 0 ? consumed.protein / targets.protein : 0;
  const protScore = protRatio >= 0.9 && protRatio <= 1.1
    ? 25
    : Math.max(0, 25 - Math.abs(1 - protRatio) * 50);

  // Fiber (15 pts) — ≥80% of target
  const fiberRatio = targets.fiber > 0 ? consumed.fiber / targets.fiber : 0;
  const fiberScore = fiberRatio >= 0.8 ? 15 : Math.round(fiberRatio * 15 / 0.8);

  // Sugar under limit (10 pts)
  const sugarScore = targets.sugar > 0 && consumed.sugar <= targets.sugar ? 10 : consumed.sugar > 0 ? Math.max(0, 10 - Math.round((consumed.sugar - targets.sugar) / targets.sugar * 20)) : 5;

  // Sodium under limit (10 pts)
  const sodiumScore = targets.sodium > 0 && consumed.sodium <= targets.sodium ? 10 : consumed.sodium > 0 ? Math.max(0, 10 - Math.round((consumed.sodium - targets.sodium) / targets.sodium * 20)) : 5;

  // Meal distribution (15 pts) — 3+ meals
  const distScore = consumed.mealCount >= 3 ? 15 : consumed.mealCount === 2 ? 8 : 0;

  const total = Math.round(
    Math.max(0, Math.min(100, calScore + protScore + fiberScore + sugarScore + sodiumScore + distScore))
  );

  return {
    score: total,
    breakdown: {
      calories: Math.round(calScore),
      protein: Math.round(protScore),
      fiber: Math.round(fiberScore),
      sugar: Math.round(sugarScore),
      sodium: Math.round(sodiumScore),
      distribution: distScore,
      total,
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
