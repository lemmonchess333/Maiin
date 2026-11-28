// @vitest-environment jsdom
/**
 * Share usage analytics (Priv1 call 2): once a profile is loaded, the
 * account's answer wins on this device and is kept for its next launch.
 * Without a profile (signed out, or still loading) the device keeps the
 * answer it was last given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const setUsageAnalytics = vi.hoisted(() => vi.fn());
const setAccountMetAnalyticsNotice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analyticsProvider", () => ({
  setUsageAnalytics,
  setAccountMetAnalyticsNotice,
}));

import { useAccountUsageAnalytics } from "../useAccountUsageAnalytics";

type Profile = Parameters<typeof useAccountUsageAnalytics>[0];

beforeEach(() => {
  setUsageAnalytics.mockReset();
  setAccountMetAnalyticsNotice.mockReset();
});

describe("useAccountUsageAnalytics", () => {
  it("applies an account's off on this device", () => {
    renderHook(() => useAccountUsageAnalytics({ usageAnalytics: false }));
    expect(setUsageAnalytics.mock.calls).toEqual([[false]]);
  });

  it("applies on for an account that never turned it off", () => {
    renderHook(() => useAccountUsageAnalytics({}));
    expect(setUsageAnalytics.mock.calls).toEqual([[true]]);
  });

  it("leaves the device's answer alone for an account still in setup with no answer", () => {
    // Sign-up writes the new profile before the plan is saved. Turn off,
    // tapped on the agreement in signed-out setup, must survive it so the
    // plan's save can carry it onto the account.
    renderHook(() => useAccountUsageAnalytics({ onboardingComplete: false }));
    expect(setUsageAnalytics).not.toHaveBeenCalled();
  });

  it("applies an answer an account in setup already has", () => {
    renderHook(() =>
      useAccountUsageAnalytics({
        onboardingComplete: false,
        usageAnalytics: false,
      })
    );
    expect(setUsageAnalytics.mock.calls).toEqual([[false]]);
  });

  it("applies on once setup is saved with no answer", () => {
    renderHook(() => useAccountUsageAnalytics({ onboardingComplete: true }));
    expect(setUsageAnalytics.mock.calls).toEqual([[true]]);
  });

  it("leaves the device's answer alone with no profile", () => {
    const { rerender } = renderHook(
      ({ profile }: { profile: Profile }) => useAccountUsageAnalytics(profile),
      { initialProps: { profile: null as Profile } }
    );
    expect(setUsageAnalytics).not.toHaveBeenCalled();

    // The profile arrives, then the account signs out.
    rerender({ profile: { usageAnalytics: false } });
    rerender({ profile: null });
    expect(setUsageAnalytics.mock.calls).toEqual([[false]]);
  });

  it("follows a change of answer, and only a change", () => {
    const { rerender } = renderHook(
      ({ profile }: { profile: Profile }) => useAccountUsageAnalytics(profile),
      { initialProps: { profile: { usageAnalytics: true } as Profile } }
    );
    rerender({ profile: { usageAnalytics: true } });
    rerender({ profile: { usageAnalytics: false } });
    rerender({ profile: {} });
    expect(setUsageAnalytics.mock.calls).toEqual([[true], [false], [true]]);
  });

  /* The analytics line sits on the health-details agreement, so an account
     that carries the agreement met it; one without, or no account, has not
     (owner, 23 November 2026). */
  it("says the account met the analytics line only once it carries the agreement", () => {
    const { rerender } = renderHook(
      ({ profile }: { profile: Profile }) => useAccountUsageAnalytics(profile),
      { initialProps: { profile: null as Profile } }
    );
    rerender({ profile: {} });
    rerender({ profile: { healthDataConsent: { at: null, version: 1 } } });
    rerender({ profile: null });
    expect(setAccountMetAnalyticsNotice.mock.calls).toEqual([
      [false],
      [true],
      [false],
    ]);
  });
});
