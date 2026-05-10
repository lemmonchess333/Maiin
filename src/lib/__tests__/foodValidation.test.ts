import { describe, it, expect } from 'vitest';
import {
  validateFoodEntry,
  FOOD_WARN_CALORIES,
  FOOD_WARN_PROTEIN_G,
  FOOD_WARN_CARBS_G,
  FOOD_WARN_FAT_G,
} from '../foodValidation';

/* The pre-save validation gate at user-input boundaries (manual
 * logger, NL parser, AI photo). Two verdicts: blocked (negative,
 * NaN, non-finite) and warn (suspicious-but-possible high values
 * that need a Save anyway confirmation). Zero is always allowed —
 * water, black coffee, herbs. */

describe('validateFoodEntry — blocked', () => {
  it('blocks negative calories', () => {
    expect(validateFoodEntry({ calories: -50 })).toEqual({
      kind: 'blocked',
      reason: "Macros can't be negative.",
    });
  });

  it('blocks negative protein / carbs / fat', () => {
    expect(validateFoodEntry({ protein: -1 }).kind).toBe('blocked');
    expect(validateFoodEntry({ carbs: -10 }).kind).toBe('blocked');
    expect(validateFoodEntry({ fat: -0.5 }).kind).toBe('blocked');
  });

  it('blocks NaN with a field-specific message', () => {
    const r = validateFoodEntry({ calories: NaN });
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.reason).toContain('Calories');
  });

  it('blocks Infinity', () => {
    expect(validateFoodEntry({ calories: Infinity }).kind).toBe('blocked');
    expect(validateFoodEntry({ protein: -Infinity }).kind).toBe('blocked');
  });
});

describe('validateFoodEntry — passes', () => {
  it('passes a normal meal', () => {
    expect(validateFoodEntry({ calories: 450, protein: 40, carbs: 45, fat: 12 })).toEqual({ kind: 'ok' });
  });

  it('allows zero values without warning (water, black coffee)', () => {
    expect(validateFoodEntry({ calories: 0, protein: 0, carbs: 0, fat: 0 })).toEqual({ kind: 'ok' });
  });

  it('allows missing macros (manual logger leaves macros blank)', () => {
    expect(validateFoodEntry({ calories: 250 })).toEqual({ kind: 'ok' });
  });

  it('allows the warn-threshold edge exactly', () => {
    /* Threshold is strictly greater-than, so the threshold value
       itself passes — only one above warns. */
    expect(validateFoodEntry({ calories: FOOD_WARN_CALORIES }).kind).toBe('ok');
    expect(validateFoodEntry({ protein: FOOD_WARN_PROTEIN_G }).kind).toBe('ok');
    expect(validateFoodEntry({ carbs: FOOD_WARN_CARBS_G }).kind).toBe('ok');
    expect(validateFoodEntry({ fat: FOOD_WARN_FAT_G }).kind).toBe('ok');
  });
});

describe('validateFoodEntry — warns', () => {
  it('warns at 6000 calories with field-specific copy', () => {
    const r = validateFoodEntry({ calories: 6000 });
    expect(r.kind).toBe('warn');
    if (r.kind === 'warn') {
      expect(r.field).toBe('calories');
      expect(r.title).toContain('6000');
      expect(r.title).toContain('calories');
      expect(r.description).toContain('serving size');
    }
  });

  it('warns at 400g protein', () => {
    const r = validateFoodEntry({ calories: 800, protein: 400 });
    expect(r.kind).toBe('warn');
    if (r.kind === 'warn') {
      expect(r.field).toBe('protein');
      expect(r.title).toContain('400g protein');
    }
  });

  it('warns at 700g carbs', () => {
    const r = validateFoodEntry({ calories: 1000, carbs: 700 });
    expect(r.kind).toBe('warn');
    if (r.kind === 'warn') expect(r.field).toBe('carbs');
  });

  it('warns at 350g fat', () => {
    const r = validateFoodEntry({ calories: 1000, fat: 350 });
    expect(r.kind).toBe('warn');
    if (r.kind === 'warn') expect(r.field).toBe('fat');
  });

  it('surfaces the calorie warning first when multiple fields are over', () => {
    /* Field check order is calories → protein → carbs → fat so the
       most-egregious-by-calorie warning surfaces first rather than
       chaining multiple dialogs. */
    const r = validateFoodEntry({ calories: 6000, protein: 400 });
    expect(r.kind).toBe('warn');
    if (r.kind === 'warn') expect(r.field).toBe('calories');
  });
});
