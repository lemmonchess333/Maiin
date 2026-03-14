import { describe, it, expect } from 'vitest';
import { computeTier, getTimeRemaining } from '../useChallenges';

describe('computeTier', () => {
  const tiers = { bronze: 10, silver: 25, gold: 50 };

  it('returns null below bronze', () => {
    expect(computeTier(0, tiers)).toBeNull();
    expect(computeTier(9, tiers)).toBeNull();
  });

  it('returns bronze at threshold', () => {
    expect(computeTier(10, tiers)).toBe('bronze');
    expect(computeTier(24, tiers)).toBe('bronze');
  });

  it('returns silver at threshold', () => {
    expect(computeTier(25, tiers)).toBe('silver');
    expect(computeTier(49, tiers)).toBe('silver');
  });

  it('returns gold at threshold', () => {
    expect(computeTier(50, tiers)).toBe('gold');
    expect(computeTier(100, tiers)).toBe('gold');
  });
});

describe('getTimeRemaining', () => {
  it('returns "Ended" for past dates', () => {
    const pastDate = new Date(Date.now() - 100000);
    expect(getTimeRemaining(pastDate)).toBe('Ended');
  });

  it('returns days for future dates > 1 day', () => {
    const futureDate = new Date(Date.now() + 3 * 86400000);
    const result = getTimeRemaining(futureDate);
    expect(result).toMatch(/^\d+ days left$/);
  });

  it('returns hours for future dates < 1 day', () => {
    const futureDate = new Date(Date.now() + 12 * 3600000);
    const result = getTimeRemaining(futureDate);
    expect(result).toMatch(/^\d+h left$/);
  });
});
