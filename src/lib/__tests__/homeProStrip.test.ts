/**
 * Home's Pro strip — who sees it and when.
 */
import { describe, it, expect } from "vitest";
import {
  shouldShowHomeProStrip,
  HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS,
} from "../homeProStrip";

const NOW = Date.parse("2026-09-13T12:00:00Z");
const days = (n: number) => NOW - n * 864e5;
const base = {
  isPro: false,
  isInTrial: false,
  snoozed: false,
  createdAtMs: days(30),
  onboardingCompletedAtMs: days(10),
  hadPriorHomeVisit: true,
  nowMs: NOW,
};

describe("shouldShowHomeProStrip", () => {
  it("shows to a free account whose plan is a few days old", () => {
    expect(shouldShowHomeProStrip(base)).toBe(true);
    expect(
      shouldShowHomeProStrip({
        ...base,
        onboardingCompletedAtMs: days(HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS),
      })
    ).toBe(true);
  });

  it("counts the days from setup, not sign-up", () => {
    const setUpToday = { ...base, onboardingCompletedAtMs: days(2) };
    expect(shouldShowHomeProStrip(setUpToday)).toBe(false);
    expect(
      shouldShowHomeProStrip({
        ...base,
        onboardingCompletedAtMs: days(
          HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS - 0.5
        ),
      })
    ).toBe(false);
  });

  it("keeps the first Home visit clear, even when the plan is days old", () => {
    expect(shouldShowHomeProStrip({ ...base, hadPriorHomeVisit: false })).toBe(
      false
    );
  });

  it("counts from sign-up for an account set up before setup was stamped", () => {
    const unstamped = { ...base, onboardingCompletedAtMs: null };
    expect(shouldShowHomeProStrip(unstamped)).toBe(true);
    expect(shouldShowHomeProStrip({ ...unstamped, createdAtMs: days(1) })).toBe(
      false
    );
    expect(shouldShowHomeProStrip({ ...unstamped, createdAtMs: null })).toBe(
      false
    );
  });

  it("never for Pro, never during a trial, never while snoozed", () => {
    expect(shouldShowHomeProStrip({ ...base, isPro: true })).toBe(false);
    expect(shouldShowHomeProStrip({ ...base, isInTrial: true })).toBe(false);
    expect(shouldShowHomeProStrip({ ...base, snoozed: true })).toBe(false);
  });
});
