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
  uid: "u1",
  currentUid: "u1",
  version: 2 as number | undefined,
  today: "2026-10-29",
  startMs: new Date(2026, 9, 29, 12).getTime(),
  native: false,
  pushSupported: true,
  configured: false,
  pushFailed: false,
  choiceFailed: false,
  choiceResponse: null as "accepted" | "later" | "denied" | null,
  primingShown: false,
  remotePermissionState: "granted" as "granted" | "denied" | "default",
  localPermissionState: "granted" as "granted" | "denied" | "default",
  support: vi.fn(async () => true),
  requestPush: vi.fn(async () => true),
  register: vi.fn(async () => ({ ok: true, token: "token" })),
  unregister: vi.fn(async () => {}),
  updatePush: vi.fn(async () => true),
  requestLocal: vi.fn(async () => true),
  updateLocal: vi.fn(async () => {}),
  record: vi.fn(async () => true),
  track: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: h.uid },
    profile: {
      activationJourneyVersion: h.version,
      onboardingCompletedAt: { toMillis: () => h.startMs },
    },
  }),
}));
vi.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return { uid: h.currentUid };
    },
  },
}));
vi.mock("@/hooks/useLocalDateKey", () => ({
  useLocalDateKey: () => h.today,
}));
vi.mock("@/hooks/usePushSettings", () => ({
  usePushSettings: () => ({
    consent: { enabled: false },
    update: h.updatePush,
    loading: false,
    configured: h.configured,
    failed: h.pushFailed,
  }),
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => ({
    prefs: { enabled: false, primingShown: h.primingShown },
    loading: false,
    updatePrefs: h.updateLocal,
    requestPermission: h.requestLocal,
  }),
}));
vi.mock("@/hooks/useFirstSessionReturnChoice", () => ({
  useFirstSessionReturnChoice: () => ({
    loading: false,
    failed: h.choiceFailed,
    response: h.choiceResponse,
    record: h.record,
  }),
}));
vi.mock("@/lib/pushNotifications", () => ({
  getRemotePushPermissionState: async () => h.remotePermissionState,
  isPushSupported: h.support,
  requestRemotePushPermission: h.requestPush,
  registerDeviceToken: h.register,
  unregisterDeviceToken: h.unregister,
}));
vi.mock("@/lib/notifications", () => ({
  getNotificationPermissionState: async () => h.localPermissionState,
}));
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => h.native,
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: h.track }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import FirstWeekReturnOffer from "../FirstWeekReturnOffer";

function open(kind: "lift" | "run" = "lift") {
  return render(
    <MemoryRouter>
      <FirstWeekReturnOffer kind={kind} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.uid = "u1";
  h.currentUid = "u1";
  h.version = 2;
  h.today = "2026-10-29";
  h.startMs = new Date(2026, 9, 29, 12).getTime();
  h.native = false;
  h.pushSupported = true;
  h.configured = false;
  h.pushFailed = false;
  h.choiceFailed = false;
  h.choiceResponse = null;
  h.primingShown = false;
  h.remotePermissionState = "granted";
  h.localPermissionState = "granted";
  h.support.mockImplementation(async () => h.pushSupported);
  h.requestPush.mockResolvedValue(true);
  h.register.mockResolvedValue({ ok: true, token: "token" });
  h.updatePush.mockResolvedValue(true);
  h.requestLocal.mockResolvedValue(true);
  h.updateLocal.mockResolvedValue(undefined);
  h.record.mockResolvedValue(true);
});

