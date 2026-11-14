/**
 * Web stays inert; the native source receives only beats for the named run,
 * from the sensor always and from the Watch when no sensor reading is fresh.
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
const sensor = vi.hoisted(() => ({
  deliver: (_sample: unknown) => {},
  remove: vi.fn(),
  start: vi.fn(async (_sessionId: string) => true),
  stop: vi.fn(async () => {}),
}));
vi.mock("../heartRateSensorBridge", () => ({
  subscribeHeartRateSensorReadings: (handler: (sample: unknown) => void) => {
    sensor.deliver = handler;
    return Promise.resolve(sensor.remove);
  },
  startHeartRateSensorSession: (sessionId: string) => sensor.start(sessionId),
  stopHeartRateSensorSession: () => sensor.stop(),
}));

import {
  getHeartRateSource,
  nativeHeartRateSource,
  webHeartRateSource,
} from "../heartRateSource";

beforeEach(() => {
  isNativePlatform.mockReset();
  subscribeWatchHeartRateSamples.mockReset();
  sensor.deliver = () => {};
  sensor.remove.mockReset();
  sensor.start.mockClear();
  sensor.stop.mockClear();
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
    // The native source is the Watch and the sensor as one stream now, so
    // it is no longer the Watch's own object.
    const src = getHeartRateSource();
    expect(src).not.toBe(nativeHeartRateSource);
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
    // Each beat now names its source.
    expect(onSample).toHaveBeenCalledWith(142, 2_000, "b", "apple-watch");
    subscription.stop();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("names a run to the sensor, passes its beats on, and lets it go on stop", async () => {
    isNativePlatform.mockReturnValue(true);
    subscribeWatchHeartRateSamples.mockImplementation(() =>
      Promise.resolve(() => {})
    );
    const onSample = vi.fn();
    const subscription = getHeartRateSource().subscribe(
      onSample,
      undefined,
      "active-run"
    );
    await Promise.resolve();
    expect(sensor.start).toHaveBeenCalledWith("active-run");
    sensor.deliver({ id: "ble:1", at: 5_000, bpm: 138, source: "bluetooth" });
    expect(onSample).toHaveBeenCalledWith(138, 5_000, "ble:1", "bluetooth");
    subscription.stop();
    expect(sensor.remove).toHaveBeenCalledOnce();
    expect(sensor.stop).toHaveBeenCalledOnce();
  });

  it("subscribes nothing without a named run", () => {
    isNativePlatform.mockReturnValue(true);
    getHeartRateSource().subscribe(vi.fn(), undefined, undefined).stop();
    expect(sensor.start).not.toHaveBeenCalled();
  });

  it("sets the Watch's beat aside while the sensor's is fresh, and takes it after", async () => {
    isNativePlatform.mockReturnValue(true);
    let deliverWatch: (sample: unknown) => void = () => {};
    subscribeWatchHeartRateSamples.mockImplementation((handler) => {
      deliverWatch = handler;
      return Promise.resolve(() => {});
    });
    const onSample = vi.fn();
    const subscription = getHeartRateSource().subscribe(
      onSample,
      undefined,
      "active-run"
    );
    await Promise.resolve();
    const watch = (sampleId: string, timestampMs: number) =>
      deliverWatch({
        sessionId: "active-run",
        sampleId,
        timestampMs,
        bpm: 150,
      });
    watch("w0", 0);
    sensor.deliver({ id: "ble:1", at: 1_000, bpm: 140, source: "bluetooth" });
    watch("w1", 5_000);
    watch("w2", 15_999);
    watch("w3", 16_000);
    expect(onSample.mock.calls.map((call) => call[2])).toEqual([
      "w0",
      "ble:1",
      "w3",
    ]);
    subscription.stop();
  });
});

describe("getHeartRateSource — a sensor without the Watch", () => {
  it("still streams the sensor when connected training is not released", async () => {
    vi.resetModules();
    vi.doMock("../connectedTrainingRelease", () => ({
      CONNECTED_TRAINING_RELEASED: false,
    }));
    isNativePlatform.mockReturnValue(true);
    const { getHeartRateSource: resolve } = await import("../heartRateSource");
    const onSample = vi.fn();
    const subscription = resolve().subscribe(onSample, undefined, "run-B");
    await Promise.resolve();
    expect(subscribeWatchHeartRateSamples).not.toHaveBeenCalled();
    sensor.deliver({ id: "ble:2", at: 9_000, bpm: 131, source: "bluetooth" });
    expect(onSample).toHaveBeenCalledWith(131, 9_000, "ble:2", "bluetooth");
    subscription.stop();
    vi.doUnmock("../connectedTrainingRelease");
  });
});
