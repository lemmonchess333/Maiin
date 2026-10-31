// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  version: 2 as number | undefined,
  today: "2026-10-29",
  startMs: new Date(2026, 9, 28, 12).getTime(),
  enabled: false,
  choiceResponse: null as "accepted" | "later" | "denied" | null,
  requestPermission: vi.fn(async () => true),
  updateReminders: vi.fn(async (_: unknown) => {}),
  record: vi.fn(async (_: string) => true),
  track: vi.fn(),
  pushAsked: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: {
      activationJourneyVersion: h.version,
      onboardingCompletedAt: { toMillis: () => h.startMs },
      // Lifting every day but Sunday.
      weekSchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        type: day === 0 ? "rest" : "lift",
      })),
    },
  }),
}));
vi.mock("@/hooks/useLocalDateKey", () => ({
  useLocalDateKey: () => h.today,
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useWorkoutReminders: () => ({
    reminders: { enabled: h.enabled, time: "07:00" },
    loading: false,
    updateReminders: h.updateReminders,
    requestPermission: h.requestPermission,
    liftName: "Pull B",
  }),
  useStreakReminder: () => ({
    prefs: { enabled: false, primingShown: false },
    loading: false,
    updatePrefs: h.pushAsked,
    requestPermission: h.pushAsked,
  }),
}));
vi.mock("@/hooks/usePushSettings", () => ({
  usePushSettings: () => ({
    consent: { enabled: false },
    update: h.pushAsked,
    loading: false,
    configured: false,
    failed: false,
  }),
}));
vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: async () => true,
  requestRemotePushPermission: h.pushAsked,
  registerDeviceToken: h.pushAsked,
  unregisterDeviceToken: h.pushAsked,
  getRemotePushPermissionState: async () => "granted",
}));
vi.mock("@/hooks/useFirstSessionReturnChoice", () => ({
  useFirstSessionReturnChoice: () => ({
    loading: false,
    failed: false,
    response: h.choiceResponse,
    record: h.record,
  }),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: h.track }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FirstWeekReturnOffer from "../FirstWeekReturnOffer";

function open() {
  return render(
    <MemoryRouter>
      <FirstWeekReturnOffer kind="lift" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 29, 12));
  h.version = 2;
  h.enabled = false;
  h.choiceResponse = null;
  h.requestPermission.mockResolvedValue(true);
});

describe("a v2 account's one first-week reminder ask", () => {
  it("offers the training-day reminder by naming the next session and when", async () => {
    open();
    expect(
      await screen.findByRole("heading", { name: "Remind you before Pull B?" })
    ).toBeVisible();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          /^Pull B tomorrow at 07:30, then on each training day\.$/.test(
            el.textContent ?? ""
          )
      )
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remind me" }));
    await waitFor(() =>
      expect(h.updateReminders).toHaveBeenCalledWith({
        enabled: true,
        time: "07:30",
      })
    );
    expect(h.requestPermission).toHaveBeenCalledOnce();
    expect(h.record).toHaveBeenCalledWith("accepted");
    // No streak nudge, and no push, is asked for.
    expect(h.pushAsked).not.toHaveBeenCalled();
  });

  it("asks nothing when setup already turned the reminder on", async () => {
    h.enabled = true;
    open();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Remind me" })).toBeNull();
  });

  it("keeps Not now as the answer", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(h.record).toHaveBeenCalledWith("later"));
    expect(h.updateReminders).not.toHaveBeenCalled();
  });

  it("says where to allow notifications after a refusal", async () => {
    h.requestPermission.mockResolvedValue(false);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Remind me" }));
    expect(
      await screen.findByText(/Notifications are off for Tropos/)
    ).toBeVisible();
    expect(h.record).toHaveBeenCalledWith("denied");
    expect(h.updateReminders).not.toHaveBeenCalled();
  });

  it("is not shown to a legacy account", async () => {
    h.version = undefined;
    open();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Remind me" })).toBeNull();
  });
});
