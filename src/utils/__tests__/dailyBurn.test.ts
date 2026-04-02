import { describe, it, expect } from 'vitest';
import { calcDailyBurn, estimateStepCalories } from '../dailyBurn';

describe('calcDailyBurn', () => {
  // NEAT multiplier is always 1.2 (no activity level — exercise added explicitly)

  it('calculates cut correctly with NEAT base', () => {
    const result = calcDailyBurn(1800, 'cut', 0, 0, 0);
    expect(result.bmr).toBe(1800);
    expect(result.tdee).toBe(Math.round(1800 * 1.2)); // 2160
    expect(result.phaseAdjustedTdee).toBe(2160 - 500); // 1660
    expect(result.dailyBudget).toBe(1660);
    expect(result.phaseLabel).toBe('cut');
  });

  it('calculates lean bulk with workout calories on top of NEAT base', () => {
    const result = calcDailyBurn(2000, 'lean bulk', 400, 0, 0);
    expect(result.tdee).toBe(Math.round(2000 * 1.2)); // 2400
    expect(result.phaseAdjustedTdee).toBe(2400 + 300); // 2700
    expect(result.dailyBudget).toBe(2700 + 400); // 3100
    expect(result.phaseLabel).toBe('bulk');
  });

  it('calculates recomp with all calorie sources', () => {
    const result = calcDailyBurn(1900, 'recomp', 300, 200, 100);
    expect(result.tdee).toBe(Math.round(1900 * 1.2)); // 2280
    expect(result.phaseAdjustedTdee).toBe(2280 + 0); // recomp = 0 offset
    expect(result.dailyBudget).toBe(2280 + 300 + 200 + 100); // 2880
    expect(result.phaseLabel).toBe('recomp');
    expect(result.workoutCalories).toBe(300);
    expect(result.runCalories).toBe(200);
    expect(result.stepCalories).toBe(100);
  });

  it('returns correct phase value', () => {
    expect(calcDailyBurn(1800, 'cut', 0, 0, 0).phase).toBe('cut');
    expect(calcDailyBurn(1800, 'recomp', 0, 0, 0).phase).toBe('recomp');
    expect(calcDailyBurn(1800, 'lean bulk', 0, 0, 0).phase).toBe('lean bulk');
  });

  it('no longer double-counts: same BMR gives lower budget than old activity-multiplied version', () => {
    // Old "moderate" would give 1900*1.55=2945, new gives 1900*1.2=2280
    // With 300 workout cals: old=3245, new=2580
    const result = calcDailyBurn(1900, 'recomp', 300, 0, 0);
    expect(result.dailyBudget).toBe(2280 + 300); // 2580, not 3245
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
