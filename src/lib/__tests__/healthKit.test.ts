/**
 * healthKit.ts runs only inside the iOS app, so nothing in the unit suite
 * reached it: every function returns at its `isNativePlatform()` guard on
 * the web. These drive both sides of that guard with the platform, the
 * `@capgo/capacitor-health` plugin and the app's own WatchRun plugin mocked,
 * so what the phone does is pinned here rather than found on a device.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const native = vi.fn(() => true);
vi.mock("../platform", () => ({ isNativePlatform: () => native() }));

const plugin = {
  isAvailable: vi.fn(),
  requestAuthorization: vi.fn(),
  queryAggregated: vi.fn(),
  readSamples: vi.fn(),
};
vi.mock("@capgo/capacitor-health", () => {
  return { Health: capacitorPlugin(plugin) };
});

/* The settings link is the app's own WatchRun plugin: the Health plugin
   opens nothing on iOS. */
const watchRun = { openAppSettings: vi.fn() };
const registered: string[] = [];
vi.mock("@capacitor/core", () => ({
  registerPlugin: (name: string) => {
    registered.push(name);
    return capacitorPlugin(watchRun);
  },
}));

import {
  getTodayStepTotal,
  isHealthAvailable,
  openHealthSettings,
  readDailyAverages,
  readDailyStepTotals,
  readSleepSamples,
  requestBodySignalsReadPermission,
  requestStepsReadPermission,
} from "../healthKit";

beforeEach(() => {
  vi.clearAllMocks();
  native.mockReturnValue(true);
});

describe("on the web", () => {
  it("never reaches the plugin, and answers as unavailable", async () => {
    native.mockReturnValue(false);
    expect(await isHealthAvailable()).toBe(false);
    expect(await requestStepsReadPermission()).toBe("denied");
    expect(await getTodayStepTotal()).toBeNull();
    expect(await requestBodySignalsReadPermission()).toBe("denied");
    expect(await readSleepSamples(new Date(), new Date())).toBeNull();
    expect(
      await readDailyAverages("restingHeartRate", new Date(), new Date())
    ).toBeNull();
    expect(await readDailyStepTotals(new Date(), new Date())).toBeNull();
    await openHealthSettings();
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled();
    expect(watchRun.openAppSettings).not.toHaveBeenCalled();
  });
});

describe("in the iOS app", () => {
  it("reports what the plugin says about availability, and false when it throws", async () => {
    plugin.isAvailable.mockResolvedValueOnce({ available: true });
    expect(await isHealthAvailable()).toBe(true);
    plugin.isAvailable.mockResolvedValueOnce({ available: false });
    expect(await isHealthAvailable()).toBe(false);
    plugin.isAvailable.mockRejectedValueOnce(new Error("no bridge"));
    expect(await isHealthAvailable()).toBe(false);
  });

  it("asks for step reads alone, and calls a completed request granted", async () => {
    // iOS never says whether a read was refused, so a request that
    // completes is all there is to go on.
    plugin.requestAuthorization.mockResolvedValueOnce({
      readAuthorized: [],
      readDenied: [],
      writeAuthorized: [],
      writeDenied: [],
    });
    expect(await requestStepsReadPermission()).toBe("granted");
    expect(plugin.requestAuthorization).toHaveBeenCalledWith({
      read: ["steps"],
    });
    plugin.requestAuthorization.mockRejectedValueOnce(new Error("x"));
    expect(await requestStepsReadPermission()).toBe("denied");
  });

  it("totals today's steps from local midnight, rounded", async () => {
    plugin.queryAggregated.mockResolvedValueOnce({
      samples: [{ value: 4120.4 }, { value: 1000.3 }, {}],
    });
    expect(await getTodayStepTotal()).toBe(5121);

    const query = plugin.queryAggregated.mock.calls[0][0];
    expect(query).toMatchObject({
      dataType: "steps",
      bucket: "day",
      aggregation: "sum",
    });
    const start = new Date(query.startDate);
    const now = new Date();
    // Local midnight of the local day, whatever the zone: a UTC midnight
    // would count a day that starts hours off the person's own.
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([
      0, 0, 0,
    ]);
    expect(start.getDate()).toBe(new Date(query.endDate).getDate());
    expect(new Date(query.endDate).getTime()).toBeLessThanOrEqual(
      now.getTime()
    );
  });

  it("reads 0 for a day with no samples, and null when the query throws", async () => {
    plugin.queryAggregated.mockResolvedValueOnce({});
    expect(await getTodayStepTotal()).toBe(0);
    plugin.queryAggregated.mockRejectedValueOnce(new Error("x"));
    expect(await getTodayStepTotal()).toBeNull();
  });

  it("totals each day's steps by local day for the activity level offer", async () => {
    // Q31: a week of day buckets from one statistics query, which counts
    // a step the phone and a Watch both saw once. A day with nothing is
    // left out, so the offer reads it as no reading.
    const monday = new Date(2026, 10, 2, 0, 0, 0);
    const sunday = new Date(2026, 10, 8, 0, 0, 0);
    plugin.queryAggregated.mockResolvedValueOnce({
      samples: [
        { startDate: monday.toISOString(), value: 8123.6 },
        { startDate: sunday.toISOString(), value: 0 },
        { startDate: "2026-11-05", value: 10400 },
      ],
    });
    const end = new Date(2026, 10, 9, 0, 0, 0);
    expect(await readDailyStepTotals(monday, end)).toEqual([
      { dateKey: "2026-11-02", value: 8124 },
      { dateKey: "2026-11-05", value: 10400 },
    ]);
    expect(plugin.queryAggregated).toHaveBeenLastCalledWith({
      dataType: "steps",
      startDate: monday.toISOString(),
      endDate: end.toISOString(),
      bucket: "day",
      aggregation: "sum",
    });
    plugin.queryAggregated.mockRejectedValueOnce(new Error("x"));
    expect(await readDailyStepTotals(monday, end)).toBeNull();
  });

  it("opens the app's settings page through WatchRun, and swallows a refusal", async () => {
    await openHealthSettings();
    expect(watchRun.openAppSettings).toHaveBeenCalledTimes(1);
    expect(registered).toContain("WatchRun");
    watchRun.openAppSettings.mockRejectedValueOnce(new Error("x"));
    await expect(openHealthSettings()).resolves.toBeUndefined();
  });
});

