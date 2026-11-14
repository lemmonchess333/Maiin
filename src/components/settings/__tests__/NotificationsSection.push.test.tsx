/**
 * Settings → Notifications after App1 Q26: one switch and one time per
 * reminder, and the app picks local or push. There is no push switch: a
 * reminder push can carry, turned on where this device can take push,
 * sets push up, with the streak's and review's choices written first so
 * push coming on turns neither of them on by itself, and the push-only
 * kinds left off unless asked for. Those (badges, monthly challenges) keep
 * a switch each.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";

const state = vi.hoisted(() => ({
  offered: true,
  supported: true,
  loading: false,
  consent: {
    enabled: true,
    streak: true,
    recap: true,
    badge: true,
    challenges: false,
    challengeReminders: false,
  },
  order: [] as string[],
  update: vi.fn(async (_patch: unknown) => true),
  request: vi.fn(async () => true),
  localRequest: vi.fn(async () => true),
  register: vi.fn(
    async (): Promise<{ ok: boolean; token?: string; reason?: string }> => ({
      ok: true,
      token: "token",
    })
  ),
  testPush: vi.fn(async () => ({ data: { ok: true } })),
  sendTest: vi.fn(async (_kind: string) => true),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/pushNotifications", () => ({
  isRemotePushOffered: () => state.offered,
  isPushSupported: async () => state.supported,
  requestRemotePushPermission: state.request,
  registerDeviceToken: state.register,
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
  requestNotificationPermission: state.localRequest,
  getPendingNotifications: async () => [],
  sendTestNotification: state.sendTest,
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => state.testPush),
}));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: state.error, success: state.success },
}));

import NotificationsSection from "../NotificationsSection";

type Props = ComponentProps<typeof NotificationsSection>;

const MEALS_OFF = {
  enabled: false,
  breakfast: { enabled: true, time: "08:00" },
  lunch: { enabled: true, time: "12:30" },
  dinner: { enabled: true, time: "18:30" },
};

function renderSection(overrides: Partial<Props> = {}) {
  const updateStreakReminder = vi.fn(async (patch: unknown) => {
    state.order.push(`streak ${JSON.stringify(patch)}`);
  });
  const updateReviewReminder = vi.fn(async (patch: unknown) => {
    state.order.push(`review ${JSON.stringify(patch)}`);
  });
  render(
    <NotificationsSection
      inline
      mealReminders={{ ...MEALS_OFF, enabled: true }}
      updateMealReminders={vi.fn(async () => {})}
      workoutReminders={{ enabled: true, time: "17:00" }}
      updateWorkoutReminders={vi.fn(async () => {})}
      streakReminder={{ enabled: true, time: "20:00" }}
      updateStreakReminder={updateStreakReminder}
      reviewReminder={{ enabled: true }}
      updateReviewReminder={updateReviewReminder}
      {...overrides}
    />
  );
  return { updateStreakReminder, updateReviewReminder };
}

const REMINDER_SWITCHES = [
  "Toggle meal reminders",
  "Toggle workout reminders",
  "Toggle weekly review notification",
  "Toggle streak reminder",
];
const PUSH_ONLY_SWITCHES = [
  "Toggle Badge unlocked push",
  "Toggle Monthly challenges push",
  "Toggle Monthly challenge reminders push",
];

const streakSwitch = () =>
  screen.getByRole("switch", { name: "Toggle streak reminder" });

beforeEach(() => {
  vi.clearAllMocks();
  state.offered = true;
  state.supported = true;
  state.loading = false;
  state.order = [];
  state.consent = {
    enabled: true,
    streak: true,
    recap: true,
    badge: true,
    challenges: false,
    challengeReminders: false,
  };
  state.update.mockReset().mockImplementation(async (patch: unknown) => {
    state.order.push(`push ${JSON.stringify(patch)}`);
    return true;
  });
  state.request.mockReset().mockResolvedValue(true);
  state.localRequest.mockReset().mockResolvedValue(true);
  state.register.mockReset().mockImplementation(async () => {
    state.order.push("register");
    return { ok: true, token: "token" };
  });
});
afterEach(cleanup);

describe("NotificationsSection — one switch per reminder", () => {
  it("are one Reminders group with a row each, not a heading over each switch", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { name: "Reminders" })
    ).toBeInTheDocument();
    for (const row of ["Meals", "Workouts", "Streak", "Weekly review"])
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

  it("has no push switch, and no second switch for the streak or the review", () => {
    renderSection();
    for (const name of REMINDER_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    for (const gone of [
      "Toggle push notifications",
      "Toggle Streak nudges push",
      "Toggle Weekly recap push",
    ])
      expect(screen.queryByRole("switch", { name: gone })).toBeNull();
    expect(screen.queryByText("Send a test push")).toBeNull();
    expect(screen.queryByText("Push notifications")).toBeNull();
  });

  it("offers the streak's time as a whole hour, 08:00 to 21:00, and saves it", async () => {
    const { updateStreakReminder } = renderSection();
    const time = screen.getByLabelText(
      "Streak reminder time"
    ) as HTMLSelectElement;
    const options = Array.from(time.options, (option) => option.value);
    expect(options[0]).toBe("08:00");
    expect(options.at(-1)).toBe("21:00");
    expect(options).toHaveLength(14);
    expect(time).toHaveValue("20:00");
    fireEvent.change(time, { target: { value: "19:00" } });
    await waitFor(() =>
      expect(updateStreakReminder).toHaveBeenCalledWith({ time: "19:00" })
    );
  });

  it("says a reminder push carries arrives with the app closed, and tests it by push", async () => {
    renderSection({
      mealReminders: MEALS_OFF,
      workoutReminders: { enabled: false, time: "17:00" },
    });
    // The streak and the review (once the permission read lands): both
    // carried by push.
    await waitFor(() =>
      expect(
        screen.getAllByText("Arrives even with the app closed.")
      ).toHaveLength(2)
    );
    expect(screen.queryByText("No reminder is scheduled.")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Send test" })[0]);
    });
    expect(state.testPush).toHaveBeenCalledOnce();
    expect(state.sendTest).not.toHaveBeenCalled();
  });

  it("tests a reminder the phone sends on the phone", async () => {
    state.consent.enabled = false;
    renderSection({
      mealReminders: MEALS_OFF,
      workoutReminders: { enabled: false, time: "17:00" },
      reviewReminder: { enabled: false },
    });
    expect(screen.queryByText("Arrives even with the app closed.")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    });
    expect(state.sendTest).toHaveBeenCalledWith("streak");
    expect(state.testPush).not.toHaveBeenCalled();
  });
});

describe("NotificationsSection — the app picks push", () => {
  it("sets push up when the streak reminder is turned on, after writing both reminders as they read", async () => {
    state.consent.enabled = false;
    const { updateStreakReminder } = renderSection({
      streakReminder: { enabled: false, time: "21:00" },
    });
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    await waitFor(() =>
      expect(updateStreakReminder).toHaveBeenLastCalledWith({ enabled: true })
    );
    expect(state.localRequest).toHaveBeenCalledOnce();
    expect(state.request).toHaveBeenCalledOnce();
    expect(state.order).toEqual([
      "register",
      // Written as they read, so push coming on changes neither.
      'streak {"enabled":false,"time":"21:00"}',
      'review {"enabled":true}',
      // Push on, and the push-only kinds as they read while it was off.
      'push {"enabled":true,"badge":false,"challenges":false,"challengeReminders":false}',
      'streak {"enabled":true}',
    ]);
  });

  it("sets push up for the weekly review too", async () => {
    state.consent.enabled = false;
    const { updateReviewReminder } = renderSection({
      reviewReminder: { enabled: false },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("switch", {
          name: "Toggle weekly review notification",
        })
      );
    });
    await waitFor(() =>
      expect(updateReviewReminder).toHaveBeenLastCalledWith({ enabled: true })
    );
    expect(state.register).toHaveBeenCalledWith("runner");
    expect(state.update).toHaveBeenCalledWith({
      enabled: true,
      badge: false,
      challenges: false,
      challengeReminders: false,
    });
  });

  it("leaves the reminder on the phone where this device cannot take push", async () => {
    state.consent.enabled = false;
    state.supported = false;
    const { updateStreakReminder } = renderSection({
      streakReminder: { enabled: false, time: "20:00" },
    });
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    await waitFor(() =>
      expect(updateStreakReminder).toHaveBeenCalledWith({ enabled: true })
    );
    expect(updateStreakReminder).toHaveBeenCalledOnce();
    expect(state.register).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.error).not.toHaveBeenCalled();
  });

  it("leaves it on the phone, and push off, when this device cannot register", async () => {
    state.consent.enabled = false;
    state.register.mockResolvedValueOnce({ ok: false, reason: "token-failed" });
    const { updateStreakReminder } = renderSection({
      streakReminder: { enabled: false, time: "20:00" },
    });
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    await waitFor(() =>
      expect(updateStreakReminder).toHaveBeenCalledWith({ enabled: true })
    );
    expect(updateStreakReminder).toHaveBeenCalledOnce();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("asks nothing more of push once it is on", async () => {
    const { updateStreakReminder } = renderSection({
      streakReminder: { enabled: false, time: "20:00" },
    });
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    await waitFor(() =>
      expect(updateStreakReminder).toHaveBeenCalledWith({ enabled: true })
    );
    expect(state.request).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("keeps the switch off, and sets nothing up, when notifications are refused", async () => {
    state.consent.enabled = false;
    state.localRequest.mockResolvedValueOnce(false);
    const { updateStreakReminder } = renderSection({
      streakReminder: { enabled: false, time: "20:00" },
    });
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    expect(state.error).toHaveBeenCalledWith(
      "Allow notifications in your device settings to turn this on."
    );
    expect(updateStreakReminder).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("turning a reminder off leaves push as it is", async () => {
    const { updateStreakReminder } = renderSection();
    await act(async () => {
      fireEvent.click(streakSwitch());
    });
    expect(updateStreakReminder).toHaveBeenCalledExactlyOnceWith({
      enabled: false,
    });
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("NotificationsSection — badges and monthly challenges", () => {
  it("offers each without asking permission on mount", () => {
    renderSection();
    for (const name of PUSH_ONLY_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Toggle Monthly challenges push" })
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(/One alert near the start of each month/)
    ).toBeInTheDocument();
    expect(state.request).not.toHaveBeenCalled();
    expect(state.localRequest).not.toHaveBeenCalled();
  });

  it("hides them on an old native binary without the messaging plugin, and keeps the reminders", () => {
    state.offered = false;
    renderSection();
    for (const name of REMINDER_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    for (const name of PUSH_ONLY_SWITCHES)
      expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
  });

  it("saves only the chosen flag while push is on", async () => {
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
  });

  it("reads off while push is off, and turning one on sets push up with only that one", async () => {
    state.consent.enabled = false;
    renderSection();
    const badge = screen.getByRole("switch", {
      name: "Toggle Badge unlocked push",
    });
    expect(badge).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(badge);
    });
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        enabled: true,
        badge: true,
        challenges: false,
        challengeReminders: false,
      })
    );
    expect(state.register).toHaveBeenCalledWith("runner");
  });

  it("says so when push cannot be set up for one", async () => {
    state.consent.enabled = false;
    state.request.mockResolvedValueOnce(false);
    renderSection();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("switch", { name: "Toggle Badge unlocked push" })
      );
    });
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.update).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("keeps their switches disabled until the account's settings are loaded", () => {
    state.loading = true;
    renderSection();
    for (const name of PUSH_ONLY_SWITCHES)
      expect(screen.getByRole("switch", { name })).toBeDisabled();
  });

  it("keeps the streak and review switches disabled until their choices are read", () => {
    renderSection({ remindersLoading: true });
    for (const name of [
      "Toggle streak reminder",
      "Toggle weekly review notification",
    ])
      expect(screen.getByRole("switch", { name })).toBeDisabled();
  });
});
