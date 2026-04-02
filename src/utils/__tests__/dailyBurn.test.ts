import { describe, it, expect } from 'vitest';
import { calcDailyBurn, estimateStepCalories } from '../dailyBurn';

describe('calcDailyBurn', () => {
  it('calculates sedentary cut correctly', () => {
    const result = calcDailyBurn(1800, 'sedentary', 'cut', 0, 0, 0);
    expect(result.bmr).toBe(1800);
    expect(result.tdee).toBe(Math.round(1800 * 1.2)); // 2160
    expect(result.phaseAdjustedTdee).toBe(2160 - 500); // 1660
    expect(result.dailyBudget).toBe(1660);
    expect(result.phaseLabel).toBe('cut');
  });

  it('calculates active lean bulk with workout calories', () => {
    const result = calcDailyBurn(2000, 'active', 'lean bulk', 400, 0, 0);
    expect(result.tdee).toBe(Math.round(2000 * 1.725)); // 3450
    expect(result.phaseAdjustedTdee).toBe(3450 + 300); // 3750
    expect(result.dailyBudget).toBe(3750 + 400); // 4150
    expect(result.phaseLabel).toBe('bulk');
  });

  it('calculates recomp with all calorie sources', () => {
    const result = calcDailyBurn(1900, 'moderate', 'recomp', 300, 200, 100);
    expect(result.tdee).toBe(Math.round(1900 * 1.55)); // 2945
    expect(result.phaseAdjustedTdee).toBe(2945 + 0); // recomp = 0 offset
    expect(result.dailyBudget).toBe(2945 + 300 + 200 + 100); // 3545
    expect(result.phaseLabel).toBe('recomp');
    expect(result.workoutCalories).toBe(300);
    expect(result.runCalories).toBe(200);
    expect(result.stepCalories).toBe(100);
  });

  it('returns correct phase value', () => {
    expect(calcDailyBurn(1800, 'sedentary', 'cut', 0, 0, 0).phase).toBe('cut');
    expect(calcDailyBurn(1800, 'sedentary', 'recomp', 0, 0, 0).phase).toBe('recomp');
    expect(calcDailyBurn(1800, 'sedentary', 'lean bulk', 0, 0, 0).phase).toBe('lean bulk');
  });

  it('handles all activity levels', () => {
    const levels = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
    const multipliers = [1.2, 1.375, 1.55, 1.725, 1.9];
    levels.forEach((level, i) => {
      const result = calcDailyBurn(2000, level, 'recomp', 0, 0, 0);
      expect(result.tdee).toBe(Math.round(2000 * multipliers[i]));
    });
  });
});

describe('estimateStepCalories', () => {
  it('estimates correctly for a 70kg person', () => {
    const result = estimateStepCalories(10000, 70);
    // 0.04 * (70/70) = 0.04 per step → 400 cals
    expect(result).toBe(400);
  });

  it('scales with body weight', () => {
    const light = estimateStepCalories(10000, 50);
    const heavy = estimateStepCalories(10000, 100);
    expect(heavy).toBeGreaterThan(light);
  });

  it('returns 0 for 0 steps', () => {
    expect(estimateStepCalories(0, 80)).toBe(0);
  });

  it('rounds to integer', () => {
    const result = estimateStepCalories(1234, 65);
    expect(Number.isInteger(result)).toBe(true);
  });
});