describe("readiness's sleep and heart, in the iOS app", () => {
  it("asks to read sleep, resting heart rate and HRV, and nothing else", async () => {
    plugin.requestAuthorization.mockResolvedValueOnce({
      readAuthorized: [],
      readDenied: [],
      writeAuthorized: [],
      writeDenied: [],
    });
    expect(await requestBodySignalsReadPermission()).toBe("granted");
    expect(plugin.requestAuthorization).toHaveBeenCalledWith({
      read: ["sleep", "restingHeartRate", "heartRateVariability"],
    });
    plugin.requestAuthorization.mockRejectedValueOnce(new Error("x"));
    expect(await requestBodySignalsReadPermission()).toBe("denied");
  });

  it("reads sleep samples oldest first, keeping only times and stage", async () => {
    plugin.readSamples.mockResolvedValueOnce({
      samples: [
        {
          dataType: "sleep",
          value: 120,
          unit: "minute",
          startDate: "2026-11-12T23:00:00.000Z",
          endDate: "2026-11-13T01:00:00.000Z",
          sleepState: "deep",
          sourceName: "Watch",
        },
      ],
    });
    const start = new Date("2026-10-15T18:00:00.000Z");
    const end = new Date("2026-11-13T09:00:00.000Z");
    expect(await readSleepSamples(start, end)).toEqual([
      {
        startDate: "2026-11-12T23:00:00.000Z",
        endDate: "2026-11-13T01:00:00.000Z",
        sleepState: "deep",
      },
    ]);
    expect(plugin.readSamples).toHaveBeenCalledWith(
      expect.objectContaining({
        dataType: "sleep",
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        ascending: true,
      })
    );
    plugin.readSamples.mockRejectedValueOnce(new Error("x"));
    expect(await readSleepSamples(start, end)).toBeNull();
  });

  it("reads a day's average by local day, and drops empty days", async () => {
    const day = new Date(2026, 10, 12, 0, 0, 0);
    plugin.queryAggregated.mockResolvedValueOnce({
      samples: [
        { startDate: day.toISOString(), value: 54.4, values: {}, unit: "bpm" },
        { startDate: day.toISOString(), value: 0, values: {}, unit: "bpm" },
      ],
    });
    expect(
      await readDailyAverages("restingHeartRate", day, new Date())
    ).toEqual([{ dateKey: "2026-11-12", value: 54.4 }]);
    expect(plugin.queryAggregated).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dataType: "restingHeartRate",
        bucket: "day",
        aggregation: "average",
      })
    );
    // A bucket given as a bare day is that day, in every timezone.
    plugin.queryAggregated.mockResolvedValueOnce({
      samples: [{ startDate: "2026-11-12", value: 41, values: {}, unit: "ms" }],
    });
    expect(
      await readDailyAverages("heartRateVariability", day, new Date())
    ).toEqual([{ dateKey: "2026-11-12", value: 41 }]);
  });
});
