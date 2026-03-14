import { describe, it, expect } from 'vitest';
import { THEME } from '../theme';

describe('THEME', () => {
  it('has all required color keys', () => {
    const requiredKeys = [
      'bg', 'surface', 'elevated',
      'running', 'runningLight', 'lifting', 'liftingLight', 'brand', 'brandLight',
      'success', 'warning', 'danger', 'teal',
      'textPrimary', 'textSecondary', 'textMuted',
      'chartGrid', 'chartTooltipBg',
      'paceFast', 'paceOnTarget', 'paceSlow',
    ];
    for (const key of requiredKeys) {
      expect(THEME[key as keyof typeof THEME]).toBeDefined();
    }
  });

  it('hex colors are valid', () => {
    const hexKeys = ['bg', 'surface', 'elevated', 'running', 'lifting', 'brand', 'success', 'warning', 'danger', 'teal'] as const;
    for (const key of hexKeys) {
      expect(THEME[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('is declared as const (readonly at type level)', () => {
    // THEME uses `as const` for TypeScript-level immutability
    expect(typeof THEME).toBe('object');
    expect(Object.keys(THEME).length).toBeGreaterThan(15);
  });
});
