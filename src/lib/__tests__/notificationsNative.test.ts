/**
 * The rest of notifications.ts's native half: the permission reads, the
 * refusal to schedule without permission, and cancelling. Every reminder
 * suite mocks this module, and `nativeReminderSchedule.test.ts` covers only
 * the schedule shape, so these paths had run on no machine but a phone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  checkPermissions: vi.fn(),
  schedule: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  getPending: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: plugin,
}));

import {
  cancelAllNotifications,
  cancelNotification,
  getNotificationPermissionState,
  hasNotificationPermission,
  requestNotificationPermission,
  scheduleNotification,
} from "../notifications";

beforeEach(() => {
  vi.clearAllMocks();
  plugin.checkPermissions.mockResolvedValue({ display: "granted" });
});

describe("permission, as the plugin reports it", () => {
  it("is granted only when the display permission is", async () => {
    plugin.requestPermissions.mockResolvedValueOnce({ display: "granted" });
    expect(await requestNotificationPermission()).toBe(true);
    plugin.requestPermissions.mockResolvedValueOnce({ display: "denied" });
    expect(await requestNotificationPermission()).toBe(false);
    plugin.checkPermissions.mockResolvedValueOnce({ display: "prompt" });
    expect(await hasNotificationPermission()).toBe(false);
  });

  it("tells a refusal from not having been asked", async () => {
    // Settings shows its "turn them on in Settings" banner only for a real
    // refusal; a prompt still to come is asked for in the app.
    for (const [display, state] of [
      ["granted", "granted"],
      ["denied", "denied"],
      ["prompt", "default"],
      ["prompt-with-rationale", "default"],
    ] as const) {
      plugin.checkPermissions.mockResolvedValueOnce({ display });
      expect(await getNotificationPermissionState()).toBe(state);
    }
  });

  it("reads a plugin that throws as no permission, without throwing", async () => {
    plugin.requestPermissions.mockRejectedValueOnce(new Error("x"));
    expect(await requestNotificationPermission()).toBe(false);
    plugin.checkPermissions.mockRejectedValueOnce(new Error("x"));
    expect(await hasNotificationPermission()).toBe(false);
    plugin.checkPermissions.mockRejectedValueOnce(new Error("x"));
    expect(await getNotificationPermissionState()).toBe("unsupported");
  });
});

describe("scheduling and cancelling", () => {
  it("schedules nothing without permission", async () => {
    plugin.checkPermissions.mockResolvedValueOnce({ display: "denied" });
    expect(
      await scheduleNotification({ id: 7, title: "Lunch", body: "Log it" })
    ).toBe(false);
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("says a schedule the plugin refused did not happen", async () => {
    plugin.schedule.mockRejectedValueOnce(new Error("x"));
    expect(
      await scheduleNotification({ id: 7, title: "Lunch", body: "Log it" })
    ).toBe(false);
  });

  it("cancels one reminder by its id", async () => {
    await cancelNotification(42);
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 42 }] });
  });

  it("cancels every pending reminder, and calls nothing when there are none", async () => {
    const pending = [{ id: 1 }, { id: 2 }];
    plugin.getPending.mockResolvedValueOnce({ notifications: pending });
    await cancelAllNotifications();
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: pending });

    plugin.cancel.mockClear();
    plugin.getPending.mockResolvedValueOnce({ notifications: [] });
    await cancelAllNotifications();
    expect(plugin.cancel).not.toHaveBeenCalled();
  });

  it("swallows a cancel the plugin refuses", async () => {
    plugin.cancel.mockRejectedValueOnce(new Error("x"));
    await expect(cancelNotification(1)).resolves.toBeUndefined();
    plugin.getPending.mockRejectedValueOnce(new Error("x"));
    await expect(cancelAllNotifications()).resolves.toBeUndefined();
  });
});
