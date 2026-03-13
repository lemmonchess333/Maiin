import { describe, it, expect } from 'vitest';
import { parseVoiceInput, formatParsedItems } from '../voiceFoodParser';

describe('parseVoiceInput', () => {
  it('returns empty array for blank input', () => {
    expect(parseVoiceInput('')).toEqual([]);
    expect(parseVoiceInput('   ')).toEqual([]);
  });

  it('parses simple food with quantity and unit', () => {
    const result = parseVoiceInput('200 grams chicken breast');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(200);
    expect(result[0].unit).toBe('g');
    expect(result[0].name).toBe('chicken breast');
  });

  it('parses number words', () => {
    const result = parseVoiceInput('two cups rice');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].unit).toBe('cup');
    expect(result[0].name).toBe('rice');
  });

  it('parses "a" and "an" as 1', () => {
    const result = parseVoiceInput('a slice of pizza');
    expect(result[0].quantity).toBe(1);
    expect(result[0].unit).toBe('slice');
  });

  it('parses "half" as 0.5', () => {
    const result = parseVoiceInput('half cup oats');
    expect(result[0].quantity).toBe(0.5);
    expect(result[0].unit).toBe('cup');
  });

  it('parses multiple items separated by "and"', () => {
    const result = parseVoiceInput('2 eggs and 3 slices bacon');
    expect(result).toHaveLength(2);
    expect(result[0].name).toContain('egg');
    expect(result[1].name).toContain('bacon');
  });

  it('parses multiple items separated by commas', () => {
    const result = parseVoiceInput('100g chicken, 200g rice, salad');
    expect(result).toHaveLength(3);
  });

  it('parses items separated by "with"', () => {
    const result = parseVoiceInput('oatmeal with banana');
    expect(result).toHaveLength(2);
  });

  it('parses items separated by "plus"', () => {
    const result = parseVoiceInput('toast plus butter');
    expect(result).toHaveLength(2);
  });

  it('defaults to 1 serving for items without quantity', () => {
    const result = parseVoiceInput('banana');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1);
    expect(result[0].unit).toBe('serving');
    expect(result[0].name).toBe('banana');
  });

  it('normalizes various unit spellings', () => {
    const tests = [
      { input: '2 tablespoons peanut butter', unit: 'tbsp' },
      { input: '1 teaspoon salt', unit: 'tsp' },
      { input: '200 milliliters milk', unit: 'ml' },
      { input: '3 ounces cheese', unit: 'oz' },
    ];
    for (const t of tests) {
      const result = parseVoiceInput(t.input);
      expect(result[0].unit).toBe(t.unit);
    }
  });

  it('preserves raw text', () => {
    const result = parseVoiceInput('2 cups rice');
    expect(result[0].raw).toBeTruthy();
  });
});

describe('formatParsedItems', () => {
  it('formats single serving items as just the name', () => {
    const items = [{ quantity: 1, unit: 'serving', name: 'banana', raw: 'banana' }];
    expect(formatParsedItems(items)).toBe('banana');
  });

  it('includes quantity and unit for non-default items', () => {
    const items = [{ quantity: 2, unit: 'cup', name: 'rice', raw: '2 cups rice' }];
    expect(formatParsedItems(items)).toBe('2 cup rice');
  });

  it('joins multiple items with commas', () => {
    const items = [
      { quantity: 1, unit: 'serving', name: 'chicken', raw: 'chicken' },
      { quantity: 2, unit: 'cup', name: 'rice', raw: '2 cups rice' },
    ];
    expect(formatParsedItems(items)).toBe('chicken, 2 cup rice');
  });
});
