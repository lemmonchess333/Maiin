// src/utils/progressCalculator.ts

export function calculateProgress({
  workoutsDone,
  bodyweightTrend,
  userGoal,
}: {
  workoutsDone: Array<{ exerciseName: string; sets: Array<{ reps: number; weightKg: number }> }>;
  bodyweightTrend: number[];
  userGoal: "lean bulk" | "cut" | "recomp";
}) {
  // Calculate workout volume for squat/bench/deadlift
  const liftNames = ["squat", "bench", "deadlift"];
  const liftProgress = liftNames.reduce((summary, lift) => {
    const totalVolume = workoutsDone
      .filter((w) => w.exerciseName.toLowerCase() === lift)
      .reduce((sum, w) => {
        return sum + w.sets.reduce((s, set) => s + set.reps * set.weightKg, 0);
      }, 0);

    summary[lift] = totalVolume;
    return summary;
  }, {} as { [key: string]: number });

  // Calculate weight change (7-day trend)
  const weightChange = bodyweightTrend.slice(-7).reduce((sum, change) => sum + change, 0);

  // Adjust calories based on goal
  let calorieBase = 2200; // Default baseline
  if (userGoal === "lean bulk") calorieBase += 200;
  if (userGoal === "cut") calorieBase -= 300;

  // Add adjustment for weight change
  calorieBase += weightChange * 20; // e.g., +20 calories per kg gained/lost

  // Calculate macros (40% protein, 40% carbs, 20% fat)
  const macros = {
    protein: Math.round((calorieBase * 0.40) / 4), // Protein 1g = 4kcal
    carbs: Math.round((calorieBase * 0.40) / 4),  // Carbs 1g = 4kcal
    fat: Math.round((calorieBase * 0.20) / 9),    // Fat 1g = 9kcal
  };

  return {
    liftProgress,
    calorieBase,
    weightChange,
    macros,
  };
}