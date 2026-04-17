import { describe, it, expect } from 'vitest';
import { calcDailyBurn, estimateStepCalories } from '../dailyBurn';

describe('calcDailyBurn', () => {
  // After the B1 unification (Prompt 1), calcDailyBurn takes the stored
  // profile.targetCalories as its base. That value already includes the
  // user's activity-level-aware TDEE and the phase deficit (from
  // calculateTDEE), so this function simply sums the base with on-top
  // burn sources (workouts, runs, steps). No NEAT, no goal offset.

  it('returns the base when no activity is supplied', () => {
    const result = calcDailyBurn(1887, 'cut', 0, 0, 0);
    expect(result.phaseAdjustedTdee).toBe(1887);
    expect(result.dailyBudget).toBe(1887);
    expect(result.phaseLabel).toBe('cut');
  });

  it('adds workout calories on top of the base', () => {
    const result = calcDailyBurn(2400, 'lean bulk', 400, 0, 0);
    expect(result.phaseAdjustedTdee).toBe(2400);
    expect(result.dailyBudget).toBe(2800);
    expect(result.phaseLabel).toBe('bulk');
  });

  it('sums all activity sources with the base', () => {
    const result = calcDailyBurn(2200, 'recomp', 300, 200, 100);
    expect(result.phaseAdjustedTdee).toBe(2200);
    expect(result.dailyBudget).toBe(2800);
    expect(result.phaseLabel).toBe('recomp');
    expect(result.workoutCalories).toBe(300);
    expect(result.runCalories).toBe(200);
    expect(result.stepCalories).toBe(100);
  });

  it('returns the correct phase value across all three phases', () => {
    expect(calcDailyBurn(1800, 'cut', 0, 0, 0).phase).toBe('cut');
    expect(calcDailyBurn(2200, 'recomp', 0, 0, 0).phase).toBe('recomp');
    expect(calcDailyBurn(2700, 'lean bulk', 0, 0, 0).phase).toBe('lean bulk');
  });

  it('does not re-apply the phase deficit (it is already baked into targetCalories)', () => {
    // Regression guard: the old implementation computed bmr*1.2 + phase_offset,
    // which on cut would subtract 500 again. The new impl takes targetCalories
    // as-is. A cut user with targetCalories=1,887 and no activity should see
    // dailyBudget=1,887 — not 1,387.
    const result = calcDailyBurn(1887, 'cut', 0, 0, 0);
    expect(result.dailyBudget).toBe(1887);
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
