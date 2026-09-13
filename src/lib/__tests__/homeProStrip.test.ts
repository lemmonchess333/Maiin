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
  hadFreeWeek: false,
  createdAtMs: days(10),
  nowMs: NOW,
};

describe("shouldShowHomeProStrip", () => {
  it("shows to a free account a few days old", () => {
    expect(shouldShowHomeProStrip(base)).toBe(true);
    expect(
      shouldShowHomeProStrip({
        ...base,
        createdAtMs: days(HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS),
      })
    ).toBe(true);
  });

  it("holds off while the account is younger than the window — the offer page was the first screen", () => {
    expect(shouldShowHomeProStrip({ ...base, createdAtMs: days(0) })).toBe(
      false
    );
    expect(
      shouldShowHomeProStrip({
        ...base,
        createdAtMs: days(HOME_PRO_STRIP_MIN_ACCOUNT_AGE_DAYS - 0.5),
      })
    ).toBe(false);
  });

  it("shows straight away once the old free week has lapsed, whatever the account age", () => {
    expect(
      shouldShowHomeProStrip({
        ...base,
        hadFreeWeek: true,
        createdAtMs: days(0),
      })
    ).toBe(true);
    expect(
      shouldShowHomeProStrip({ ...base, hadFreeWeek: true, createdAtMs: null })
    ).toBe(true);
  });

  it("never for Pro, never during a trial, never while snoozed", () => {
    expect(shouldShowHomeProStrip({ ...base, isPro: true })).toBe(false);
    expect(shouldShowHomeProStrip({ ...base, isInTrial: true })).toBe(false);
    expect(shouldShowHomeProStrip({ ...base, snoozed: true })).toBe(false);
    expect(
      shouldShowHomeProStrip({ ...base, hadFreeWeek: true, snoozed: true })
    ).toBe(false);
  });

  it("waits for createdAt to resolve before counting days", () => {
    expect(shouldShowHomeProStrip({ ...base, createdAtMs: null })).toBe(false);
  });
});
