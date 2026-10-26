import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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
  getPendingNotifications: async () => [],
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
  "Toggle Monthly challenges push",
  "Toggle Monthly challenge reminders push",
];

beforeEach(() => {
  vi.clearAllMocks();
  state.offered = true;
  state.loading = false;
  state.consent = {
    enabled: true,
    streak: true,
    recap: true,
    badge: true,
    challenges: false,
    challengeReminders: false,
  };
  state.update.mockReset().mockResolvedValue(true);
  state.request.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);

describe("NotificationsSection — the reminders", () => {
  it("are one Reminders group with a row each, not a heading over each switch", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { name: "Reminders" })
    ).toBeInTheDocument();
    for (const row of ["Meals", "Workouts", "Streak"])
      expect(screen.getByText(row)).toBeInTheDocument();
    for (const gone of [
      "Meal reminders",
      "Enable meal reminders",
      "Workout reminders",
      "Enable workout reminders",
      "Streak reminders",
    ])
      expect(screen.queryByText(gone)).toBeNull();
  });
});

describe("NotificationsSection — monthly challenge push", () => {
  it("offers a separate challenge opt-in without asking permission on mount", () => {
    renderSection();
    for (const name of [...REMINDER_SWITCHES, ...PUSH_SWITCHES])
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Toggle Monthly challenges push" })
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(/One alert near the start of each month/)
    ).toBeInTheDocument();
    expect(state.request).not.toHaveBeenCalled();
  });

  it("hides remote push on an old native binary without the messaging plugin", () => {
    state.offered = false;
    renderSection();
    for (const name of REMINDER_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    for (const name of PUSH_SWITCHES)
      expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
  });

  it("saves only the explicitly chosen challenge flag", async () => {
    renderSection();
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Monthly challenges push" })
    );
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({ challenges: true })
    );
    expect(state.request).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("keeps closing reminders off and saves them independently of announcements", async () => {
    renderSection();
    const toggle = screen.getByRole("switch", {
      name: "Toggle Monthly challenge reminders push",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(/for joined monthly goals still in progress/)
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledExactlyOnceWith({
        challengeReminders: true,
      })
    );
    expect(state.request).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("does not enroll challenge alerts when enabling remote push", async () => {
    state.consent.enabled = false;
    renderSection();
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle push notifications" })
    );
    await waitFor(() => expect(state.register).toHaveBeenCalledWith("runner"));
    expect(state.request).toHaveBeenCalledOnce();
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ enabled: true });
  });

  it("does not register a token when permission is denied", async () => {
    state.consent.enabled = false;
    state.request.mockResolvedValueOnce(false);
    renderSection();
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle push notifications" })
    );
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.update).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("shows a failed save and never registers or reports success", async () => {
    state.consent.enabled = false;
    state.update.mockRejectedValueOnce(new Error("offline"));
    renderSection();
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle push notifications" })
    );
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't save")
      )
    );
    expect(state.register).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("keeps switches disabled until the account's settings are loaded", () => {
    state.loading = true;
    renderSection();
    for (const name of PUSH_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeDisabled();
  });
});
