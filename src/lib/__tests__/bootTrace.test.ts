// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootSteps,
  resetBootTraceForTests,
  subscribeBootTrace,
  traceBoot,
  watchBootErrors,
} from "../bootTrace";

afterEach(() => resetBootTraceForTests());

describe("bootTrace", () => {
  it("keeps the steps in order and tells its listeners", () => {
    const listener = vi.fn();
    const stop = subscribeBootTrace(listener);
    traceBoot("App code started");
    traceBoot("Waiting for sign-in to answer");
    expect(bootSteps().map((entry) => entry.step)).toEqual([
      "App code started",
      "Waiting for sign-in to answer",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    traceBoot("Ready");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest 40", () => {
    for (let i = 0; i < 45; i += 1) traceBoot(`step ${i}`);
    expect(bootSteps()).toHaveLength(40);
    expect(bootSteps()[0].step).toBe("step 5");
    expect(bootSteps()[39].step).toBe("step 44");
  });

  it("gives a new list each time, so React sees the change", () => {
    traceBoot("one");
    const before = bootSteps();
    traceBoot("two");
    expect(bootSteps()).not.toBe(before);
  });

  it("keeps uncaught errors and rejections beside the steps", () => {
    watchBootErrors();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new TypeError("x is undefined") })
    );
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("auth/network-request-failed");
    window.dispatchEvent(rejection);
    expect(bootSteps().map((entry) => entry.step)).toEqual([
      "Error: TypeError: x is undefined",
      "Unhandled: Error: auth/network-request-failed",
    ]);
  });
});
