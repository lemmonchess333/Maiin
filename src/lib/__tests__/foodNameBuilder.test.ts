import { describe, it, expect } from 'vitest';
import { buildFoodNameFromItems } from '../foodNameBuilder';

/* The diary-row name builder for AI photo scans. F4 audit found
 * the AI photo path was persisting the model's container title
 * ("Breakfast Ingredients") instead of deriving the name from
 * the actual identified items. This helper aligns AI scan
 * persistence with the NL parse path's behaviour — names always
 * come from items, not from the model's generated title. */

describe('buildFoodNameFromItems — single item', () => {
  it('uses the item name verbatim', () => {
    expect(buildFoodNameFromItems([{ name: 'Chicken breast' }])).toBe('Chicken breast');
  });

  it('trims surrounding whitespace', () => {
    expect(buildFoodNameFromItems([{ name: '  Chicken breast  ' }])).toBe('Chicken breast');
  });
});

describe('buildFoodNameFromItems — two items', () => {
  it('joins with ", "', () => {
    expect(
      buildFoodNameFromItems([{ name: 'Chicken breast' }, { name: 'Rice' }]),
    ).toBe('Chicken breast, Rice');
  });

  it('does not append +0', () => {
    /* Quick Add's smart-name pattern uses "+N" for 3+; with
       exactly 2 items the literal join is shorter and reads
       cleaner ("Chicken, Rice" vs "Chicken, Rice +0"). */
    const r = buildFoodNameFromItems([{ name: 'Eggs' }, { name: 'Toast' }]);
    expect(r).not.toMatch(/\+/);
  });
});

describe('buildFoodNameFromItems — three or more items', () => {
  it('uses the "First, Second +N" smart shape', () => {
    expect(
      buildFoodNameFromItems([
        { name: 'Granola' },
        { name: 'Blueberries' },
        { name: 'Hummus' },
      ]),
    ).toBe('Granola, Blueberries +1');
  });

  it('counts the remainder accurately for many items', () => {
    expect(
      buildFoodNameFromItems([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E' },
      ]),
    ).toBe('A, B +3');
  });

  it('avoids 200-character diary rows on heavy AI scans', () => {
    /* The whole reason for the smart shape vs the NL path's
       full comma-join: AI scans can return 8+ items. */
    const items = Array.from({ length: 10 }, (_, i) => ({ name: `Item${i + 1}` }));
    const r = buildFoodNameFromItems(items);
    expect(r).toBe('Item1, Item2 +8');
    expect(r.length).toBeLessThan(50);
  });
});

describe('buildFoodNameFromItems — defensive fallbacks', () => {
  it('returns the default fallback for an empty list', () => {
    expect(buildFoodNameFromItems([])).toBe('Meal');
  });

  it('returns the default fallback for null / undefined', () => {
    expect(buildFoodNameFromItems(undefined)).toBe('Meal');
    expect(buildFoodNameFromItems(null)).toBe('Meal');
  });

  it('uses an explicit fallback when provided', () => {
    /* The AI scan call site passes the original
       `meal.foodName` as fallback — when items somehow lose
       their names we still surface a usable diary label
       rather than the literal "Meal" placeholder. */
    expect(buildFoodNameFromItems([], 'Plate of food')).toBe('Plate of food');
  });

  it('falls back when all item names are blank/whitespace', () => {
    expect(
      buildFoodNameFromItems([{ name: '' }, { name: '  ' }, { name: undefined }], 'Snack'),
    ).toBe('Snack');
  });

  it('falls back to "Meal" when fallback is also empty', () => {
    expect(buildFoodNameFromItems([{ name: '' }], '')).toBe('Meal');
    expect(buildFoodNameFromItems([{ name: '' }], '   ')).toBe('Meal');
  });

  it('skips blank names but uses the surviving identifiable ones', () => {
    /* A defensive case: two identifiable items + one with a
       missing name. The blank one should drop and the result
       should be the literal 2-item join, not the 3+ shape. */
    expect(
      buildFoodNameFromItems([
        { name: 'Eggs' },
        { name: '' },
        { name: 'Toast' },
      ]),
    ).toBe('Eggs, Toast');
  });
});

describe('buildFoodNameFromItems — anchor case from F5 audit', () => {
  it('produces the right name for the screenshot scenario', () => {
    /* Pre-F5.1 the diary row was "Breakfast Ingredients ·
       457 kcal" because the AI's container title was
       persisted. Post-fix, the same items produce a
       diary-readable label derived from the items. */
    const r = buildFoodNameFromItems([
      { name: "Lizi's High Protein Granola" },
      { name: 'Blueberries' },
      { name: 'Hummus' },
    ]);
    expect(r).toBe("Lizi's High Protein Granola, Blueberries +1");
  });
});
