/**
 * healthKit.ts runs only inside the iOS app, so nothing in the unit suite
 * reached it: every function returns at its `isNativePlatform()` guard on
 * the web. These drive both sides of that guard with the platform and the
 * `capacitor-health` plugin mocked, so what the phone does is pinned here
 * rather than found on a device.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.fn(() => true);
vi.mock("../platform", () => ({ isNativePlatform: () => native() }));

const plugin = {
  isHealthAvailable: vi.fn(),
  requestHealthPermissions: vi.fn(),
  queryAggregated: vi.fn(),
  openAppleHealthSettings: vi.fn(),
};
vi.mock("capacitor-health", () => ({ Health: plugin }));

import {
  getTodayStepTotal,
  isHealthAvailable,
  openHealthSettings,
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
    await openHealthSettings();
    for (const fn of Object.values(plugin)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("in the iOS app", () => {
  it("reports what the plugin says about availability, and false when it throws", async () => {
    plugin.isHealthAvailable.mockResolvedValueOnce({ available: true });
    expect(await isHealthAvailable()).toBe(true);
    plugin.isHealthAvailable.mockResolvedValueOnce({ available: false });
    expect(await isHealthAvailable()).toBe(false);
    plugin.isHealthAvailable.mockRejectedValueOnce(new Error("no bridge"));
    expect(await isHealthAvailable()).toBe(false);
  });

  it("asks for step reads alone, and calls a completed request granted", async () => {
    // iOS never says whether a read was refused, so a request that
    // completes is all there is to go on.
    plugin.requestHealthPermissions.mockResolvedValueOnce({});
    expect(await requestStepsReadPermission()).toBe("granted");
    expect(plugin.requestHealthPermissions).toHaveBeenCalledWith({
      permissions: ["READ_STEPS"],
    });
    plugin.requestHealthPermissions.mockRejectedValueOnce(new Error("x"));
    expect(await requestStepsReadPermission()).toBe("denied");
  });

  it("totals today's steps from local midnight, rounded", async () => {
    plugin.queryAggregated.mockResolvedValueOnce({
      aggregatedData: [{ value: 4120.4 }, { value: 1000.3 }, {}],
    });
    expect(await getTodayStepTotal()).toBe(5121);

    const query = plugin.queryAggregated.mock.calls[0][0];
    expect(query).toMatchObject({ dataType: "steps", bucket: "day" });
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

  it("opens the app's Health settings, and swallows a refusal", async () => {
    await openHealthSettings();
    expect(plugin.openAppleHealthSettings).toHaveBeenCalledTimes(1);
    plugin.openAppleHealthSettings.mockRejectedValueOnce(new Error("x"));
    await expect(openHealthSettings()).resolves.toBeUndefined();
  });
});
