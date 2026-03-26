import { describe, it, expect } from 'vitest';
import { getSubscriptionInfo, pricing, featureAccess } from '../subscription';
import type { UserProfile } from '../auth';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'u1',
    email: 'test@example.com',
    displayName: 'Test User',
    currentStreak: 0,
    lastLogDate: '',
    ...overrides,
  } as UserProfile;
}

describe('getSubscriptionInfo', () => {
  it('returns free tier for null profile', () => {
    const info = getSubscriptionInfo(null);
    expect(info.tier).toBe('free');
    expect(info.isPro).toBe(false);
    expect(info.isInTrial).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
    expect(info.features).toEqual(featureAccess.free);
  });

  it('returns free tier for profile without subscription', () => {
    const info = getSubscriptionInfo(makeProfile());
    expect(info.tier).toBe('free');
    expect(info.isPro).toBe(false);
  });

  it('returns pro tier for subscriptionTier = "pro"', () => {
    const info = getSubscriptionInfo(makeProfile({ subscriptionTier: 'pro' }));
    expect(info.tier).toBe('pro');
    expect(info.isPro).toBe(true);
    expect(info.isInTrial).toBe(false);
    expect(info.features).toEqual(featureAccess.pro);
  });

  it('returns active trial with pro access when trial is active', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: future.toISOString(),
    }));
    expect(info.tier).toBe('free');
    expect(info.isInTrial).toBe(true);
    expect(info.isPro).toBe(true);
    expect(info.trialDaysLeft).toBeGreaterThanOrEqual(4);
    expect(info.trialDaysLeft).toBeLessThanOrEqual(6);
    expect(info.features).toEqual(featureAccess.pro);
  });

  it('returns expired trial as free', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: past.toISOString(),
    }));
    expect(info.tier).toBe('free');
    expect(info.isInTrial).toBe(false);
    expect(info.isPro).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
  });

  it('pro subscription takes priority over trial', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const info = getSubscriptionInfo(makeProfile({
      subscriptionTier: 'pro',
      trialExpiresAt: future.toISOString(),
    }));
    expect(info.tier).toBe('pro');
    expect(info.isInTrial).toBe(false);
  });

  it('trial expiry at exact midnight boundary is expired', () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Set trial to expire at start of today (already passed)
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: now.toISOString(),
    }));
    expect(info.isPro).toBe(false);
    expect(info.isInTrial).toBe(false);
  });

  it('trial expiring 1ms ago is expired', () => {
    const justExpired = new Date(Date.now() - 1);
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: justExpired.toISOString(),
    }));
    expect(info.isPro).toBe(false);
    expect(info.trialDaysLeft).toBe(0);
  });

  it('trial expiring soon is still active', () => {
    const almostExpired = new Date(Date.now() + 5000);
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: almostExpired.toISOString(),
    }));
    expect(info.isPro).toBe(true);
    expect(info.isInTrial).toBe(true);
    expect(info.trialDaysLeft).toBe(1);
  });

  it('lapsed pro (subscriptionTier free, no trial) is free', () => {
    const info = getSubscriptionInfo(makeProfile({
      subscriptionTier: 'free',
      trialExpiresAt: new Date(Date.now() - 86400000).toISOString(),
    }));
    expect(info.isPro).toBe(false);
    expect(info.tier).toBe('free');
    expect(info.features).toEqual(featureAccess.free);
  });

  it('handles malformed trialExpiresAt gracefully', () => {
    const info = getSubscriptionInfo(makeProfile({
      trialExpiresAt: 'not-a-date',
    }));
    // NaN date comparisons should result in free tier
    expect(info.isPro).toBe(false);
  });

  it('transition: free → trial → pro → lapsed states are correct', () => {
    // Free user
    const free = getSubscriptionInfo(makeProfile({ subscriptionTier: 'free' }));
    expect(free.isPro).toBe(false);

    // Trial active
    const future = new Date(Date.now() + 7 * 86400000);
    const trial = getSubscriptionInfo(makeProfile({ trialExpiresAt: future.toISOString() }));
    expect(trial.isPro).toBe(true);
    expect(trial.isInTrial).toBe(true);

    // Pro subscriber
    const pro = getSubscriptionInfo(makeProfile({ subscriptionTier: 'pro' }));
    expect(pro.isPro).toBe(true);
    expect(pro.isInTrial).toBe(false);

    // Lapsed (was pro, now free, trial expired)
    const lapsed = getSubscriptionInfo(makeProfile({
      subscriptionTier: 'free',
      trialExpiresAt: new Date(Date.now() - 86400000).toISOString(),
    }));
    expect(lapsed.isPro).toBe(false);
    expect(lapsed.isInTrial).toBe(false);
  });
});

describe('pricing constants', () => {
  it('has expected shape', () => {
    expect(pricing.monthly).toBeGreaterThan(0);
    expect(pricing.yearly).toBeGreaterThan(0);
    expect(pricing.lifetime).toBeGreaterThan(0);
    expect(pricing.currency).toBe('GBP');
  });
});

describe('featureAccess', () => {
  it('free tier lacks pro features', () => {
    expect(featureAccess.free.aiAdjustments).toBe(false);
    expect(featureAccess.free.plateauDetection).toBe(false);
    expect(featureAccess.free.performanceInsights).toBe(false);
  });

  it('pro tier has all features', () => {
    expect(featureAccess.pro.aiAdjustments).toBe(true);
    expect(featureAccess.pro.plateauDetection).toBe(true);
    expect(featureAccess.pro.performanceInsights).toBe(true);
  });

  it('both tiers have basic features', () => {
    expect(featureAccess.free.workoutLogging).toBe(true);
    expect(featureAccess.free.foodLogging).toBe(true);
    expect(featureAccess.pro.workoutLogging).toBe(true);
    expect(featureAccess.pro.foodLogging).toBe(true);
  });
});
