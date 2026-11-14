// @vitest-environment jsdom — the record lives in localStorage; the rest of this directory runs in the node environment.
/**
 * notifications.ts keeps the phone's record of its reminders for App1 Q62
 * (`reminderFires.ts`): a native reminder with a kind carries it to the
 * system and is recorded when scheduled, a cancel keeps what it fired, and
 * a tap on one is its answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  checkPermissions: vi.fn(),
  schedule: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  getPending: vi.fn(async () => ({ notifications: [] })),
  addListener: vi.fn(),
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
  listenForNotificationRoutes,
  scheduleNotification,
} from "../notifications";
import { clearReminderFires, takeReminderCount } from "../reminderFires";

const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  plugin.checkPermissions.mockResolvedValue({ display: "granted" });
  clearReminderFires();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the phone's record of its reminders", () => {
  it("carries the kind to the system, and counts what fired while the app was away", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 6, 0) });
    await scheduleNotification({
      id: 2001,
      title: "Pull A today",
      body: "Ready when you are.",
      scheduleAt: new Date(2026, 10, 10, 7, 0),
      repeats: true,
      kind: "training",
    });
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({ id: 2001, extra: { kind: "training" } }),
      ],
    });
    // Three mornings with no app, then it opens.
    vi.setSystemTime(new Date(2026, 10, 10, 6, 0).getTime() + 3 * DAY + 3e6);
    expect(takeReminderCount(true)).toEqual(["training"]);
  });

  it("keeps what a cancelled reminder fired", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 6, 0) });
    await scheduleNotification({
      id: 2001,
      title: "Pull A today",
      body: "Ready when you are.",
      scheduleAt: new Date(2026, 10, 10, 7, 0),
      repeats: true,
      kind: "training",
    });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
    await cancelNotification(2001);
    expect(takeReminderCount(true)).toEqual(["training"]);
  });

  it("forgets it all at sign-out, with the alarms", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 6, 0) });
    await scheduleNotification({
      id: 2001,
      title: "Pull A today",
      body: "Ready when you are.",
      scheduleAt: new Date(2026, 10, 10, 7, 0),
      repeats: true,
      kind: "training",
    });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
    await cancelAllNotifications();
    expect(takeReminderCount(true)).toEqual([]);
  });

  it("records a tap on a reminder as its answer", async () => {
    let tapped: ((action: unknown) => void) | undefined;
    plugin.addListener.mockImplementation(async (_event, listener) => {
      tapped = listener;
      return { remove: async () => {} };
    });
    const routes: string[] = [];
    await listenForNotificationRoutes((route) => routes.push(route));
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 6, 0) });
    await scheduleNotification({
      id: 2001,
      title: "Pull A today",
      body: "Ready when you are.",
      scheduleAt: new Date(2026, 10, 9, 7, 0),
      repeats: true,
      kind: "training",
    });
    // Each morning's reminder is tapped, after midnight, the day after.
    for (const day of [10, 11, 12]) {
      vi.setSystemTime(new Date(2026, 10, day, 0, 30));
      tapped?.({ notification: { extra: { kind: "training" } } });
      expect(takeReminderCount(true)).toEqual([]);
    }
    tapped?.({ notification: { extra: { kind: "review", route: "/review" } } });
    expect(routes).toEqual(["/review"]);
  });
});
