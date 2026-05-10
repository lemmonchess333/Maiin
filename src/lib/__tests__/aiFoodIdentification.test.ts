import { describe, it, expect } from 'vitest';
import {
  isGenericAiFoodName,
  filterIdentifiableAiItems,
  isEmptyAiFoodResult,
} from '../aiFoodIdentification';

/* The AI photo path produces "Unidentifiable" / "Unknown food"
 * results when the model can't classify the image. Both shapes —
 * zero-macro and hallucinated-non-zero-macro — must be blocked
 * from saving. The reliable signal is the NAME, not the macros:
 * AI may hallucinate a few cals on a wall, but the name will
 * still be a generic fallback. Conversely real zero-cal foods
 * (water, black coffee) must remain savable. */

describe('isGenericAiFoodName', () => {
  it('flags "Unidentifiable" as generic', () => {
    expect(isGenericAiFoodName('Unidentifiable')).toBe(true);
  });

  it('flags "Unknown food" as generic', () => {
    expect(isGenericAiFoodName('Unknown food')).toBe(true);
  });

  it('flags bare generic placeholders', () => {
    expect(isGenericAiFoodName('Food')).toBe(true);
    expect(isGenericAiFoodName('Item')).toBe(true);
    expect(isGenericAiFoodName('Object')).toBe(true);
    expect(isGenericAiFoodName('Meal')).toBe(true);
  });

  it('flags blank / missing names', () => {
    expect(isGenericAiFoodName('')).toBe(true);
    expect(isGenericAiFoodName('   ')).toBe(true);
    expect(isGenericAiFoodName(undefined)).toBe(true);
    expect(isGenericAiFoodName(null)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isGenericAiFoodName('UNIDENTIFIABLE')).toBe(true);
    expect(isGenericAiFoodName('unknown FOOD')).toBe(true);
  });

  it('does not flag real foods', () => {
    expect(isGenericAiFoodName('Chicken breast')).toBe(false);
    expect(isGenericAiFoodName('Water')).toBe(false);
    expect(isGenericAiFoodName('Black coffee')).toBe(false);
    expect(isGenericAiFoodName('Greek yoghurt')).toBe(false);
  });

  it('does not flag foods that contain generic words as substrings', () => {
    /* The generic word match is whole-string, not substring —
       "Food bowl" or "Meal prep chicken" should remain savable
       even though they contain a generic token. */
    expect(isGenericAiFoodName('Food bowl')).toBe(false);
    expect(isGenericAiFoodName('Meal prep chicken')).toBe(false);
  });
});

describe('filterIdentifiableAiItems', () => {
  it('returns identifiable items unchanged when none are generic', () => {
    const items = [
      { name: 'Chicken breast', calories: 165 },
      { name: 'Brown rice', calories: 220 },
    ];
    expect(filterIdentifiableAiItems(items)).toEqual(items);
  });

  it('drops generic items from a mixed result', () => {
    const items = [
      { name: 'Chicken breast', calories: 165 },
      { name: 'Unidentifiable', calories: 0 },
    ];
    const result = filterIdentifiableAiItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Chicken breast');
    expect(result.find((i) => i.name === 'Unidentifiable')).toBeUndefined();
  });

  it('drops generic items even when they have hallucinated non-zero macros', () => {
    /* The screenshot case: AI returns "Unidentifiable" with a
       stray 2-cal hallucination. The name is the reliable
       signal — non-zero macros do not rescue a generic name. */
    const items = [
      { name: 'Water', calories: 0 },
      { name: 'Unidentifiable', calories: 2, protein: 1 },
    ];
    const result = filterIdentifiableAiItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Water');
  });

  it('returns an empty array when every item is generic', () => {
    const items = [
      { name: 'Unidentifiable' },
      { name: 'Unknown food' },
      { name: '' },
    ];
    expect(filterIdentifiableAiItems(items)).toEqual([]);
  });
});

describe('isEmptyAiFoodResult', () => {
  it('returns true for an empty array', () => {
    expect(isEmptyAiFoodResult([])).toBe(true);
  });

  it('returns true for null/undefined input', () => {
    expect(isEmptyAiFoodResult(null)).toBe(true);
    expect(isEmptyAiFoodResult(undefined)).toBe(true);
  });

  it('returns true for a single Unidentifiable item with zero macros', () => {
    expect(
      isEmptyAiFoodResult([{ name: 'Unidentifiable', calories: 0, protein: 0, carbs: 0, fat: 0 }]),
    ).toBe(true);
  });

  it('returns true for "Unknown food" with zero macros', () => {
    expect(
      isEmptyAiFoodResult([{ name: 'Unknown food', calories: 0, protein: 0, carbs: 0, fat: 0 }]),
    ).toBe(true);
  });

  it('returns true for Unidentifiable with hallucinated non-zero macros', () => {
    /* Anchor case from the spec — AI returns a generic name
       with a stray small calorie value. Macros do not rescue
       the generic name. */
    expect(
      isEmptyAiFoodResult([
        { name: 'Unidentifiable', calories: 2, protein: 1, carbs: 0.5, fat: 0 },
      ]),
    ).toBe(true);
  });

  it('returns true for a blank-name item', () => {
    expect(
      isEmptyAiFoodResult([{ name: '', calories: 0, protein: 0, carbs: 0, fat: 0 }]),
    ).toBe(true);
  });

  it('returns true for "Food" with non-zero macros (generic name still wins)', () => {
    expect(
      isEmptyAiFoodResult([
        { name: 'Food', calories: 120, protein: 2, carbs: 10, fat: 4 },
      ]),
    ).toBe(true);
  });

  it('returns false for "Water" with zero macros (real zero-cal food)', () => {
    expect(
      isEmptyAiFoodResult([{ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 }]),
    ).toBe(false);
  });

  it('returns false for "Black coffee" with zero macros (real zero-cal food)', () => {
    expect(
      isEmptyAiFoodResult([{ name: 'Black coffee', calories: 0, protein: 0, carbs: 0, fat: 0 }]),
    ).toBe(false);
  });

  it('returns false for a real food with non-zero macros', () => {
    expect(
      isEmptyAiFoodResult([
        { name: 'Chicken breast', calories: 165, protein: 31, carbs: 0, fat: 4 },
      ]),
    ).toBe(false);
  });

  it('mixed result: keeps Chicken breast, drops Unidentifiable, isEmpty false', () => {
    /* Spec anchor case 10: a multi-item AI result where some
       items are real and others are generic. The filtered list
       is non-empty so the user can review; the generic entry
       is gone. */
    const items = [
      { name: 'Chicken breast', calories: 165, protein: 31, carbs: 0, fat: 4 },
      { name: 'Unidentifiable', calories: 0, protein: 0, carbs: 0, fat: 0 },
    ];
    expect(isEmptyAiFoodResult(items)).toBe(false);
    const filtered = filterIdentifiableAiItems(items);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Chicken breast');
    expect(filtered.find((i) => i.name === 'Unidentifiable')).toBeUndefined();
  });

  it('mixed result: keeps Water, drops Unknown food, isEmpty false', () => {
    /* Spec anchor case 11: zero-calorie real food + generic. */
    const items = [
      { name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 },
      { name: 'Unknown food', calories: 0, protein: 0, carbs: 0, fat: 0 },
    ];
    expect(isEmptyAiFoodResult(items)).toBe(false);
    const filtered = filterIdentifiableAiItems(items);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Water');
    expect(filtered.find((i) => i.name === 'Unknown food')).toBeUndefined();
  });
});
