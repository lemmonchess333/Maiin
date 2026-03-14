import { describe, it, expect } from 'vitest';
import { analyzeNutritionPatterns, getMacroBalance, type MealEntry } from '../nutritionInsights';

const targets = { calories: 2500, protein: 180, carbs: 300, fat: 80 };

function makeMeals(days: number, overrides?: Partial<MealEntry>): MealEntry[] {
  const meals: MealEntry[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    meals.push({
      calories: 800,
      protein: 60,
      carbs: 100,
      fat: 25,
      mealType: 'breakfast',
      date,
      ...overrides,
    });
    meals.push({
      calories: 900,
      protein: 65,
      carbs: 110,
      fat: 30,
      mealType: 'lunch',
      date,
      ...overrides,
    });
    meals.push({
      calories: 800,
      protein: 55,
      carbs: 90,
      fat: 25,
      mealType: 'dinner',
      date,
      ...overrides,
    });
  }
  return meals;
}

describe('analyzeNutritionPatterns', () => {
  it('returns empty for no meals', () => {
    expect(analyzeNutritionPatterns([], targets)).toEqual([]);
  });

  it('returns empty for fewer than 3 days', () => {
    const meals = makeMeals(2);
    expect(analyzeNutritionPatterns(meals, targets)).toEqual([]);
  });

  it('detects protein consistency', () => {
    const meals = makeMeals(7);
    const insights = analyzeNutritionPatterns(meals, targets);
    const proteinInsight = insights.find(i => i.id === 'protein-consistent');
    expect(proteinInsight).toBeDefined();
  });

  it('detects low protein intake', () => {
    const meals = makeMeals(7, { protein: 10 });
    const insights = analyzeNutritionPatterns(meals, targets);
    const lowProtein = insights.find(i => i.id === 'protein-low');
    expect(lowProtein).toBeDefined();
    expect(lowProtein!.type).toBe('warning');
  });

  it('detects skipping breakfast', () => {
    const meals: MealEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      meals.push({ calories: 1000, protein: 80, carbs: 120, fat: 30, mealType: 'lunch', date });
      meals.push({ calories: 1000, protein: 80, carbs: 120, fat: 30, mealType: 'dinner', date });
    }
    const insights = analyzeNutritionPatterns(meals, targets);
    const breakfast = insights.find(i => i.id === 'skipping-breakfast');
    expect(breakfast).toBeDefined();
  });

  it('sorts by priority descending', () => {
    const meals = makeMeals(7, { protein: 10 });
    const insights = analyzeNutritionPatterns(meals, targets);
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].priority).toBeGreaterThanOrEqual(insights[i].priority);
    }
  });
});

describe('getMacroBalance', () => {
  it('returns zero for no macros', () => {
    const result = getMacroBalance(0, 0, 0);
    expect(result.proteinPct).toBe(0);
    expect(result.carbsPct).toBe(0);
    expect(result.fatPct).toBe(0);
  });

  it('calculates correct percentages', () => {
    // 200g protein = 800cal, 250g carbs = 1000cal, 70g fat = 630cal
    // Total = 2430cal
    const result = getMacroBalance(200, 250, 70);
    expect(result.proteinPct).toBe(33); // 800/2430
    expect(result.carbsPct).toBe(41);   // 1000/2430
    expect(result.fatPct).toBe(26);     // 630/2430
  });

  it('percentages roughly sum to 100', () => {
    const result = getMacroBalance(180, 300, 80);
    const sum = result.proteinPct + result.carbsPct + result.fatPct;
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});
