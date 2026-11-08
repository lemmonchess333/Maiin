// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/* A fresh module for each test, as a fresh app start has. */
let trace: typeof import("../bootTrace");
beforeEach(async () => {
  vi.resetModules();
  trace = await import("../bootTrace");
});

describe("bootTrace", () => {
  it("keeps the steps in order and tells its listeners", () => {
    const listener = vi.fn();
    const stop = trace.subscribeBootTrace(listener);
    trace.traceBoot("App code started");
    trace.traceBoot("Waiting for sign-in to answer");
    expect(trace.bootSteps().map((entry) => entry.step)).toEqual([
      "App code started",
      "Waiting for sign-in to answer",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    trace.traceBoot("Ready");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest 40", () => {
    for (let i = 0; i < 45; i += 1) trace.traceBoot(`step ${i}`);
    expect(trace.bootSteps()).toHaveLength(40);
    expect(trace.bootSteps()[0].step).toBe("step 5");
    expect(trace.bootSteps()[39].step).toBe("step 44");
  });

  it("gives a new list each time, so React sees the change", () => {
    trace.traceBoot("one");
    const before = trace.bootSteps();
    trace.traceBoot("two");
    expect(trace.bootSteps()).not.toBe(before);
  });

  it("keeps uncaught errors and rejections beside the steps", () => {
    trace.watchBootErrors();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new TypeError("x is undefined") })
    );
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("auth/network-request-failed");
    window.dispatchEvent(rejection);
    expect(trace.bootSteps().map((entry) => entry.step)).toEqual([
      "Error: TypeError: x is undefined",
      "Unhandled: Error: auth/network-request-failed",
    ]);
  });
});
