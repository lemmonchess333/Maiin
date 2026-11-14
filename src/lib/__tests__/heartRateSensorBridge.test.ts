/**
 * The Bluetooth heart rate sensor bridge: inert on web, fail-safe against a
 * shell without the plugin, and the one place a reading's bytes become a
 * beat (through `heartRateMeasurement.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const H = vi.hoisted(() => ({
  native: false,
  listeners: new Map<string, (value: unknown) => void>(),
  status: {} as unknown,
  readings: [] as unknown[],
  calls: [] as [string, unknown?][],
  fail: false,
}));

vi.mock("../platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("@capacitor/core", async () => {
  const { capacitorPlugin: wrap } = await import("@/test/capacitorPlugin");
  const call =
    (name: string, answer: () => unknown = () => undefined) =>
    async (options?: unknown) => {
      H.calls.push([name, options]);
      if (H.fail)
        throw Object.assign(new Error("no"), { code: "UNIMPLEMENTED" });
      return answer();
    };
  return {
    registerPlugin: () =>
      wrap({
        getStatus: call("getStatus", () => H.status),
        startScan: call("startScan"),
        stopScan: call("stopScan"),
        pair: call("pair", () => H.status),
        forget: call("forget", () => H.status),
        setPreview: call("setPreview"),
        startSession: call("startSession"),
        stopSession: call("stopSession"),
        getSessionReadings: call("getSessionReadings", () => ({
          readings: H.readings,
        })),
        clearSessions: call("clearSessions"),
        openSettings: call("openSettings"),
        addListener: async (
          name: string,
          listener: (value: unknown) => void
        ) => {
          if (H.fail) throw new Error("no");
          H.listeners.set(name, listener);
          return { remove: async () => H.listeners.delete(name) };
        },
      }),
  };
});

import {
  clearHeartRateSensorSessions,
  forgetHeartRateSensor,
  getHeartRateSensorSessionSamples,
  getHeartRateSensorStatus,
  pairHeartRateSensor,
  scanForHeartRateSensors,
  startHeartRateSensorSession,
  subscribeHeartRateSensorReadings,
  subscribeHeartRateSensorStatus,
  UNAVAILABLE_SENSOR_STATUS,
} from "../heartRateSensorBridge";

beforeEach(() => {
  H.native = false;
  H.listeners.clear();
  H.status = {};
  H.readings = [];
  H.calls = [];
  H.fail = false;
});

describe("heartRateSensorBridge on web", () => {
  it("answers not available and calls nothing", async () => {
    expect(await getHeartRateSensorStatus()).toEqual(UNAVAILABLE_SENSOR_STATUS);
    expect(await pairHeartRateSensor("abc")).toBeNull();
    expect(await startHeartRateSensorSession("run-A")).toBe(false);
    expect(await getHeartRateSensorSessionSamples("run-A")).toEqual([]);
    const stop = await scanForHeartRateSensors(() => {});
    stop();
    expect(H.calls).toEqual([]);
  });
});

describe("heartRateSensorBridge on the iPhone", () => {
  beforeEach(() => {
    H.native = true;
  });

  it("reads the status field by field, with safe values for anything odd", async () => {
    H.status = {
      available: true,
      authorization: "allowed",
      bluetooth: "poweredOn",
      paired: { id: "UUID-1", name: "Polar H10 1A2B" },
      connection: "connected",
      scanning: false,
    };
    expect(await getHeartRateSensorStatus()).toEqual(H.status);
    H.status = {
      available: "yes",
      authorization: "maybe",
      paired: { name: "No id" },
      connection: 3,
    };
    expect(await getHeartRateSensorStatus()).toEqual(UNAVAILABLE_SENSOR_STATUS);
  });

  it("names an unnamed sensor rather than showing nothing", async () => {
    H.status = { available: true, paired: { id: "UUID-2", name: "" } };
    expect((await getHeartRateSensorStatus()).paired).toEqual({
      id: "UUID-2",
      name: "Sensor",
    });
  });

  it("says not available when the shell has no plugin", async () => {
    H.fail = true;
    expect(await getHeartRateSensorStatus()).toEqual(UNAVAILABLE_SENSOR_STATUS);
    expect(await pairHeartRateSensor("abc")).toBeNull();
    expect(await forgetHeartRateSensor()).toBeNull();
    expect(await startHeartRateSensorSession("run-A")).toBe(false);
    expect(await getHeartRateSensorSessionSamples("run-A")).toEqual([]);
    await expect(clearHeartRateSensorSessions()).resolves.toBeUndefined();
    const stop = await subscribeHeartRateSensorReadings(() => {});
    expect(() => stop()).not.toThrow();
  });

  it("finds sensors while searching, and stops the search", async () => {
    const found = vi.fn();
    const stop = await scanForHeartRateSensors(found);
    expect(H.calls.map(([name]) => name)).toEqual(["startScan"]);
    H.listeners.get("sensorFound")?.({ id: "UUID-1", name: "HRM-Pro" });
    H.listeners.get("sensorFound")?.({ name: "No id" });
    expect(found).toHaveBeenCalledOnce();
    expect(found).toHaveBeenCalledWith({ id: "UUID-1", name: "HRM-Pro" });
    stop();
    await Promise.resolve();
    expect(H.calls.map(([name]) => name)).toEqual(["startScan", "stopScan"]);
  });

  it("turns a reading's bytes into a beat, and drops what is not one", async () => {
    const beats = vi.fn();
    await subscribeHeartRateSensorReadings(beats);
    const deliver = H.listeners.get("reading")!;
    // 0x16: contact supported and detected, uint8 140, one RR-interval.
    deliver({ id: "b-1", at: 1_000, bytes: [0x16, 140, 0x00, 0x04] });
    // Contact lost: the strap is off the skin.
    deliver({ id: "b-2", at: 2_000, bytes: [0x04, 140] });
    // Malformed: a uint16 value cut short; and no id.
    deliver({ id: "b-3", at: 3_000, bytes: [0x01, 140] });
    deliver({ at: 4_000, bytes: [0x00, 140] });
    expect(beats.mock.calls).toEqual([
      [{ id: "ble:b-1", at: 1_000, bpm: 140, source: "bluetooth" }],
    ]);
  });

  it("recovers a run's kept readings as beats", async () => {
    H.readings = [
      { id: "b-1", at: 1_000, bytes: [0x00, 130] },
      { id: "b-2", at: 2_000, bytes: [0x00, 0] },
      { id: "b-3", at: 3_000, bytes: [0x01, 0x84, 0x00] },
    ];
    expect(await getHeartRateSensorSessionSamples("run-A")).toEqual([
      { id: "ble:b-1", at: 1_000, bpm: 130, source: "bluetooth" },
      { id: "ble:b-3", at: 3_000, bpm: 132, source: "bluetooth" },
    ]);
    expect(H.calls).toEqual([["getSessionReadings", { sessionId: "run-A" }]]);
  });

  it("clears one run's readings, or every run's", async () => {
    await clearHeartRateSensorSessions("run-A");
    await clearHeartRateSensorSessions();
    expect(H.calls).toEqual([
      ["clearSessions", { sessionId: "run-A" }],
      ["clearSessions", {}],
    ]);
  });

  it("passes status changes on as read", async () => {
    const statuses = vi.fn();
    await subscribeHeartRateSensorStatus(statuses);
    H.listeners.get("statusChanged")?.({
      available: true,
      authorization: "allowed",
      bluetooth: "poweredOff",
      paired: null,
      connection: "idle",
      scanning: false,
    });
    expect(statuses).toHaveBeenCalledWith(
      expect.objectContaining({ bluetooth: "poweredOff", available: true })
    );
  });

  it("never resolves a promise with the plugin itself", async () => {
    // The mock is a capacitorPlugin Proxy: a `then` probe would hang here.
    await expect(getHeartRateSensorStatus()).resolves.toBeDefined();
    expect(capacitorPlugin).toBeTypeOf("function");
  });
});
