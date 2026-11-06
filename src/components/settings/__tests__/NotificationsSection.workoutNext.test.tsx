/**
 * The workout reminder's "Next:" line finds the reminder by its weekday
 * ids, not its words: a lift day's reminder is titled with the session
 * ("Upper A today", Mob1 call 3), which no title search could know.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

const state = vi.hoisted(() => ({
  hours: 2,
  permission: "granted",
  localPermissionGranted: true,
  pendingReads: vi.fn(),
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
  getNotificationPermissionState: async () => state.permission,
  requestNotificationPermission: vi.fn(
    async () => state.localPermissionGranted
  ),
  getPendingNotifications: async () => {
    state.pendingReads();
    return [
      {
        id: 2004,
        title: "Upper A today",
        body: "Your session is ready when you are.",
        scheduleAt: new Date(
          Date.now() + state.hours * 60 * 60_000 + 60_000
        ).toISOString(),
      },
    ];
  },
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
import { notifyNotificationScheduleChanged } from "@/lib/notificationScheduleEvents";

function renderSection(
  overrides: Partial<ComponentProps<typeof NotificationsSection>> = {}
) {
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
      {...overrides}
    />
  );
}

beforeEach(() => {
  state.hours = 2;
  state.permission = "granted";
  state.localPermissionGranted = true;
  state.pendingReads.mockClear();
  state.error.mockClear();
});
afterEach(cleanup);

describe("NotificationsSection — the workout reminder's next time", () => {
  it("is found by its id whatever its title says", async () => {
    renderSection();
    expect(await screen.findByText("in 2 hrs")).toBeInTheDocument();
    // Only the workout row has one; the others explain the tab caveat.
    expect(screen.getAllByText("in 2 hrs")).toHaveLength(1);
  });
});

it("refreshes Next after the OS schedule finishes changing", async () => {
  renderSection();
  expect(await screen.findByText("in 2 hrs")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Workout reminder time"), {
    target: { value: "20:00" },
  });
  // The native pass completes after the preference save, not at input time.
  state.hours = 5;
  act(() => notifyNotificationScheduleChanged());
  expect(await screen.findByText("in 5 hrs")).toBeInTheDocument();
  expect(screen.queryByText("in 2 hrs")).not.toBeInTheDocument();
});

it("refreshes permission and Next when returning from device settings", async () => {
  renderSection();
  expect(await screen.findByText("in 2 hrs")).toBeInTheDocument();
  state.permission = "denied";
  state.hours = 5;
  fireEvent.focus(window);
  expect(
    await screen.findByText("Notifications are blocked")
  ).toBeInTheDocument();
  expect(await screen.findByText("in 5 hrs")).toBeInTheDocument();
});

it("stops listening after leaving Settings", async () => {
  renderSection();
  await screen.findByText("in 2 hrs");
  cleanup();
  const before = state.pendingReads.mock.calls.length;
  act(() => notifyNotificationScheduleChanged());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(state.pendingReads).toHaveBeenCalledTimes(before);
});

it.each(["meal", "workout"] as const)(
  "keeps %s Off available while a time change is still saving",
  async (kind) => {
    const update = vi.fn(async () => {});
    renderSection({
      [`${kind}Status`]: {
        loading: false,
        failed: false,
        saving: true,
        retry: vi.fn(),
      },
      [kind === "meal" ? "updateMealReminders" : "updateWorkoutReminders"]:
        update,
    });
    const toggle = screen.getByRole("switch", {
      name: `Toggle ${kind} reminders`,
    });
    expect(toggle).toBeEnabled();
    expect(
      screen.getByLabelText(
        kind === "meal" ? "dinner reminder time" : "Workout reminder time"
      )
    ).toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ enabled: false })
    );
  }
);

it.each(["meal", "workout"] as const)(
  "does not save an enabled %s preference when permission is denied",
  async (kind) => {
    state.localPermissionGranted = false;
    state.permission = "denied";
    const update = vi.fn(async () => {});
    renderSection({
      mealReminders: {
        enabled: false,
        breakfast: { enabled: true, time: "08:00" },
        lunch: { enabled: true, time: "12:30" },
        dinner: { enabled: true, time: "18:30" },
      },
      workoutReminders: { enabled: false, time: "17:00" },
      [kind === "meal" ? "updateMealReminders" : "updateWorkoutReminders"]:
        update,
    });
    fireEvent.click(
      screen.getByRole("switch", { name: `Toggle ${kind} reminders` })
    );
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        "Allow notifications in your device settings to turn this on."
      )
    );
    expect(update).not.toHaveBeenCalled();
  }
);

it("offers retry for failed reads without enabling unknown settings", async () => {
  const retry = vi.fn();
  renderSection({
    mealStatus: { loading: false, failed: true, saving: false, retry },
  });
  expect(screen.getByText("Reminder settings unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("switch", { name: "Toggle meal reminders" })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
