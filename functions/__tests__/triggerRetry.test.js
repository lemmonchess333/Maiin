/**
 * The retried-trigger helpers: the window an event is retried in, and the
 * steps that each run and then fail the event together.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  RETRY_WINDOW_MS,
  pastRetryWindow,
  triggerSteps,
} = require("../lib/triggerRetry");

describe("pastRetryWindow", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const at = (ms) => ({ timestamp: new Date(now - ms).toISOString() });

  it("keeps retrying an event inside the window", () => {
    expect(pastRetryWindow(at(0), now)).toBe(false);
    expect(pastRetryWindow(at(RETRY_WINDOW_MS), now)).toBe(false);
  });

  it("drops a retry once the event is older than the window", () => {
    expect(pastRetryWindow(at(RETRY_WINDOW_MS + 1), now)).toBe(true);
  });

  it("never drops an event it cannot date", () => {
    expect(pastRetryWindow({}, now)).toBe(false);
    expect(pastRetryWindow(undefined, now)).toBe(false);
    expect(pastRetryWindow({ timestamp: "later" }, now)).toBe(false);
  });
});

describe("triggerSteps", () => {
  it("runs every step after one fails, then fails the event naming it", async () => {
    const log = vi.fn();
    const ran = [];
    const steps = triggerSteps("onRunCreated u/r", log);
    await steps.run("badges", async () => ran.push("badges"));
    await steps.run("lifetime", async () => {
      throw new Error("deadline exceeded");
    });
    await steps.run("challenge", async () => ran.push("challenge"));

    expect(ran).toEqual(["badges", "challenge"]);
    expect(log).toHaveBeenCalledWith("onRunCreated u/r: lifetime failed", {
      message: "deadline exceeded",
    });
    expect(() => steps.settle()).toThrow(
      "onRunCreated u/r: lifetime failed; the event will be retried"
    );
  });

  it("settles quietly when every step landed", async () => {
    const steps = triggerSteps("t", vi.fn());
    await steps.run("a", async () => {});
    expect(() => steps.settle()).not.toThrow();
  });
});
