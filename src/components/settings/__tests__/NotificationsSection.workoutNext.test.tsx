/**
 * The workout reminder's "Next:" line finds the reminder by its weekday
 * ids, not its words: a lift day's reminder is titled with the session
 * ("Upper A today", Mob1 call 3), which no title search could know.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  offered: true,
  loading: false,
  consent: {
    enabled: true,
    streak: true,
    recap: true,
    badge: true,
    challenges: false,
    challengeReminders: false,
  },
  update: vi.fn(async (_patch: unknown) => true),
  request: vi.fn(async () => true),
  register: vi.fn(async () => ({ ok: true as const, token: "token" })),
  unregister: vi.fn(async () => {}),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/pushNotifications", () => ({
  isRemotePushOffered: () => state.offered,
  requestRemotePushPermission: state.request,
  registerDeviceToken: state.register,
  unregisterDeviceToken: state.unregister,
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));
vi.mock("@/hooks/usePushSettings", () => ({
  usePushSettings: () => ({
    consent: state.consent,
    update: state.update,
    loading: state.loading,
  }),
}));
vi.mock("@/lib/notifications", () => ({
  getNotificationPermissionState: async () => "granted",
  requestNotificationPermission: vi.fn(async () => true),
  getPendingNotifications: async () => [
    {
      id: 2004,
      title: "Upper A today",
      body: "Your session is ready when you are.",
      scheduleAt: new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString(),
    },
  ],
  sendTestNotification: vi.fn(async () => true),
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: state.error, success: state.success },
}));

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

afterEach(cleanup);

describe("NotificationsSection — the workout reminder's next time", () => {
  it("is found by its id whatever its title says", async () => {
    renderSection();
    expect(await screen.findByText("in 2 hrs")).toBeInTheDocument();
    // Only the workout row has one; the others explain the tab caveat.
    expect(screen.getAllByText("in 2 hrs")).toHaveLength(1);
  });
});
