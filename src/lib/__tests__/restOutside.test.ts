// @vitest-environment jsdom
/**
 * A lift's rest seen from outside the app (lifting finding 7): the page's
 * title counting down, on its own clock so it keeps going while the page
 * is hidden; and on a phone, the lock screen's Live Activity, whose native
 * half waits on Xcode, so what is pinned here is the app's half: what it
 * asks the plugin for, a rest made longer replacing itself, and nothing
 * thrown into the workout when the plugin is missing or refuses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  startActivity: vi.fn(),
  endActivity: vi.fn(),
}));
vi.mock("capacitor-live-activities", () => ({
  LiveActivities: {
    startActivity: (...a: unknown[]) => plugin.startActivity(...a),
    endActivity: (...a: unknown[]) => plugin.endActivity(...a),
  },
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn(() => false) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { isNativePlatform } from "@/lib/platform";
import { restTitle, showRestOutside } from "../restOutside";
import {
  __resetRestActivityForTests,
  endRestActivity,
  restActivityLine,
  startRestActivity,
} from "../restLiveActivity";

const setNative = (native: boolean) =>
  vi.mocked(isNativePlatform).mockReturnValue(native);
/** Lets the dynamic imports and the plugin's promises settle. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vi.dynamicImportSettled();
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRestActivityForTests();
  setNative(false);
  plugin.startActivity.mockResolvedValue({ activityId: "rest-1" });
  plugin.endActivity.mockResolvedValue(undefined);
  document.title = "Tropos";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the page's title", () => {
  it("says the time left, then that the rest is over", () => {
    expect(restTitle(83)).toBe("1:23 rest");
    expect(restTitle(0)).toBe("Rest over");
    expect(restTitle(-4)).toBe("Rest over");
  });

  it("counts down while the page is hidden, and goes back when the rest ends", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const stop = showRestOutside({ startedAt: Date.now(), target: 90 });
    expect(document.title).toBe("1:30 rest");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.advanceTimersByTime(61_000);
    expect(document.title).toBe("0:29 rest");
    vi.advanceTimersByTime(30_000);
    expect(document.title).toBe("Rest over");
    stop();
    expect(document.title).toBe("Tropos");
  });

  it("reads the clock, so a late tick is never wrong", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const stop = showRestOutside({ startedAt: Date.now(), target: 60 });
    // A throttled page: the clock moved on and one tick came.
    vi.setSystemTime(Date.now() + 45_000);
    vi.advanceTimersByTime(1000);
    expect(document.title).toBe("0:14 rest");
    stop();
  });

  it("leaves the lock screen alone on the web", async () => {
    const stop = showRestOutside({ startedAt: Date.now(), target: 60 });
    stop();
    await settle();
    expect(plugin.startActivity).not.toHaveBeenCalled();
  });
});

describe("the lock screen (native half deferred)", () => {
  it("counts to the rest's end with the system's own timer", async () => {
    setNative(true);
    const startedAt = Date.now();
    const stop = showRestOutside({
      startedAt,
      target: 90,
      exerciseName: "Bench Press",
    });
    await settle();
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    const [options] = plugin.startActivity.mock.calls[0];
    expect(JSON.stringify(options.layout)).toContain(
      `{"endTime":${startedAt + 90_000}}`
    );
    expect(options.data).toEqual({ next: "Next: Bench Press" });
    stop();
    await settle();
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "rest-1",
      data: {},
    });
  });

  it("shows a rest made longer in place of the first, which its end leaves alone", async () => {
    setNative(true);
    plugin.startActivity
      .mockResolvedValueOnce({ activityId: "rest-1" })
      .mockResolvedValueOnce({ activityId: "rest-2" });
    const startedAt = Date.now();
    const first = showRestOutside({ startedAt, target: 90 });
    await settle();
    // +15 s: the screen ends the first and shows the second at once.
    first();
    const second = showRestOutside({ startedAt, target: 105 });
    await settle();
    expect(plugin.endActivity).toHaveBeenCalledTimes(1);
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "rest-1",
      data: {},
    });
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    second();
    await settle();
    expect(plugin.endActivity).toHaveBeenLastCalledWith({
      activityId: "rest-2",
      data: {},
    });
  });

  it("throws nothing into the workout when the plugin refuses", async () => {
    setNative(true);
    plugin.startActivity.mockRejectedValue(new Error("no extension"));
    await expect(startRestActivity({ endsAt: 1 })).resolves.toBeUndefined();
    await expect(endRestActivity()).resolves.toBeUndefined();
    expect(plugin.endActivity).not.toHaveBeenCalled();
  });

  it("names what comes after the rest", () => {
    expect(restActivityLine("Squat")).toBe("Next: Squat");
    expect(restActivityLine()).toBe("Next set");
  });
});
