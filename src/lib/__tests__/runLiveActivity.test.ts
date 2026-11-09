/**
 * runLiveActivity — the Live Activity seam for active runs.
 *
 * The plugin itself is device-only; what IS unit-testable (and what a
 * mistake here silently breaks on a lock screen nobody in CI can see)
 * is the seam's lifecycle discipline: start-once idempotence, the
 * update throttle + dedup that keeps us inside ActivityKit's budget
 * without losing a pause to it, end-safety in any order, and the
 * guarantee that web / a missing plugin / a rejecting bridge can never
 * throw into the run. What the widget reads from the data is pinned in
 * liveActivityContract.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const startActivity = vi.fn();
const updateActivity = vi.fn();
const endActivity = vi.fn();

vi.mock("capacitor-live-activities", () => {
  return {
    LiveActivities: capacitorPlugin({
      startActivity: (...a: unknown[]) => startActivity(...a),
      updateActivity: (...a: unknown[]) => updateActivity(...a),
      endActivity: (...a: unknown[]) => endActivity(...a),
    }),
  };
});

vi.mock("@/lib/platform", () => ({
  isNativePlatform: vi.fn(() => true),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { isNativePlatform } from "@/lib/platform";
import { PLUGIN_LAYOUT } from "@/lib/liveActivityContract";
import {
  startRunActivity,
  updateRunActivity,
  endRunActivity,
  __resetRunActivityForTests,
  type RunActivityData,
} from "@/lib/runLiveActivity";

const setNative = (v: boolean) =>
  (isNativePlatform as unknown as ReturnType<typeof vi.fn>).mockReturnValue(v);

const DATA: RunActivityData = {
  distance: "1.2 km",
  pace: "5:12 /km",
  elapsed: "6:14",
  label: "Recording",
  paused: false,
};
/** The content state the widget is given for `data`. */
const state = (data: RunActivityData) => ({ kind: "run", ...data });

