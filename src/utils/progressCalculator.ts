export function calculateProgress({
  bodyweightTrend,
  userGoal,
}: {
  bodyweightTrend: number[];
  userGoal: "lean bulk" | "cut" | "recomp";
}) {
  const weightChange = bodyweightTrend.length > 0
    ? bodyweightTrend.reduce((sum, change) => sum + change, 0)
    : 0;

  let calorieBase = 2200;
  if (userGoal === "lean bulk") calorieBase += 200;
  if (userGoal === "cut") calorieBase -= 300;

  calorieBase += Math.round(weightChange * 20);

  const macros = {
    protein: Math.round((calorieBase * 0.40) / 4),
    carbs: Math.round((calorieBase * 0.40) / 4),
    fat: Math.round((calorieBase * 0.20) / 9),
  };

  return {
    calorieBase,
    weightChange,
    macros,
  };
}