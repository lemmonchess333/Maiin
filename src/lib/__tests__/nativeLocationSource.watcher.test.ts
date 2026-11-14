/**
 * nativeLocationSource's watchers, with the background-geolocation plugin
 * faked. The plugin ships no JavaScript, so on the web and in the unit
 * suite every call stops at `nativePlugin()`; these give it a plugin and pin
 * what the iOS app relies on: the options that keep a run recording with
 * the screen locked, fixes and errors mapped onto the Web shapes, and a
 * stop that lands before the native watcher's id has come back.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

type Callback = (
  pos?: Record<string, unknown>,
  err?: { code?: string; message?: string }
) => void;

const fake = vi.hoisted(() => {
  const state = {
    callbacks: [] as Callback[],
    resolveId: [] as ((id: string) => void)[],
    addWatcher: null as unknown as Mock<
      (options: unknown, callback: Callback) => Promise<string>
    >,
    removeWatcher: null as unknown as Mock<
      (arg: { id: string }) => Promise<void>
    >,
  };
  return state;
});
const native = vi.hoisted(() => ({ value: true }));

vi.mock("@capacitor/core", async () => {
  // The bridge's own shape: a Proxy that answers `then` too. A plain object
  // has none, so a loader that resolved a promise with the plugin passed
  // here and hung on the phone (a run sat on "Finding GPS").
  const { capacitorPlugin } = await import("@/test/capacitorPlugin");
  fake.addWatcher = vi.fn(
    (_options: unknown, callback: Callback) =>
      new Promise<string>((resolve) => {
        fake.callbacks.push(callback);
        fake.resolveId.push(resolve);
      })
  );
  fake.removeWatcher = vi.fn((_arg: { id: string }) => Promise.resolve());
  return {
    registerPlugin: () =>
      capacitorPlugin({
        addWatcher: (options: unknown, callback: Callback) =>
          fake.addWatcher(options, callback),
        removeWatcher: (arg: { id: string }) => fake.removeWatcher(arg),
      }),
    Capacitor: { isNativePlatform: () => native.value },
  };
});
vi.mock("../platform", () => ({ isNativePlatform: () => native.value }));

import { nativeLocationSource } from "../nativeLocationSource";

const FIX = {
  latitude: 51.5,
  longitude: -0.12,
  accuracy: 6,
  altitude: 20,
  altitudeAccuracy: 3,
  simulated: false,
  bearing: 90,
  speed: 3,
  time: 1_700_000_000_000,
};

/** Let the addWatcher call and its id run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fake.callbacks.length = 0;
  fake.resolveId.length = 0;
  fake.addWatcher.mockClear();
  fake.removeWatcher.mockClear();
  native.value = true;
});

describe("watch — the run's own watcher", () => {
  it("asks for background fixes, every one, with the prompt tied to Start", async () => {
    nativeLocationSource.watch({}, vi.fn(), vi.fn());
    await settle();
    expect(fake.addWatcher).toHaveBeenCalledTimes(1);
    expect(fake.addWatcher.mock.calls[0][0]).toEqual({
      backgroundTitle: "Tropos is tracking your run",
      backgroundMessage: "Distance and pace keep recording while you run.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    });
  });

  it("hands on fixes in the Web shape, and a refusal as PERMISSION_DENIED", async () => {
    const onFix = vi.fn();
    const onError = vi.fn();
    nativeLocationSource.watch({}, onFix, onError);
    await settle();
    fake.callbacks[0](FIX);
    expect(onFix.mock.calls[0][0].coords).toMatchObject({
      latitude: 51.5,
      heading: 90,
    });
    fake.callbacks[0](undefined, { code: "NOT_AUTHORIZED" });
    expect(onError.mock.calls[0][0].code).toBe(1);
    fake.callbacks[0](undefined, { code: "OTHER", message: "gps off" });
    expect(onError.mock.calls[1][0]).toMatchObject({
      code: 2,
      message: "gps off",
    });
  });

  it("removes its watcher on clear, and passes on nothing after", async () => {
    const onFix = vi.fn();
    const handle = nativeLocationSource.watch({}, onFix, vi.fn());
    await settle();
    fake.resolveId[0]("w-1");
    await settle();
    handle.clear();
    await settle();
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "w-1" });
    fake.callbacks[0](FIX);
    expect(onFix).not.toHaveBeenCalled();
  });

  it("removes the watcher a clear raced, once its id arrives", async () => {
    // Stopping straight after Start: the native watcher exists, but its id
    // has not come back. Without this it would keep the GPS on for good.
    const handle = nativeLocationSource.watch({}, vi.fn(), vi.fn());
    await settle();
    handle.clear();
    expect(fake.removeWatcher).not.toHaveBeenCalled();
    fake.resolveId[0]("w-late");
    await settle();
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "w-late" });
  });
});

describe("getCurrent — the pre-warm", () => {
  it("takes the cached fix without a prompt, once, and removes its watcher", async () => {
    const onFix = vi.fn();
    nativeLocationSource.getCurrent({}, onFix, vi.fn());
    await settle();
    expect(fake.addWatcher.mock.calls[0][0]).toEqual({
      requestPermissions: false,
      stale: true,
    });
    fake.resolveId[0]("p-1");
    await settle();
    fake.callbacks[0](FIX);
    fake.callbacks[0](FIX);
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "p-1" });
  });

  it("removes its watcher when the fix beat the id", async () => {
    nativeLocationSource.getCurrent({}, vi.fn(), vi.fn());
    await settle();
    fake.callbacks[0](FIX);
    expect(fake.removeWatcher).not.toHaveBeenCalled();
    fake.resolveId[0]("p-2");
    await settle();
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "p-2" });
  });
});

describe("getCurrent — its timeout", () => {
  /* The run screen polls a one-off fix every 3 s while the watch is still
     acquiring, with a 10 s timeout, as the Web's getCurrentPosition takes
     it. A native one-off that ignored it lived until a fix came: indoors,
     or on a phone with no cached location, one more watcher every poll,
     and still there, location on, after the run screen had gone. */
  const after = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("gives up at its timeout, as the Web's does, and removes its watcher", async () => {
    const onFix = vi.fn();
    const onError = vi.fn();
    nativeLocationSource.getCurrent({ timeout: 20 }, onFix, onError);
    await settle();
    fake.resolveId[0]("p-3");
    await after(40);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe(3); // TIMEOUT
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "p-3" });
    // A fix after it gave up changes nothing.
    fake.callbacks[0](FIX);
    expect(onFix).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("removes a watcher whose id comes back after the timeout", async () => {
    nativeLocationSource.getCurrent({ timeout: 10 }, vi.fn(), vi.fn());
    await after(30);
    expect(fake.removeWatcher).not.toHaveBeenCalled();
    fake.resolveId[0]("p-4");
    await settle();
    expect(fake.removeWatcher).toHaveBeenCalledWith({ id: "p-4" });
  });

  it("does not time out a fix that came in time", async () => {
    const onFix = vi.fn();
    const onError = vi.fn();
    nativeLocationSource.getCurrent({ timeout: 20 }, onFix, onError);
    await settle();
    fake.resolveId[0]("p-5");
    await settle();
    fake.callbacks[0](FIX);
    await after(40);
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(fake.removeWatcher).toHaveBeenCalledTimes(1);
  });
});

describe("off the phone", () => {
  it("starts no watcher at all", async () => {
    native.value = false;
    nativeLocationSource.watch({}, vi.fn(), vi.fn()).clear();
    nativeLocationSource.getCurrent({}, vi.fn(), vi.fn());
    await settle();
    expect(fake.addWatcher).not.toHaveBeenCalled();
  });
});
