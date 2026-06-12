/**
 * heartRateSource — the native-injection seam for live HR. Today both platforms
 * resolve to the inert WEB source (no browser HR API; native plugin not wired
 * yet). The contract consumers depend on is: `available === false` (so the run
 * HUD / Settings fall back to the STATIC zone preview rather than erroring), and
 * a `subscribe()` that never emits but hands back a safe `stop()`. A regression
 * (available accidentally true, or subscribe throwing) would break HR on web.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const isNativePlatform = vi.fn();
vi.mock("../platform", () => ({
  isNativePlatform: () => isNativePlatform(),
}));

import { getHeartRateSource, webHeartRateSource } from "../heartRateSource";

beforeEach(() => {
  isNativePlatform.mockReset();
});

describe("webHeartRateSource (inert fallback contract)", () => {
  it("reports unavailable so consumers show the static zone preview", () => {
    expect(webHeartRateSource.available).toBe(false);
  });

  it("subscribe() never emits a sample and returns a safe stop()", () => {
    const onSample = vi.fn();
    const sub = webHeartRateSource.subscribe(onSample);
    expect(onSample).not.toHaveBeenCalled();
    expect(() => sub.stop()).not.toThrow();
  });
});

describe("getHeartRateSource", () => {
  it("returns the inert source on web (no native plugin)", () => {
    isNativePlatform.mockReturnValue(false);
    const src = getHeartRateSource();
    expect(src.available).toBe(false);
    expect(src).toBe(webHeartRateSource);
  });

  it("also returns the inert source on native until the HealthKit plugin lands (honest 'no stream')", () => {
    isNativePlatform.mockReturnValue(true);
    const src = getHeartRateSource();
    expect(src.available).toBe(false);
    // The subscribe no-op must hold on native too — consumers branch on
    // `available`, not on platform.
    const onSample = vi.fn();
    src.subscribe(onSample).stop();
    expect(onSample).not.toHaveBeenCalled();
  });
});
