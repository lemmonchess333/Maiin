import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  scheduleNotification,
  cancelNotification,
  cancelAllNotifications,
} from "../notifications";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));
const delivered = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  delivered.mockClear();
  class NotificationMock {
    static permission = "granted";
    constructor(title: string) {
      delivered(title);
    }
  }
  vi.stubGlobal("Notification", NotificationMock);
  vi.stubGlobal("window", { Notification: NotificationMock });
});
afterEach(async () => {
  await cancelAllNotifications();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("cancels the actual web timeout when its ID is suppressed", async () => {
  await scheduleNotification({
    id: 1002,
    title: "Lunch",
    body: "",
    scheduleAt: new Date(Date.now() + 1000),
  });
  await cancelNotification(1002);
  await vi.advanceTimersByTimeAsync(2000);
  expect(delivered).not.toHaveBeenCalled();
});
it("replacing a reminder leaves only the latest fire time", async () => {
  await scheduleNotification({
    id: 1002,
    title: "Old",
    body: "",
    scheduleAt: new Date(Date.now() + 1000),
  });
  await scheduleNotification({
    id: 1002,
    title: "New",
    body: "",
    scheduleAt: new Date(Date.now() + 3000),
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(delivered).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(delivered).toHaveBeenCalledExactlyOnceWith("New");
});
