/**
 * Web stays inert; the native source receives only beats for the named run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const isNativePlatform = vi.fn();
const subscribeWatchHeartRateSamples = vi.fn();
vi.mock("../platform", () => ({
  isNativePlatform: () => isNativePlatform(),
}));
vi.mock("../watchRunBridge", () => ({
  subscribeWatchHeartRateSamples: (handler: unknown) =>
    subscribeWatchHeartRateSamples(handler),
}));
vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: true,
}));

import {
  getHeartRateSource,
  nativeHeartRateSource,
  webHeartRateSource,
} from "../heartRateSource";

beforeEach(() => {
  isNativePlatform.mockReset();
  subscribeWatchHeartRateSamples.mockReset();
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

  it("uses the Watch stream only for an active native run", async () => {
    isNativePlatform.mockReturnValue(true);
    const src = getHeartRateSource();
    expect(src).toBe(nativeHeartRateSource);
    expect(src.available).toBe(true);
    const onSample = vi.fn();
    let deliver: (sample: unknown) => void = () => {};
    const remove = vi.fn();
    subscribeWatchHeartRateSamples.mockImplementation((handler) => {
      deliver = handler;
      return Promise.resolve(remove);
    });
    const subscription = src.subscribe(onSample, undefined, "active-run");
    await Promise.resolve();
    deliver({
      sessionId: "old-run",
      sampleId: "a",
      timestampMs: 1_000,
      bpm: 130,
    });
    deliver({
      sessionId: "active-run",
      sampleId: "b",
      timestampMs: 2_000,
      bpm: 142,
    });
    expect(onSample).toHaveBeenCalledOnce();
    expect(onSample).toHaveBeenCalledWith(142, 2_000, "b");
    subscription.stop();
    expect(remove).toHaveBeenCalledOnce();
  });
});
