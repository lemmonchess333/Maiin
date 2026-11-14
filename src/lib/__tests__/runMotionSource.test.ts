import { afterEach, describe, expect, it, vi } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const native = vi.hoisted(() => ({
  isNative: false,
  listener: null as ((raw: unknown) => void) | null,
  calls: [] as string[],
  startFails: false,
}));

vi.mock("../platform", () => ({ isNativePlatform: () => native.isNative }));
vi.mock("@capacitor/core", () => ({
  registerPlugin: () =>
    capacitorPlugin({
      addListener: async (_: string, listener: (raw: unknown) => void) => {
        native.calls.push("addListener");
        native.listener = listener;
        return {
          remove: async () => {
            native.calls.push("remove");
          },
        };
      },
      start: async () => {
        native.calls.push("start");
        if (native.startFails) throw new Error("not implemented on ios");
        return {};
      },
      stop: async () => {
        native.calls.push("stop");
      },
    }),
}));

import {
  activityKind,
  parseMotionSample,
  startRunMotion,
} from "../runMotionSource";

const AT = 1_700_000_000_000;
const flags = {
  stationary: false,
  walking: false,
  running: false,
  automotive: false,
  cycling: false,
  unknown: false,
};

afterEach(() => {
  native.isNative = false;
  native.listener = null;
  native.calls.length = 0;
  native.startFails = false;
});

describe("what the plugin sends", () => {
  it("reads each kind of sample", () => {
    expect(
      parseMotionSample({ kind: "steps", at: AT, steps: 12, cadence: 2.7 })
    ).toEqual({ kind: "steps", at: AT, steps: 12, cadence: 2.7 });
    expect(parseMotionSample({ kind: "steps", at: AT, steps: 3 })).toEqual({
      kind: "steps",
      at: AT,
      steps: 3,
      cadence: null,
    });
    expect(
      parseMotionSample({ kind: "stepEvent", at: AT, moving: false })
    ).toEqual({ kind: "stepEvent", at: AT, moving: false });
    expect(
      parseMotionSample({
        kind: "activity",
        at: AT,
        confidence: 1,
        ...flags,
        stationary: true,
      })
    ).toEqual({
      kind: "activity",
      at: AT,
      activity: "stationary",
      confidence: "medium",
    });
    expect(parseMotionSample({ kind: "unavailable" })).toEqual({
      kind: "unavailable",
    });
  });

  it.each([
    null,
    "steps",
    { kind: "steps", at: AT, steps: -1 },
    { kind: "steps", at: AT, steps: 1.5 },
    { kind: "steps", at: AT, steps: 4, cadence: -1 },
    { kind: "steps", at: AT, steps: 4, cadence: "fast" },
    { kind: "steps", at: 0, steps: 4 },
    { kind: "stepEvent", at: AT, moving: "yes" },
    { kind: "activity", at: AT, confidence: 3, ...flags },
    { kind: "activity", at: AT, confidence: 2, ...flags, walking: 1 },
    { kind: "pedometer", at: AT },
  ])("is no evidence when malformed: %j", (raw) => {
    expect(parseMotionSample(raw)).toBeNull();
  });

  it("reads CoreMotion's overlapping flags with the run first", () => {
    // A car at a red light is automotive and stationary (CMMotionActivity).
    expect(activityKind({ ...flags, automotive: true, stationary: true })).toBe(
      "stationary"
    );
    expect(activityKind({ ...flags, running: true, walking: true })).toBe(
      "running"
    );
    expect(activityKind({ ...flags, walking: true, stationary: true })).toBe(
      "walking"
    );
    expect(activityKind({ ...flags, cycling: true })).toBe("other");
    expect(activityKind({ ...flags, unknown: true })).toBe("unknown");
    // All false: moving in a way CoreMotion cannot name.
    expect(activityKind(flags)).toBe("other");
  });
});

describe("starting the sensors", () => {
  it("does nothing on the web", async () => {
    const onSample = vi.fn();
    const stop = await startRunMotion(onSample);
    stop();
    expect(native.calls).toEqual([]);
  });

  it("listens before starting, passes on what parses, and stops both", async () => {
    native.isNative = true;
    const onSample = vi.fn();
    const stop = await startRunMotion(onSample);
    expect(native.calls).toEqual(["addListener", "start"]);
    native.listener!({ kind: "stepEvent", at: AT, moving: true });
    native.listener!({ kind: "stepEvent", at: AT });
    expect(onSample).toHaveBeenCalledTimes(1);
    stop();
    await Promise.resolve();
    expect(native.calls).toEqual(["addListener", "start", "remove", "stop"]);
  });

  it("settles on a shell without the plugin, leaving GPS to decide", async () => {
    native.isNative = true;
    native.startFails = true;
    const stop = await startRunMotion(vi.fn());
    expect(native.calls).toEqual(["addListener", "start", "remove"]);
    stop();
    expect(native.calls).not.toContain("stop");
  });
});
