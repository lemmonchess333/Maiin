export type Meal = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: Date;
};

export function calculateDailyTotals(meals: Meal[]) {
  const totals = meals.reduce(
    (acc, meal) => {
      acc.calories += meal.calories;
      acc.protein += meal.protein;
      acc.carbs += meal.carbs;
      acc.fat += meal.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  totals.calories = Math.round(totals.calories);
  totals.protein = Math.round(totals.protein);
  totals.carbs = Math.round(totals.carbs);
  totals.fat = Math.round(totals.fat);
  return totals;
}