// @vitest-environment jsdom
/**
 * A lift's rest seen from outside the app (lifting finding 7): the page's
 * title counting down, on its own clock so it keeps going while the page
 * is hidden; and on a phone, the lift's Live Activity turning to the rest
 * (Wid2 call 2), whose widget no CI run can see, so what is pinned here is
 * the app's half: the rest reaching the lift's card, a rest made longer
 * replacing itself, and the card going back to the set when it ends. The
 * card itself is `liftLiveActivity.test.ts`'s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  startActivity: vi.fn(),
  updateActivity: vi.fn(),
  endActivity: vi.fn(),
  getAllActivities: vi.fn(),
}));
vi.mock("capacitor-live-activities", async () => {
  const { capacitorPlugin } = await import("@/test/capacitorPlugin");
  return {
    LiveActivities: capacitorPlugin({
      startActivity: (...a: unknown[]) => plugin.startActivity(...a),
      updateActivity: (...a: unknown[]) => plugin.updateActivity(...a),
      endActivity: (...a: unknown[]) => plugin.endActivity(...a),
      getAllActivities: (...a: unknown[]) => plugin.getAllActivities(...a),
    }),
  };
});
vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn(() => false) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { isNativePlatform } from "@/lib/platform";
import { restTitle, showRestOutside } from "../restOutside";
import { __resetLiveActivitiesForTests } from "../liveActivities";
import {
  __resetLiftActivityForTests,
  showLiftSession,
} from "../liftLiveActivity";

const LIFT = {
  name: "Push A",
  art: "bench-press" as const,
  set: {
    exerciseName: "Bench Press",
    setLabel: "Set 2 of 3",
    load: "60 kg × 8",
    fact: "2/3",
  },
  setsDone: 1,
};

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
  __resetLiftActivityForTests();
  __resetLiveActivitiesForTests();
  setNative(false);
  let ids = 0;
  plugin.startActivity.mockImplementation(async () => ({
    activityId: `card-${++ids}`,
  }));
  plugin.updateActivity.mockResolvedValue(undefined);
  plugin.endActivity.mockResolvedValue(undefined);
  plugin.getAllActivities.mockResolvedValue({ activities: [] });
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
  it("turns the lift's card to the rest, counting to its end with the system's own timer", async () => {
    setNative(true);
    await showLiftSession(LIFT);
    const startedAt = Date.now();
    const stop = showRestOutside({ startedAt, target: 90 });
    await settle();
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    const [options] = plugin.startActivity.mock.calls[1];
    expect(JSON.stringify(options.layout)).toContain(
      `{"endTime":${startedAt + 90_000}}`
    );
    expect(options.data.line).toBe(
      "Next: Bench Press · set 2 of 3 · 60 kg × 8"
    );
    // It stops at 0:00: "timer" counts back up once the rest is over, with
    // the phone still locked and the app asleep.
    for (const layout of [options.layout, options.dynamicIslandLayout]) {
      const json = JSON.stringify(layout);
      expect(json).toContain(`{"style":"countdown"}`);
      expect(json).not.toContain(`{"style":"timer"}`);
    }
    stop();
    await settle();
    // The rest's card goes, and the set's comes back.
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "card-2",
      data: {},
      behavior: { dismissalPolicy: "immediate" },
    });
    expect(plugin.startActivity).toHaveBeenCalledTimes(3);
    expect(plugin.startActivity.mock.calls[2][0].data.kicker).toBe(
      "SET 2 OF 3"
    );
  });

  it("shows a rest made longer in place of the first, which its end leaves alone", async () => {
    setNative(true);
    await showLiftSession(LIFT);
    const startedAt = Date.now();
    const first = showRestOutside({ startedAt, target: 90 });
    await settle();
    // +15 s: the screen ends the first and shows the second at once.
    first();
    const second = showRestOutside({ startedAt, target: 105 });
    await settle();
    const ends = plugin.startActivity.mock.calls.map(
      (call) => JSON.stringify(call[0].layout).match(/"endTime":(\d+)/)?.[1]
    );
    expect(ends.at(-1)).toBe(String(startedAt + 105_000));
    // No set's card came between the two rests.
    expect(
      plugin.startActivity.mock.calls.filter(
        (call) => call[0].data.kicker === "SET 2 OF 3"
      )
    ).toHaveLength(1);
    second();
    await settle();
    expect(plugin.startActivity.mock.calls.at(-1)![0].data.kicker).toBe(
      "SET 2 OF 3"
    );
  });

  it("shows nothing without a lift's card to turn", async () => {
    setNative(true);
    const stop = showRestOutside({ startedAt: Date.now(), target: 60 });
    await settle();
    stop();
    await settle();
    expect(plugin.startActivity).not.toHaveBeenCalled();
  });
});
