/**
 * liveActivities — the one way into the Live Activity plugin, for the run's
 * card and a lift's rest.
 *
 * Pinned here, because no CI run can see a Lock Screen:
 * - every card is ended with the patched plugin's `dismissalPolicy:
 *   "immediate"`, or iOS keeps it up for four hours after it ends;
 * - the cards an earlier launch left (its ids forgotten when the app
 *   closed) are ended before the first card of this launch starts, and
 *   only then, so the sweep can never take down a card of this launch;
 * - nothing the sweep meets stops a card from starting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  startActivity: vi.fn(),
  updateActivity: vi.fn(),
  endActivity: vi.fn(),
  getAllActivities: vi.fn(),
}));
vi.mock("capacitor-live-activities", async () => {
  const { capacitorPlugin: wrap } = await import("@/test/capacitorPlugin");
  return {
    LiveActivities: wrap({
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
import {
  __resetLiveActivitiesForTests,
  loadLiveActivities,
} from "@/lib/liveActivities";
import {
  __resetRestActivityForTests,
  endRestActivity,
  startRestActivity,
} from "@/lib/restLiveActivity";
import {
  __resetRunActivityForTests,
  endRunActivity,
  startRunActivity,
} from "@/lib/runLiveActivity";

const RUN = {
  distance: "1.2 km",
  pace: "5:12 /km",
  elapsed: "6:14",
  label: "Recording",
};
const IMMEDIATE = { dismissalPolicy: "immediate" };

beforeEach(() => {
  vi.clearAllMocks();
  __resetLiveActivitiesForTests();
  __resetRestActivityForTests();
  __resetRunActivityForTests();
  vi.mocked(isNativePlatform).mockReturnValue(true);
  plugin.startActivity.mockResolvedValue({ activityId: "this-launch" });
  plugin.endActivity.mockResolvedValue(undefined);
  plugin.getAllActivities.mockResolvedValue({ activities: [] });
});

describe("a card's end", () => {
  it("takes a rest off the Lock Screen at once", async () => {
    await startRestActivity({ endsAt: Date.now() + 90_000 });
    await endRestActivity();
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "this-launch",
      data: {},
      behavior: IMMEDIATE,
    });
  });

  it("takes a run off the Lock Screen at once", async () => {
    await startRunActivity(RUN);
    await endRunActivity();
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "this-launch",
      data: {},
      behavior: IMMEDIATE,
    });
  });
});

describe("the cards an earlier launch left", () => {
  it("are ended at once before this launch's first card starts", async () => {
    // As the patched plugin sends them: `id` is the one endActivity takes.
    plugin.getAllActivities.mockResolvedValue({
      activities: [
        { id: "left-run", state: "active", systemId: "s1" },
        { id: "left-rest", state: "stale", systemId: "s2" },
      ],
    });
    await startRestActivity({ endsAt: Date.now() + 90_000 });
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "left-run",
      data: {},
      behavior: IMMEDIATE,
    });
    expect(plugin.endActivity).toHaveBeenCalledWith({
      activityId: "left-rest",
      data: {},
      behavior: IMMEDIATE,
    });
    const lastEnd = Math.max(...plugin.endActivity.mock.invocationCallOrder);
    expect(plugin.startActivity.mock.invocationCallOrder[0]).toBeGreaterThan(
      lastEnd
    );
  });

  it("are looked for once a launch, so this launch's cards are never swept", async () => {
    await startRunActivity(RUN);
    plugin.getAllActivities.mockResolvedValue({
      activities: [{ id: "this-launch", state: "active", systemId: "s1" }],
    });
    await startRestActivity({ endsAt: Date.now() + 90_000 });
    await loadLiveActivities();
    expect(plugin.getAllActivities).toHaveBeenCalledOnce();
    expect(plugin.endActivity).not.toHaveBeenCalled();
  });

  it("don't stop a card when iOS can't list them", async () => {
    // Below iOS 16.2 the plugin refuses the list.
    plugin.getAllActivities.mockRejectedValue(new Error("iOS 16.2+"));
    await startRunActivity(RUN);
    expect(plugin.startActivity).toHaveBeenCalledOnce();
  });

  it("don't stop the others, or a card, when one won't end", async () => {
    plugin.getAllActivities.mockResolvedValue({
      activities: [
        { id: "gone", state: "dismissed", systemId: "s1" },
        { id: "left-rest", state: "active", systemId: "s2" },
      ],
    });
    plugin.endActivity.mockImplementation(async ({ activityId }) => {
      if (activityId === "gone") throw new Error("activityNotFound");
    });
    await startRestActivity({ endsAt: Date.now() + 90_000 });
    expect(plugin.endActivity).toHaveBeenCalledTimes(2);
    expect(plugin.startActivity).toHaveBeenCalledOnce();
  });
});

describe("on the web", () => {
  it("loads nothing and lists nothing", async () => {
    vi.mocked(isNativePlatform).mockReturnValue(false);
    await expect(loadLiveActivities()).resolves.toBeNull();
    await startRestActivity({ endsAt: Date.now() + 90_000 });
    await startRunActivity(RUN);
    expect(plugin.getAllActivities).not.toHaveBeenCalled();
    expect(plugin.startActivity).not.toHaveBeenCalled();
  });
});

describe("the holder", () => {
  it("hands the plugin back held, so the bridge's `then` is never asked", async () => {
    // capacitorPlugin answers `then` with a call that never settles, as the
    // native bridge does: resolving with the plugin itself would hang here.
    const opened = await loadLiveActivities();
    expect(opened).not.toBeNull();
    expect(typeof opened?.plugin.startActivity).toBe("function");
  });
});
