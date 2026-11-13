/**
 * runLiveActivity — the Live Activity seam for active runs.
 *
 * The plugin itself is device-only; what IS unit-testable (and what a
 * mistake here silently breaks on a lock screen nobody in CI can see)
 * is the seam's lifecycle discipline: start-once idempotence, the
 * update throttle + dedup that keeps us inside ActivityKit's budget,
 * end-safety in any order, and the guarantee that web / a missing
 * plugin / a rejecting bridge can never throw into the run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const startActivity = vi.fn();
const updateActivity = vi.fn();
const endActivity = vi.fn();
const getAllActivities = vi.fn();

vi.mock("capacitor-live-activities", () => {
  return {
    LiveActivities: capacitorPlugin({
      startActivity: (...a: unknown[]) => startActivity(...a),
      updateActivity: (...a: unknown[]) => updateActivity(...a),
      endActivity: (...a: unknown[]) => endActivity(...a),
      getAllActivities: (...a: unknown[]) => getAllActivities(...a),
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
import { __resetLiveActivitiesForTests } from "@/lib/liveActivities";
import {
  startRunActivity,
  updateRunActivity,
  endRunActivity,
  mixHex,
  runCardData,
  __resetRunActivityForTests,
  type RunActivityData,
} from "@/lib/runLiveActivity";

const setNative = (v: boolean) =>
  (isNativePlatform as unknown as ReturnType<typeof vi.fn>).mockReturnValue(v);

const DATA: RunActivityData = {
  distance: "1.2 km",
  pace: "5:12 /km",
  elapsed: "6:14",
  label: "Easy 30",
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRunActivityForTests();
  __resetLiveActivitiesForTests();
  setNative(true);
  startActivity.mockResolvedValue({ activityId: "act-1" });
  updateActivity.mockResolvedValue(undefined);
  endActivity.mockResolvedValue(undefined);
  getAllActivities.mockResolvedValue({ activities: [] });
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
  it("declares the layout with placeholder bindings and the initial data", async () => {
    await startRunActivity(DATA);
    expect(startActivity).toHaveBeenCalledTimes(1);
    const opts = startActivity.mock.calls[0][0] as {
      layout: unknown;
      dynamicIslandLayout: unknown;
      data: Record<string, string>;
    };
    expect(opts.data).toEqual(runCardData(DATA, 0));
    const layoutJson = JSON.stringify(opts.layout);
    for (const binding of [
      "{{pose}}",
      "{{poseOpacity}}",
      "{{kicker}}",
      "{{distanceValue}}",
      "{{distanceUnit}}",
      "{{line}}",
    ]) {
      expect(layoutJson).toContain(binding);
    }
    // Every binding either layout names is in the data it starts with: a
    // placeholder with no value draws nothing, or the fallback photo icon.
    const diJson = JSON.stringify(opts.dynamicIslandLayout);
    const bindings = [...(layoutJson + diJson).matchAll(/\{\{(\w+)\}\}/g)].map(
      (m) => m[1]
    );
    expect(bindings.length).toBeGreaterThan(8);
    for (const key of bindings) expect(opts.data).toHaveProperty(key);
  });

  it("leads with the runner's drawing, held in the widget by name (Wid2 call 1)", async () => {
    await startRunActivity(DATA);
    const opts = startActivity.mock.calls[0][0] as {
      layout: { children: { type: string; properties: object[] }[] };
      dynamicIslandLayout: {
        expanded: { bottom: { children: { type: string }[] } };
        compactTrailing: { properties: object[] };
        minimal: { type: string; properties: object[] };
      };
      data: Record<string, string>;
      behavior: Record<string, string>;
    };
    // The card and the expanded island both open on the drawing.
    expect(opts.layout.children[0].type).toBe("image");
    expect(opts.layout.children[0].properties).toContainEqual({
      asset: "{{pose}}",
    });
    expect(opts.dynamicIslandLayout.expanded.bottom.children[0].type).toBe(
      "image"
    );
    expect(opts.data.pose).toBe("run-easy-pose-1");
    // The session's name sits with the drawing, under the camera, on one
    // line: beside the camera there is room for about a dozen letters.
    const expanded = opts.dynamicIslandLayout.expanded as unknown as {
      leading: { type: string };
      bottom: { children: { children?: { properties: object[] }[] }[] };
    };
    expect(expanded.leading.type).toBe("image");
    const words = expanded.bottom.children[1].children!;
    expect(words[0].properties).toContainEqual({ text: "{{kicker}}" });
    expect(words[0].properties).toContainEqual({ lineLimit: 1 });
    // The smallest size shows the distance, not an icon: Apple asks for
    // something live there.
    expect(opts.dynamicIslandLayout.minimal.type).toBe("text");
    expect(opts.dynamicIslandLayout.minimal.properties).toContainEqual({
      text: "{{distanceValue}}",
    });
    // The card is dark to its corners, with the run's light in one of them.
    expect(opts.behavior.backgroundTint).toBe("#17171B");
    expect(JSON.stringify(opts.layout)).toContain(
      mixHex("#17171B", "#D4637A", 0.22)
    );
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

  it("skips inside the 2s window, sends after it, and dedupes unchanged payloads", async () => {
    await startRunActivity(DATA);

    // 1s later, new data — inside the throttle window: skipped.
    vi.advanceTimersByTime(1000);
    await updateRunActivity({ ...DATA, elapsed: "6:15" });
    expect(updateActivity).not.toHaveBeenCalled();

    // 2.5s after start — window open: sent, with the held id.
    vi.advanceTimersByTime(1500);
    await updateRunActivity({ ...DATA, elapsed: "6:16" });
    expect(updateActivity).toHaveBeenCalledTimes(1);
    expect(updateActivity.mock.calls[0][0]).toEqual({
      activityId: "act-1",
      data: runCardData({ ...DATA, elapsed: "6:16" }, 0),
    });

    // Another window later but IDENTICAL payload: deduped.
    vi.advanceTimersByTime(3000);
    await updateRunActivity({ ...DATA, elapsed: "6:16" });
    expect(updateActivity).toHaveBeenCalledTimes(1);
  });
});

describe("the drawing's pose", () => {
  const sendAt = async (
    elapsed: string,
    extra: Partial<RunActivityData> = {}
  ) => {
    vi.advanceTimersByTime(2500);
    await updateRunActivity({ ...DATA, elapsed, ...extra });
    return (
      updateActivity.mock.calls.at(-1)![0] as { data: Record<string, string> }
    ).data;
  };

  it("takes its next pose on every second update, and comes round to the first", async () => {
    await startRunActivity(DATA);
    const poses: string[] = [];
    for (let i = 0; i < 9; i++) poses.push((await sendAt(`7:0${i}`)).pose);
    expect(poses).toEqual([
      "run-easy-pose-1",
      "run-easy-pose-2",
      "run-easy-pose-2",
      "run-easy-pose-3",
      "run-easy-pose-3",
      "run-easy-pose-4",
      "run-easy-pose-4",
      "run-easy-pose-1",
      "run-easy-pose-1",
    ]);
  });

  it("holds its pose, dimmed, while the run is paused", async () => {
    await startRunActivity(DATA);
    const moving = await sendAt("7:00");
    expect(moving.poseOpacity).toBe("1");
    const paused = await sendAt("7:02", { label: "Paused", paused: true });
    const still = await sendAt("7:03", { label: "Paused", paused: true });
    expect(paused.kicker).toBe("PAUSED");
    expect(paused.poseOpacity).toBe("0.45");
    expect(still.pose).toBe(paused.pose);
    expect(paused.pose).toBe(moving.pose);
  });
});

describe("what the card says", () => {
  it("splits the distance into its figure and its unit", () => {
    expect(runCardData(DATA, 0)).toMatchObject({
      kicker: "EASY 30",
      distanceValue: "1.2",
      distanceUnit: "km",
      line: "5:12 /km · 6:14",
      paceLine: "Pace 5:12 /km",
      elapsed: "6:14",
    });
    expect(runCardData({ ...DATA, distance: "0.7 mi" }, 0)).toMatchObject({
      distanceValue: "0.7",
      distanceUnit: "mi",
    });
  });

  it("shows the dash alone before the run has a distance", () => {
    expect(runCardData({ ...DATA, distance: "—" }, 0)).toMatchObject({
      distanceValue: "—",
      distanceUnit: "",
    });
  });

  it("mixes the light as one opaque colour, since the gradient takes no alpha", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#17171B", "#D4637A", 0)).toBe("#17171B");
    expect(mixHex("#17171B", "#D4637A", 1)).toBe("#D4637A");
  });
});

describe("end", () => {
  it("ends with the held id and final data, then goes inert", async () => {
    await startRunActivity(DATA);
    const final = { ...DATA, label: "Finished" };
    await endRunActivity(final);
    expect(endActivity).toHaveBeenCalledWith({
      activityId: "act-1",
      data: runCardData(final, 0),
      behavior: { dismissalPolicy: "immediate" },
    });
    // After end: updates are no-ops and a second end doesn't call again.
    vi.advanceTimersByTime(5000);
    await updateRunActivity({ ...DATA, elapsed: "9:99" });
    await endRunActivity();
    expect(updateActivity).not.toHaveBeenCalled();
    expect(endActivity).toHaveBeenCalledTimes(1);
  });

  it("an end while the card is still starting takes it down once it shows", async () => {
    let shown!: (result: { activityId: string }) => void;
    startActivity.mockReturnValue(new Promise((resolve) => (shown = resolve)));
    const start = startRunActivity(DATA);
    // Discarded before iOS has answered: the card must not stay on
    // "Recording" with no one left to end it.
    const end = endRunActivity();
    shown({ activityId: "act-1" });
    await Promise.all([start, end]);
    expect(endActivity).toHaveBeenCalledWith({
      activityId: "act-1",
      data: {},
      behavior: { dismissalPolicy: "immediate" },
    });
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