beforeEach(() => {
  vi.clearAllMocks();
  __resetRunActivityForTests();
  setNative(true);
  startActivity.mockResolvedValue({ activityId: "act-1" });
  updateActivity.mockResolvedValue(undefined);
  endActivity.mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("web / plugin-absent safety", () => {
  it("is inert on web — no plugin call from any function", async () => {
    setNative(false);
    await startRunActivity(DATA);
    await updateRunActivity(DATA);
    await endRunActivity();
    expect(startActivity).not.toHaveBeenCalled();
    expect(updateActivity).not.toHaveBeenCalled();
    expect(endActivity).not.toHaveBeenCalled();
  });

  it("a rejecting bridge never throws into the caller, and a later start can retry", async () => {
    startActivity.mockRejectedValueOnce(new Error("extension not installed"));
    await expect(startRunActivity(DATA)).resolves.toBeUndefined();
    // The failed start held no id — a retry goes through cleanly.
    await startRunActivity(DATA);
    expect(startActivity).toHaveBeenCalledTimes(2);
  });
});

describe("start", () => {
  it("sends the widget the run's data, with the plugin's placeholder layout", async () => {
    await startRunActivity(DATA);
    expect(startActivity).toHaveBeenCalledTimes(1);
    const opts = startActivity.mock.calls[0][0] as {
      layout: unknown;
      dynamicIslandLayout: unknown;
      data: Record<string, unknown>;
    };
    expect(opts.data).toEqual(state(DATA));
    // The widget draws natively; the plugin only needs a layout to exist.
    expect(opts.layout).toEqual(PLUGIN_LAYOUT.layout);
    expect(opts.dynamicIslandLayout).toEqual(PLUGIN_LAYOUT.dynamicIslandLayout);
  });

  it("is idempotent — a second start while one is live is a no-op", async () => {
    await startRunActivity(DATA);
    await startRunActivity(DATA);
    expect(startActivity).toHaveBeenCalledTimes(1);
  });
});

describe("update throttle + dedup", () => {
  it("does nothing before start", async () => {
    await updateRunActivity(DATA);
    expect(updateActivity).not.toHaveBeenCalled();
  });

  it("holds a change inside the 2s window, sends the latest when it opens, and dedupes", async () => {
    await startRunActivity(DATA);

    // 1s later, new data — inside the throttle window: held.
    vi.advanceTimersByTime(1000);
    await updateRunActivity({ ...DATA, elapsed: "6:15" });
    expect(updateActivity).not.toHaveBeenCalled();
    // A newer change replaces the held one.
    vi.advanceTimersByTime(500);
    await updateRunActivity({ ...DATA, elapsed: "6:16" });
    expect(updateActivity).not.toHaveBeenCalled();

    // The window opens 2s after start: the latest is sent, with the held id.
    await vi.advanceTimersByTimeAsync(500);
    expect(updateActivity).toHaveBeenCalledTimes(1);
    expect(updateActivity.mock.calls[0][0]).toEqual({
      activityId: "act-1",
      data: state({ ...DATA, elapsed: "6:16" }),
    });

    // Another window later but IDENTICAL payload: deduped.
    await vi.advanceTimersByTimeAsync(3000);
    await updateRunActivity({ ...DATA, elapsed: "6:16" });
    expect(updateActivity).toHaveBeenCalledTimes(1);
  });

  it("sends a pause that came inside the window, though nothing calls again", async () => {
    // While paused the screen's figures stop moving, so its effect may not
    // run again: a pause dropped by the throttle would never arrive.
    await startRunActivity(DATA);
    vi.advanceTimersByTime(800);
    const paused = { ...DATA, label: "Paused", paused: true };
    await updateRunActivity(paused);
    expect(updateActivity).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1200);
    expect(updateActivity).toHaveBeenCalledTimes(1);
    expect(updateActivity.mock.calls[0][0]).toEqual({
      activityId: "act-1",
      data: state(paused),
    });
  });

  it("drops a held change once the card shows the same again", async () => {
    await startRunActivity(DATA);
    vi.advanceTimersByTime(500);
    await updateRunActivity({ ...DATA, elapsed: "6:15" });
    await updateRunActivity(DATA);
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateActivity).not.toHaveBeenCalled();
  });
});

describe("end", () => {
  it("ends with the held id and final data, then goes inert", async () => {
    await startRunActivity(DATA);
    const final = { ...DATA, label: "Finished" };
    await endRunActivity(final);
    expect(endActivity).toHaveBeenCalledWith({
      activityId: "act-1",
      data: state(final),
    });
    // After end: updates are no-ops and a second end doesn't call again.
    vi.advanceTimersByTime(5000);
    await updateRunActivity({ ...DATA, elapsed: "9:99" });
    await endRunActivity();
    expect(updateActivity).not.toHaveBeenCalled();
    expect(endActivity).toHaveBeenCalledTimes(1);
  });

  it("ends on the last stats sent when no final ones are given, never an empty card", async () => {
    await startRunActivity(DATA);
    vi.advanceTimersByTime(2500);
    await updateRunActivity({ ...DATA, elapsed: "6:17" });
    await endRunActivity();
    expect(endActivity).toHaveBeenCalledWith({
      activityId: "act-1",
      data: state({ ...DATA, elapsed: "6:17" }),
    });
  });

  it("sends nothing held after the end", async () => {
    await startRunActivity(DATA);
    vi.advanceTimersByTime(500);
    await updateRunActivity({ ...DATA, elapsed: "6:15" });
    await endRunActivity();
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateActivity).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing is live (unmount cleanup path)", async () => {
    await endRunActivity();
    expect(endActivity).not.toHaveBeenCalled();
  });

  it("a fresh run after end starts a NEW activity", async () => {
    await startRunActivity(DATA);
    await endRunActivity();
    startActivity.mockResolvedValue({ activityId: "act-2" });
    await startRunActivity(DATA);
    expect(startActivity).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3000);
    await updateRunActivity({ ...DATA, elapsed: "0:05" });
    expect(updateActivity.mock.calls[0][0]).toMatchObject({
      activityId: "act-2",
    });
  });
});
