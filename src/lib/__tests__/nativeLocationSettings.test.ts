import { describe, it, expect } from "vitest";
import {
  shouldWarnBackgroundPause,
  openLocationSettings,
} from "../nativeLocationSettings";

describe("shouldWarnBackgroundPause", () => {
  it("returns false before the first fix (still acquiring, not paused)", () => {
    expect(
      shouldWarnBackgroundPause({
        hiddenDurationSec: 60,
        msSinceLastFixOnResume: null,
      })
    ).toBe(false);
  });

  it("returns false for a short hidden window (app-switcher glance)", () => {
    expect(
      shouldWarnBackgroundPause({
        hiddenDurationSec: 5,
        msSinceLastFixOnResume: 5000,
      })
    ).toBe(false);
  });

  it("warns when no fresh fix arrived during a real hidden window", () => {
    // Hidden 60s, and the newest fix is 58s old on resume → delivery paused.
    expect(
      shouldWarnBackgroundPause({
        hiddenDurationSec: 60,
        msSinceLastFixOnResume: 58_000,
      })
    ).toBe(true);
  });

  it("does NOT warn when fixes kept flowing while backgrounded (Always grant)", () => {
    // Hidden 60s, but the newest fix is only 2s old → background delivery
    // worked, so this is an Always grant, not a While-Using pause.
    expect(
      shouldWarnBackgroundPause({
        hiddenDurationSec: 60,
        msSinceLastFixOnResume: 2000,
      })
    ).toBe(false);
  });

  it("respects a custom minHiddenSec threshold", () => {
    expect(
      shouldWarnBackgroundPause({
        hiddenDurationSec: 20,
        msSinceLastFixOnResume: 20_000,
        minHiddenSec: 30,
      })
    ).toBe(false);
  });
});

describe("openLocationSettings", () => {
  it("is a no-op on web (does not throw)", async () => {
    await expect(openLocationSettings()).resolves.toBeUndefined();
  });
});
