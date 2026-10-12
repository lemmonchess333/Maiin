/**
 * Settings > Notifications offers the push switch only where remote push
 * exists. The iPhone app has none (no APNs, no push plugin, no service
 * worker in WKWebView), and its switch could only fail with "Couldn't
 * register for push (unsupported)". The local reminders stay on both; the
 * web keeps everything it had.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/pushNotifications", () => ({
  isRemotePushOffered: () => !platform.native,
  registerDeviceToken: vi.fn(),
  unregisterDeviceToken: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));
vi.mock("@/hooks/usePushSettings", () => ({
  usePushSettings: () => ({
    consent: { enabled: true, streak: true, recap: true, badge: true },
    update: vi.fn(),
  }),
}));
vi.mock("@/lib/notifications", () => ({
  getNotificationPermissionState: async () => "granted",
  requestNotificationPermission: vi.fn(async () => true),
  getPendingNotifications: async () => [],
  sendTestNotification: vi.fn(async () => true),
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import NotificationsSection from "../NotificationsSection";

function renderSection() {
  render(
    <NotificationsSection
      inline
      mealReminders={{
        enabled: true,
        breakfast: { enabled: true, time: "08:00" },
        lunch: { enabled: true, time: "12:30" },
        dinner: { enabled: true, time: "18:30" },
      }}
      updateMealReminders={vi.fn(async () => {})}
      workoutReminders={{ enabled: true, time: "17:00" }}
      updateWorkoutReminders={vi.fn(async () => {})}
      streakReminder={{
        enabled: true,
        time: "20:00",
        primingShown: true,
        firstWeekNudgeDateKey: null,
      }}
      updateStreakReminder={vi.fn(async () => {})}
    />
  );
}

const REMINDER_SWITCHES = [
  "Toggle meal reminders",
  "Toggle workout reminders",
  "Toggle streak reminder",
];
const PUSH_SWITCHES = [
  "Toggle push notifications",
  "Toggle Streak nudges push",
  "Toggle Weekly recap push",
  "Toggle Badge unlocked push",
];

beforeEach(() => {
  platform.native = false;
});
afterEach(() => {
  cleanup();
});

describe("NotificationsSection — push where it exists", () => {
  it("offers the push switches and the test push on the web", () => {
    renderSection();
    for (const name of [...REMINDER_SWITCHES, ...PUSH_SWITCHES]) {
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Send a test push")).toBeInTheDocument();
  });

  it("keeps the reminders on the native app and offers no push there", () => {
    platform.native = true;
    renderSection();
    for (const name of REMINDER_SWITCHES) {
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    }
    for (const name of PUSH_SWITCHES) {
      expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
    }
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/push|even when the app is closed/i);
  });
});
