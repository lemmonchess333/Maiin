import { describe, it, expect } from 'vitest';
import { computeTier, getTimeRemaining, isTierAchieved } from '../useChallenges';

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

describe('isTierAchieved', () => {
  /* Cumulative metrics (workout_count / total_volume / total_km / etc):
     higher is better, threshold is a floor. */
  it('treats cumulative metrics as higher-is-better', () => {
    expect(isTierAchieved(0, 100, 'total_volume')).toBe(false);
    expect(isTierAchieved(99, 100, 'total_volume')).toBe(false);
    expect(isTierAchieved(100, 100, 'total_volume')).toBe(true);
    expect(isTierAchieved(150, 100, 'total_volume')).toBe(true);
  });

  /* fastest_effort is seconds-elapsed for a fixed distance — lower is
     better, and the user must have a qualifying time recorded
     (currentValue > 0) to count. The bug this guards against: a
     freshly-joined participant with currentValue 0 used to "achieve"
     every tier because 0 ≤ any threshold. */
  it('treats fastest_effort as lower-is-better and rejects zero', () => {
    expect(isTierAchieved(0, 1500, 'fastest_effort')).toBe(false);
    expect(isTierAchieved(1500, 1500, 'fastest_effort')).toBe(true);
    expect(isTierAchieved(1499, 1500, 'fastest_effort')).toBe(true);
    expect(isTierAchieved(1501, 1500, 'fastest_effort')).toBe(false);
  });

  it('handles unknown metrics by falling through to the higher-is-better default', () => {
    expect(isTierAchieved(50, 100, 'unknown_metric')).toBe(false);
    expect(isTierAchieved(100, 100, 'unknown_metric')).toBe(true);
  });
});
