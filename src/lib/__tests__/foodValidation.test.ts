import { describe, it, expect } from 'vitest';
import {
  validateFoodEntry,
  FOOD_WARN_CALORIES,
  FOOD_WARN_PROTEIN_G,
  FOOD_WARN_CARBS_G,
  FOOD_WARN_FAT_G,
  AGGREGATE_VS_TARGET_RATIO,
  checkAggregateAgainstTarget,
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

describe('checkAggregateAgainstTarget — AI/photo aggregate sanity', () => {
  /* Catches AI scans whose total calories exceed 150% of the
     user's effective daily target — a hallucinated or
     misidentified meal that summed to more than a full day's
     food in one photo. Returns null when the check doesn't
     apply so callers fall through to their normal save path. */

  it('returns null for a normal AI scan well under target', () => {
    /* 1200 cal scan against a 2200 cal target — sane meal. */
    expect(checkAggregateAgainstTarget(1200, 2200)).toBeNull();
  });

  it('returns null at exactly 1.0× target', () => {
    /* A whole-day meal is large but possible (recipe batch, big
       Sunday dinner). Threshold is 150%, not 100%. */
    expect(checkAggregateAgainstTarget(2200, 2200)).toBeNull();
  });

  it('returns null at exactly 1.5× target (boundary inclusive)', () => {
    /* Threshold is strictly greater-than. A scan that equals the
       limit doesn't surface the warning — only one above it. */
    expect(checkAggregateAgainstTarget(3300, 2200)).toBeNull();
  });

  it('warns when aggregate exceeds 1.5× target', () => {
    /* The screenshot case: 5,700 cal AI scan against a 4,033
       cal target. 4033 × 1.5 = 6049.5 — actually within band
       for a high-target user. Use a default-target user
       (2200) where 5,700 > 3,300 fires. */
    const r = checkAggregateAgainstTarget(5700, 2200);
    expect(r).not.toBeNull();
    expect(r?.title).toBe('This meal looks unusually high');
    expect(r?.description).toContain('5700');
    expect(r?.description).toContain("over a full day's target");
  });

  it('rounds non-integer aggregates in the description copy', () => {
    /* AI multipliers can produce fractional totals (e.g. 1.5×
       a 2400-cal item). The dialog should show a clean integer
       so it doesn't read as "5700.5 kcal". */
    const r = checkAggregateAgainstTarget(5700.7, 2200);
    expect(r?.description).toContain('5701');
    expect(r?.description).not.toContain('.7');
  });

  it('returns null when the target is missing or zero', () => {
    /* Defensive — never break save flow if the parent component
       hasn't finished loading the daily target yet. */
    expect(checkAggregateAgainstTarget(5700, undefined)).toBeNull();
    expect(checkAggregateAgainstTarget(5700, 0)).toBeNull();
    expect(checkAggregateAgainstTarget(5700, NaN)).toBeNull();
  });

  it('returns null for non-finite or non-positive aggregates', () => {
    expect(checkAggregateAgainstTarget(NaN, 2200)).toBeNull();
    expect(checkAggregateAgainstTarget(0, 2200)).toBeNull();
    expect(checkAggregateAgainstTarget(-100, 2200)).toBeNull();
  });

  it('threshold ratio is exactly 1.5', () => {
    /* Pin the constant so a future tweak goes through this test
       deliberately rather than as a silent threshold drift. */
    expect(AGGREGATE_VS_TARGET_RATIO).toBe(1.5);
  });

  it('a 3500 cal scan on a 2200 cal target fires (the screenshot gap)', () => {
    /* Pre-Part-2 the per-entry threshold (5000 cal) let a 3500
       cal AI scan slip through silently. Target-relative
       (1.5 × 2200 = 3300) catches it. */
    const r = checkAggregateAgainstTarget(3500, 2200);
    expect(r).not.toBeNull();
  });

  it('respects day-type fuel adjustments through the effective target', () => {
    /* effectiveDailyTarget already includes the day's
       effectiveBonus (lift +400, run +200 etc) — a 3,500 cal
       scan on a +400 lift day (effective 2600) compares
       against 1.5 × 2600 = 3900, well above 3500 → no warn.
       The scan is plausible for a fuel-bumped day. */
    const liftDayTarget = 2600;
    expect(checkAggregateAgainstTarget(3500, liftDayTarget)).toBeNull();
  });
});
