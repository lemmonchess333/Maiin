import { describe, it, expect } from 'vitest';
import { BADGE_DEFINITIONS, TIER_COLORS, CATEGORY_LABELS, initBadges, type BadgeTier } from '../badges';

describe('badges', () => {
  it('has all tier colors defined', () => {
    const tiers: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum'];
    for (const tier of tiers) {
      expect(TIER_COLORS[tier]).toBeDefined();
      expect(TIER_COLORS[tier]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has all category labels defined', () => {
    const categories = ['consistency', 'lifting', 'running', 'nutrition', 'hybrid'] as const;
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe('string');
    }
  });

  it('has unique badge IDs', () => {
    const ids = BADGE_DEFINITIONS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all badges have required fields', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.id).toBeTruthy();
      expect(badge.name).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(badge.lucideIcon).toBeTruthy();
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(badge.tier);
      expect(['consistency', 'lifting', 'running', 'nutrition', 'hybrid']).toContain(badge.category);
    }
  });

  it('initBadges returns all badges with null earnedAt', () => {
    const badges = initBadges();
    expect(badges.length).toBe(BADGE_DEFINITIONS.length);
    for (const badge of badges) {
      expect(badge.earnedAt).toBeNull();
    }
  });

  it('has badges in every category', () => {
    const categories = new Set(BADGE_DEFINITIONS.map(b => b.category));
    expect(categories.size).toBe(5);
    expect(categories.has('consistency')).toBe(true);
    expect(categories.has('lifting')).toBe(true);
    expect(categories.has('running')).toBe(true);
    expect(categories.has('nutrition')).toBe(true);
    expect(categories.has('hybrid')).toBe(true);
  });

  it('has badges in every tier', () => {
    const tiers = new Set(BADGE_DEFINITIONS.map(b => b.tier));
    expect(tiers.size).toBe(4);
  });
});
