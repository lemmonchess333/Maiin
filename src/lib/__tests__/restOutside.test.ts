// @vitest-environment jsdom
/**
 * A lift's rest seen from outside the app (lifting finding 7): the page's
 * title counting down, on its own clock so it keeps going while the page
 * is hidden; and on a phone, the lock screen's Live Activity, which the
 * widget extension draws on a device alone, so what is pinned here is the
 * app's half: what it asks the plugin for, a rest made longer replacing
 * itself, and nothing thrown into the workout when the plugin is missing
 * or refuses. What the widget reads from the data is pinned in
 * liveActivityContract.test.ts.
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
  startRestActivity,
  type RestActivity,
} from "../restLiveActivity";
import { PLUGIN_LAYOUT } from "../liveActivityContract";

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

describe("the lock screen", () => {
  it("counts from the rest's start to its end, with the next set, and goes stale at the end", async () => {
    setNative(true);
    const startedAt = Date.now();
    const stop = showRestOutside({
      startedAt,
      target: 90,
      exerciseName: "Bench Press",
      next: { name: "Set 2", load: "15 kg × 10" },
    });
    await settle();
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    const [options] = plugin.startActivity.mock.calls[0];
    const data = {
      kind: "rest",
      startedAt,
      endsAt: startedAt + 90_000,
      exercise: "Bench Press",
      set: "Set 2 · 15 kg × 10",
    };
    expect(options.data).toEqual(data);
    // The system redraws the card as done once the rest's end passes.
    expect(options.staleDate).toBe(startedAt + 90_000);
    // The widget draws natively; the plugin only needs a layout to exist.
    expect(options.layout).toEqual(PLUGIN_LAYOUT.layout);
    stop();
    await settle();
    // Ended on the state it showed, so it is never drawn empty.
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "rest-1",
      data,
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
      data: expect.objectContaining({ endsAt: startedAt + 90_000 }),
    });
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    expect(plugin.startActivity.mock.calls[1][0].data.endsAt).toBe(
      startedAt + 105_000
    );
    second();
    await settle();
    expect(plugin.endActivity).toHaveBeenLastCalledWith({
      activityId: "rest-2",
      data: expect.objectContaining({ endsAt: startedAt + 105_000 }),
    });
  });

  it("throws nothing into the workout when the plugin refuses", async () => {
    setNative(true);
    plugin.startActivity.mockRejectedValue(new Error("no extension"));
    await expect(
      startRestActivity({ startedAt: 0, endsAt: 1 })
    ).resolves.toBeUndefined();
    await expect(endRestActivity()).resolves.toBeUndefined();
    expect(plugin.endActivity).not.toHaveBeenCalled();
  });

  /** The data a start sends the widget for `rest`. */
  const sentFor = async (rest: RestActivity) => {
    setNative(true);
    plugin.startActivity.mockClear();
    await startRestActivity(rest);
    return plugin.startActivity.mock.calls[0][0].data;
  };

  it("names the set after the rest as the rest band does", async () => {
    const at = { startedAt: 0, endsAt: 90_000 };
    expect(
      (await sentFor({ ...at, next: { name: "Set 2", load: "15 kg × 10" } }))
        .set
    ).toBe("Set 2 · 15 kg × 10");
    expect(
      (await sentFor({ ...at, next: { name: "Warm-up 3", load: "" } })).set
    ).toBe("Warm-up 3");
    expect((await sentFor(at)).set).toBe("");
  });

  it("never sends a start after the end, and leaves out what it does not know", async () => {
    expect(await sentFor({ startedAt: 5_000, endsAt: 4_000 })).toEqual({
      kind: "rest",
      startedAt: 4_000,
      endsAt: 4_000,
      exercise: "",
      set: "",
    });
  });
});
