/**
 * The Monday review notification's switch in Settings → Notifications
 * (Mob2 call 10): on by default for anyone who has allowed notifications,
 * saying when it comes, with its next time and a test that opens the
 * review, on the web as on the phone. Like the streak's switch, it never
 * reads on while notifications are not allowed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const state = vi.hoisted(() => ({
  pending: [] as {
    id: number;
    title: string;
    body: string;
    scheduleAt: string;
  }[],
  sendTest: vi.fn(async (_kind: string) => true),
  permission: "granted" as "granted" | "denied" | "default",
  request: vi.fn(async () => true),
  error: vi.fn(),
}));
vi.mock("@/lib/pushNotifications", () => ({
  isRemotePushOffered: () => false,
  requestRemotePushPermission: vi.fn(),
  registerDeviceToken: vi.fn(),
  unregisterDeviceToken: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));
vi.mock("@/hooks/usePushSettings", () => ({
  usePushSettings: () => ({
    consent: { enabled: false },
    update: vi.fn(),
    loading: false,
  }),
}));
vi.mock("@/lib/notifications", () => ({
  getNotificationPermissionState: async () => state.permission,
  requestNotificationPermission: state.request,
  getPendingNotifications: async () => state.pending,
  sendTestNotification: state.sendTest,
}));
vi.mock("@/lib/firebase", () => ({ functions: {}, db: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: state.error, success: vi.fn() },
}));

import NotificationsSection from "../NotificationsSection";
import { REVIEW_NOTIFICATION_ID } from "@/lib/reviewReminder";

function renderSection(
  reviewReminder: { enabled: boolean } | undefined,
  updateReviewReminder = vi.fn(async (_patch: unknown) => {})
) {
  render(
    <NotificationsSection
      inline
      mealReminders={{
        enabled: false,
        breakfast: { enabled: true, time: "08:00" },
        lunch: { enabled: true, time: "12:30" },
        dinner: { enabled: true, time: "18:30" },
      }}
      updateMealReminders={vi.fn(async () => {})}
      workoutReminders={{ enabled: false, time: "17:00" }}
      updateWorkoutReminders={vi.fn(async () => {})}
      streakReminder={{
        enabled: false,
        time: "20:00",
        primingShown: true,
        firstWeekNudgeDateKey: null,
      }}
      updateStreakReminder={vi.fn(async () => {})}
      reviewReminder={reviewReminder}
      updateReviewReminder={updateReviewReminder}
    />
  );
  return updateReviewReminder;
}

afterEach(() => {
  cleanup();
  state.pending = [];
  state.sendTest.mockClear();
  state.permission = "granted";
  state.request.mockReset().mockResolvedValue(true);
  state.error.mockClear();
});

const reviewSwitch = () =>
  screen.getByRole("switch", { name: "Toggle weekly review notification" });

describe("NotificationsSection — the weekly review", () => {
  it("has its own switch, on once notifications are allowed, saying when it comes", async () => {
    renderSection({ enabled: true });
    expect(screen.getByText("Weekly review")).toBeInTheDocument();
    expect(
      screen.getByText("Monday at 09:00, when last week's review is ready")
    ).toBeInTheDocument();
    await waitFor(() => expect(reviewSwitch()).toBeChecked());
  });

  it("reads off while notifications are not allowed, whatever its stored default", async () => {
    state.permission = "denied";
    renderSection({ enabled: true });
    // A switch drawn from the stored default alone reads on from the
    // first render, so this holds before and after the permission read.
    expect(reviewSwitch()).not.toBeChecked();
    await act(async () => {});
    expect(reviewSwitch()).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Send test" })).toBeNull();
  });

  it("turns off from its switch", async () => {
    const update = renderSection({ enabled: true });
    await waitFor(() => expect(reviewSwitch()).toBeChecked());
    await act(async () => {
      fireEvent.click(reviewSwitch());
    });
    expect(update).toHaveBeenCalledWith({ enabled: false });
  });

  it("turning it on asks for notifications, and stays off when refused", async () => {
    state.permission = "default";
    state.request.mockResolvedValue(false);
    const update = renderSection({ enabled: true });
    await act(async () => {});
    await act(async () => {
      fireEvent.click(reviewSwitch());
    });
    expect(state.request).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith(
      "Allow notifications in your device settings to turn this on."
    );
  });

  it("turning it on once allowed keeps it on", async () => {
    state.permission = "default";
    const update = renderSection({ enabled: false });
    await act(async () => {});
    await act(async () => {
      fireEvent.click(reviewSwitch());
    });
    expect(update).toHaveBeenCalledWith({ enabled: true });
  });

  it("shows when it next comes, found by its id", async () => {
    state.pending = [
      {
        id: REVIEW_NOTIFICATION_ID,
        title: "Your week, reviewed",
        body: "Last week in a few cards, and the week ahead.",
        scheduleAt: new Date(
          Date.now() + 3 * 24 * 60 * 60_000 + 60_000
        ).toISOString(),
      },
    ];
    renderSection({ enabled: true });
    expect(await screen.findByText("in 3 days")).toBeInTheDocument();
  });

  it("sends a test of itself, which the web can show", async () => {
    renderSection({ enabled: true });
    // Only the review's block is open: the other reminders are off.
    const send = await screen.findByRole("button", { name: "Send test" });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(state.sendTest).toHaveBeenCalledWith("review");
  });
});
