export type Meal = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: Date;
};

export function calculateDailyTotals(meals: Meal[]) {
  return meals.reduce(
    (acc, meal) => {
      acc.calories += meal.calories;
      acc.protein += meal.protein;
      acc.carbs += meal.carbs;
      acc.fat += meal.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}