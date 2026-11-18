// @vitest-environment jsdom
/**
 * The lift's Live Activity (Wid2 calls 1, 2 and 4): one card from the first
 * set to the finish, the session's drawing on it, turning between a set, a
 * rest and the rest's end, and taken away at once when the workout ends.
 *
 * No CI run can see a Lock Screen, so what is pinned here is the app's
 * half: what it asks the plugin to draw, when it starts the card again
 * (a set and a rest have different layouts) and when it only sends new
 * data, and that the Settings switch takes it away.
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
vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn(() => true) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { isNativePlatform } from "@/lib/platform";
import { __resetLiveActivitiesForTests } from "@/lib/liveActivities";
import {
  LIVE_ACTIVITIES_OFF_KEY,
  setLiveActivitiesOn,
} from "@/lib/liveActivitySetting";
import { remove } from "@/lib/localStore";
import {
  __resetLiftActivityForTests,
  liftCardWords,
  showLiftRest,
  showLiftSession,
  type LiftCardSession,
} from "@/lib/liftLiveActivity";

interface Element {
  type: string;
  properties: Record<string, unknown>[];
  children?: Element[];
}
const prop = (element: Element, key: string): unknown =>
  element.properties.find((p) => key in p)?.[key];
const walk = (element: Element): Element[] => [
  element,
  ...(element.children ?? []).flatMap(walk),
];
const IMMEDIATE = { dismissalPolicy: "immediate" };

const SET_2: LiftCardSession = {
  name: "Pull A",
  art: "deadlift",
  set: {
    exerciseName: "Deadlift",
    setLabel: "Set 2 of 4",
    load: "100 kg × 5",
    fact: "2/4",
  },
  setsDone: 1,
};
const SET_3: LiftCardSession = {
  ...SET_2,
  set: { ...SET_2.set!, setLabel: "Set 3 of 4", fact: "3/4" },
  setsDone: 2,
};

function started(index = -1) {
  return plugin.startActivity.mock.calls.at(index)![0] as {
    layout: Element;
    dynamicIslandLayout: Record<string, Element | Record<string, Element>>;
    data: Record<string, string>;
    behavior: Record<string, unknown>;
  };
}

let ids = 0;
beforeEach(() => {
  vi.clearAllMocks();
  ids = 0;
  __resetLiveActivitiesForTests();
  __resetLiftActivityForTests();
  remove(LIVE_ACTIVITIES_OFF_KEY);
  vi.mocked(isNativePlatform).mockReturnValue(true);
  plugin.startActivity.mockImplementation(async () => ({
    activityId: `card-${++ids}`,
  }));
  plugin.updateActivity.mockResolvedValue(undefined);
  plugin.endActivity.mockResolvedValue(undefined);
  plugin.getAllActivities.mockResolvedValue({ activities: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a set", () => {
  it("leads with the session's drawing mid-rep, the set's weight and reps as the figure", async () => {
    await showLiftSession(SET_2);
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    const { layout, data, behavior } = started();
    expect(data).toEqual({
      kicker: "SET 2 OF 4",
      figure: "100 kg × 5",
      line: "Deadlift",
      fact: "2/4",
      name: "Pull A",
      // Set up, lifting, standing: a set is the middle.
      pose: "deadlift-pose-2",
    });
    const image = walk(layout).find((el) => el.type === "image")!;
    expect(prop(image, "asset")).toBe("{{pose}}");
    // The box has the frame's shape (441 x 480), inside the card.
    expect(prop(image, "height")).toBe(96);
    expect(prop(image, "width")).toBe(88);
    // Dark to its corners, in one soft light of the lift's purple.
    expect(behavior.backgroundTint).toBe("#17171B");
    expect(JSON.stringify(layout)).toContain('"backgroundGradient"');
    expect(JSON.stringify(layout)).not.toContain('"timer"');
    // No button on the card (Wid2 call 3): a tap opens the workout.
    expect(behavior.widgetUrl).toBe("tropos://workout");
  });

  it("moves to the next set by its data, without starting the card again", async () => {
    await showLiftSession(SET_2);
    await showLiftSession(SET_3);
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    expect(plugin.updateActivity).toHaveBeenCalledWith({
      activityId: "card-1",
      data: expect.objectContaining({ kicker: "SET 3 OF 4", fact: "3/4" }),
    });
    // The same set again sends nothing.
    await showLiftSession({ ...SET_3 });
    expect(plugin.updateActivity).toHaveBeenCalledOnce();
  });

  it("draws no picture for a session whose lead lift has no drawing", async () => {
    await showLiftSession({ ...SET_2, art: null });
    const { layout, data } = started();
    expect(walk(layout).some((el) => el.type === "image")).toBe(false);
    expect(data.pose).toBe("");
  });
});

describe("a rest", () => {
  it("starts the card again with the system's countdown, standing, and the next set", async () => {
    const endsAt = Date.now() + 90_000;
    await showLiftSession(SET_2);
    await showLiftRest({ endsAt });
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "card-1",
      data: {},
      behavior: IMMEDIATE,
    });
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    const { layout, dynamicIslandLayout, data } = started();
    expect(data.kicker).toBe("REST");
    expect(data.pose).toBe("deadlift-pose-3");
    expect(data.line).toBe("Next: Deadlift · set 2 of 4 · 100 kg × 5");
    const timers = [layout, ...Object.values(dynamicIslandLayout)].flatMap(
      (part) =>
        "type" in part
          ? walk(part as Element)
          : Object.values(part).flatMap((el) => walk(el as Element))
    );
    const countdowns = timers.filter((el) => el.type === "timer");
    // The card, the expanded island, the compact side and the smallest.
    expect(countdowns).toHaveLength(4);
    for (const timer of countdowns) {
      expect(prop(timer, "endTime")).toBe(endsAt);
      // Stops at 0:00 with the phone locked and the app asleep.
      expect(prop(timer, "style")).toBe("countdown");
    }
  });

  it("goes back to the set when the rest is stopped", async () => {
    await showLiftSession(SET_2);
    await showLiftRest({ endsAt: Date.now() + 90_000 });
    await showLiftRest(null);
    expect(plugin.startActivity).toHaveBeenCalledTimes(3);
    expect(started().data.kicker).toBe("SET 2 OF 4");
    expect(plugin.endActivity).toHaveBeenLastCalledWith({
      activityId: "card-2",
      data: {},
      behavior: IMMEDIATE,
    });
  });

  it("shows a rest made longer with its new end", async () => {
    const endsAt = Date.now() + 90_000;
    await showLiftSession(SET_2);
    await showLiftRest({ endsAt });
    await showLiftRest({ endsAt: endsAt + 15_000 });
    expect(plugin.startActivity).toHaveBeenCalledTimes(3);
    const timer = walk(started().layout).find((el) => el.type === "timer")!;
    expect(prop(timer, "endTime")).toBe(endsAt + 15_000);
  });

  it("says the rest is over once the app is awake past its end, set up for the next set", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await showLiftSession(SET_2);
    await showLiftRest({ endsAt: Date.now() + 60_000 });
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    // Words, not a countdown: the set's layout again.
    expect(plugin.startActivity).toHaveBeenCalledTimes(3);
    const { layout, data } = started();
    expect(JSON.stringify(layout)).not.toContain('"timer"');
    expect(data).toMatchObject({
      kicker: "REST OVER",
      figure: "Set 2 of 4",
      line: "Deadlift · 100 kg × 5",
      fact: "Go",
      pose: "deadlift-pose-1",
    });
  });
});

describe("the end", () => {
  it("takes the card away at once when the workout is finished or left", async () => {
    await showLiftSession(SET_2);
    await showLiftSession(null);
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "card-1",
      data: {},
      behavior: IMMEDIATE,
    });
  });

  it("says every set is done until the workout is finished", () => {
    expect(liftCardWords({ ...SET_2, set: null, setsDone: 18 }, "set")).toEqual(
      {
        kicker: "ALL SETS DONE",
        figure: "18 sets",
        line: "Finish when you’re ready",
        fact: "Done",
      }
    );
  });
});

describe("the Settings switch", () => {
  it("shows no card while it is off, and takes the card down when turned off mid-lift", async () => {
    await showLiftSession(SET_2);
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    setLiveActivitiesOn(false);
    await vi.dynamicImportSettled();
    await showLiftSession(SET_3);
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "card-1",
      data: {},
      behavior: IMMEDIATE,
    });
    expect(plugin.startActivity).toHaveBeenCalledOnce();
    // On again, mid-lift: the card comes back on the set it is on.
    setLiveActivitiesOn(true);
    await showLiftSession(SET_3);
    expect(plugin.startActivity).toHaveBeenCalledTimes(2);
    expect(started().data.kicker).toBe("SET 3 OF 4");
  });
});

describe("on the web", () => {
  it("shows nothing and throws nothing", async () => {
    vi.mocked(isNativePlatform).mockReturnValue(false);
    await expect(showLiftSession(SET_2)).resolves.toBeUndefined();
    await expect(
      showLiftRest({ endsAt: Date.now() + 1000 })
    ).resolves.toBeUndefined();
    expect(plugin.startActivity).not.toHaveBeenCalled();
  });

  it("throws nothing into the workout when the plugin refuses", async () => {
    plugin.startActivity.mockRejectedValue(new Error("no extension"));
    await expect(showLiftSession(SET_2)).resolves.toBeUndefined();
    await expect(showLiftSession(null)).resolves.toBeUndefined();
    expect(plugin.endActivity).not.toHaveBeenCalled();
  });
});