describe("first-week saved-session return offer", () => {
  it("appears after a version 2 save without asking system permission on mount", async () => {
    open("run");
    expect(
      await screen.findByRole("button", { name: "Turn on reminders" })
    ).toBeVisible();
    expect(h.requestPush).not.toHaveBeenCalled();
    expect(h.requestLocal).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(h.track).toHaveBeenCalledWith("first_week_reminder_offered", {
        kind: "run",
        firstWeekDay: 1,
        reminderChannel: "push",
      })
    );
  });

  it("requests, registers, and saves scoped push consent only after the tap", async () => {
    const order: string[] = [];
    h.requestPush.mockImplementation(async () => {
      order.push("permission");
      return true;
    });
    h.register.mockImplementation(async () => {
      order.push("register");
      return { ok: true, token: "token" };
    });
    h.updatePush.mockImplementation(async () => {
      order.push("consent");
      return true;
    });
    h.record.mockImplementation(async () => {
      order.push("choice");
      return true;
    });
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    await waitFor(() => expect(h.record).toHaveBeenCalledWith("accepted"));
    expect(order).toEqual(["permission", "register", "consent", "choice"]);
    expect(h.updatePush).toHaveBeenCalledWith({
      enabled: true,
      streak: true,
      recap: false,
      badge: false,
    });
    expect(h.requestLocal).not.toHaveBeenCalled();
  });

  it("records Not now without opening system permission", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(h.record).toHaveBeenCalledWith("later"));
    expect(h.requestPush).not.toHaveBeenCalled();
    expect(h.register).not.toHaveBeenCalled();
  });

  it("keeps delivery off and points to Settings after permission is denied", async () => {
    h.requestPush.mockResolvedValue(false);
    h.remotePermissionState = "denied";
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    expect(await screen.findByText("Notifications are blocked")).toBeVisible();
    expect(h.record).toHaveBeenCalledWith("denied");
    expect(h.register).not.toHaveBeenCalled();
    expect(h.updatePush).not.toHaveBeenCalled();
  });

  it("keeps a failed permission request retryable without recording a denial", async () => {
    h.requestPush.mockResolvedValue(false);
    h.remotePermissionState = "default";
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't request notification permission"
    );
    expect(h.record).not.toHaveBeenCalled();
  });

  it("does not save push consent when device registration fails", async () => {
    h.register.mockResolvedValue({
      ok: false,
      reason: "token-failed",
    } as never);
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't connect this device"
    );
    expect(h.updatePush).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it("uses native local notifications when remote push is unavailable", async () => {
    h.native = true;
    h.pushSupported = false;
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    await waitFor(() => expect(h.record).toHaveBeenCalledWith("accepted"));
    expect(h.requestLocal).toHaveBeenCalledOnce();
    expect(h.updateLocal).toHaveBeenCalledWith({
      enabled: true,
      primingShown: true,
    });
    expect(h.requestPush).not.toHaveBeenCalled();
  });

  it("records a denied native local permission without enabling reminders", async () => {
    h.native = true;
    h.pushSupported = false;
    h.requestLocal.mockResolvedValue(false);
    h.localPermissionState = "denied";
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    expect(await screen.findByText("Notifications are blocked")).toBeVisible();
    expect(h.record).toHaveBeenCalledWith("denied");
    expect(h.updateLocal).not.toHaveBeenCalled();
  });

  it("does not register after the account changes during permission", async () => {
    h.requestPush.mockImplementation(async () => {
      h.currentUid = "u2";
      return true;
    });
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn on reminders" })
    );
    await waitFor(() => expect(h.requestPush).toHaveBeenCalledOnce());
    expect(h.register).not.toHaveBeenCalled();
    expect(h.updatePush).not.toHaveBeenCalled();
  });

  it("hides for day 8, older journeys, prior settings, and a failed choice read", async () => {
    const states = [
      () => {
        h.today = "2026-11-05";
      },
      () => {
        h.version = undefined;
      },
      () => {
        h.configured = true;
      },
      () => {
        h.choiceFailed = true;
      },
    ];
    for (const setCase of states) {
      h.today = "2026-10-29";
      h.version = 2;
      h.configured = false;
      h.choiceFailed = false;
      setCase();
      const eligible = h.today === "2026-10-29" && h.version === 2;
      const view = open();
      await act(async () => {});
      expect(h.support).toHaveBeenCalledTimes(eligible ? 1 : 0);
      expect(
        screen.queryByRole("button", { name: "Turn on reminders" })
      ).toBeNull();
      view.unmount();
      h.support.mockClear();
    }
  });
});
