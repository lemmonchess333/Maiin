/**
 * Trial-ending reminder — what the OS is holding, not what was called.
 *
 * A reminder that does not fire produces no error and no UI, so every
 * assertion is on the resulting SCHEDULE (the notifications harness):
 * the id is held at the right instant while the trial is live with room
 * to remind, and it is absent — not merely "cancelled once" — for a paid
 * tier, a lapsed trial, a signed-out session, the last two days, and a
 * denied permission.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

vi.mock("@/lib/notifications");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = null;
let mockLoading = false;
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockProfile ? { uid: "u1" } : null,
    profile: mockProfile,
    loading: mockLoading,
  }),
}));

import {
  useTrialReminderInternal,
  trialReminderFireAt,
  TRIAL_NOTIFICATION_ID,
  TRIAL_REMINDER_TITLE,
} from "../useTrialReminder";
import {
  resetNotifications,
  scheduledIds,
  scheduledAt,
  setNotificationPermission,
  settleNotifications,
} from "@/test/notificationsHarness";

// Fixed clock: Tuesday 1 September 2026, 09:00 local.
const NOW = new Date(2026, 8, 1, 9, 0, 0, 0);
/** A trial granted `daysAgo` days before NOW, at NOW's time of day. */
function expiryFrom(daysAgo: number): string {
  const granted = new Date(NOW.getTime());
  granted.setDate(granted.getDate() - daysAgo);
  const expires = new Date(granted.getTime());
  expires.setDate(expires.getDate() + 7);
  return expires.toISOString();
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  resetNotifications();
  mockProfile = null;
  mockLoading = false;
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await settleNotifications();
});

describe("trialReminderFireAt", () => {
  it("fires at 10:00 local, two calendar days before the expiry's local day", () => {
    // Expires Saturday 5 Sept at 23:30 local → Thursday 3 Sept, 10:00.
    const expires = new Date(2026, 8, 5, 23, 30);
    const fireAt = trialReminderFireAt({
      isInTrial: true,
      trialExpiresAt: expires.toISOString(),
      now: NOW,
    });
    expect(fireAt).toEqual(new Date(2026, 8, 3, 10, 0, 0, 0));
  });

  it("is null once the fire time is behind us — the Home strip carries the last two days", () => {
    const expires = new Date(2026, 8, 2, 12, 0); // tomorrow noon
    expect(
      trialReminderFireAt({
        isInTrial: true,
        trialExpiresAt: expires.toISOString(),
        now: NOW,
      })
    ).toBeNull();
  });

  it("is null without a live trial, and for an unreadable expiry", () => {
    const expires = new Date(2026, 8, 7, 9, 0).toISOString();
    expect(
      trialReminderFireAt({
        isInTrial: false,
        trialExpiresAt: expires,
        now: NOW,
      })
    ).toBeNull();
    expect(
      trialReminderFireAt({ isInTrial: true, trialExpiresAt: null, now: NOW })
    ).toBeNull();
    expect(
      trialReminderFireAt({
        isInTrial: true,
        trialExpiresAt: "not a date",
        now: NOW,
      })
    ).toBeNull();
  });
});

describe("useTrialReminderInternal — the schedule", () => {
  it("holds one reminder for a fresh trial, at 10:00 two days before it ends", async () => {
    mockProfile = { trialExpiresAt: expiryFrom(0), subscriptionTier: "free" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);
    const payload = scheduledAt(TRIAL_NOTIFICATION_ID)!;
    expect(payload.title).toBe(TRIAL_REMINDER_TITLE);
    expect(payload.scheduleAt).toEqual(new Date(2026, 8, 6, 10, 0, 0, 0));
    expect(payload.repeats).toBeFalsy();
  });

  it("holds nothing for a subscriber whose old trial expiry is still in the future", async () => {
    mockProfile = { trialExpiresAt: expiryFrom(0), subscriptionTier: "pro" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("on the reminder day itself, before 10:00, still schedules for 10:00 today", async () => {
    // Granted five days ago at 09:00 → expires in 48 h → fires at 10:00
    // today, an hour from NOW. The Home strip already reads "Last 2 days";
    // the notification is for whoever has not opened the app.
    mockProfile = { trialExpiresAt: expiryFrom(5), subscriptionTier: "free" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledAt(TRIAL_NOTIFICATION_ID)?.scheduleAt).toEqual(
      new Date(2026, 8, 1, 10, 0, 0, 0)
    );
  });

  it("holds nothing on the last day, nor after the trial, nor signed out", async () => {
    mockProfile = { trialExpiresAt: expiryFrom(6), subscriptionTier: "free" };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);

    mockProfile = { trialExpiresAt: expiryFrom(9), subscriptionTier: "free" };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);

    mockProfile = null;
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("drops the reminder when the user subscribes mid-trial", async () => {
    mockProfile = { trialExpiresAt: expiryFrom(1), subscriptionTier: "free" };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);

    mockProfile = { ...mockProfile, subscriptionTier: "pro" };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("holds nothing without notification permission, and does not throw", async () => {
    setNotificationPermission("denied");
    mockProfile = { trialExpiresAt: expiryFrom(0), subscriptionTier: "free" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("does nothing while the profile is still loading", async () => {
    mockLoading = true;
    mockProfile = { trialExpiresAt: expiryFrom(0), subscriptionTier: "free" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });
});

/* The store trial a purchase is in (Sub1, STATUS 2026-10-06): the phone's
   reminder goes at the instant the server chose for the email. */
describe("useTrialReminderInternal — a store trial", () => {
  // Local wall clock: reminder Thursday 3 September 10:00, last moment to
  // cancel Saturday 5 September 09:00, trial ends Sunday 6 September.
  const REMIND = new Date(2026, 8, 3, 10, 0, 0, 0);
  function storeTrial(overrides: Record<string, unknown> = {}) {
    return {
      productId: "com.tropos.app.pro.monthly",
      store: "app_store",
      period: "month",
      startedAt: new Date(2026, 7, 30, 9, 0).toISOString(),
      endsAt: new Date(2026, 8, 6, 9, 0).toISOString(),
      cancelBy: new Date(2026, 8, 5, 9, 0).toISOString(),
      reminderAt: REMIND.toISOString(),
      willRenew: true,
      price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
      reminderEmailedAt: null,
      ...overrides,
    };
  }

  it("holds one reminder at the email's instant, in the store trial's words", async () => {
    mockProfile = { subscriptionTier: "pro", subscriptionTrial: storeTrial() };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);
    const payload = scheduledAt(TRIAL_NOTIFICATION_ID)!;
    expect(payload.scheduleAt).toEqual(REMIND);
    expect(payload.title).toBe("Your free trial ends on Sunday 6 September");
    expect(payload.body).toBe(
      "Cancel by 09:00 on Saturday 5 September if you don't want to pay £3.99 a month. Already cancelled? There's nothing to do."
    );
  });

  it("drops the reminder once renewal is turned off", async () => {
    mockProfile = { subscriptionTier: "pro", subscriptionTrial: storeTrial() };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);

    mockProfile = {
      subscriptionTier: "pro",
      subscriptionTrial: storeTrial({ willRenew: false }),
    };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("holds nothing once the reminder's instant has passed, or when the trial converts", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionTrial: storeTrial({
        reminderAt: new Date(2026, 8, 1, 8, 0).toISOString(),
      }),
    };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);

    mockProfile = { subscriptionTier: "pro", subscriptionTrial: null };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });
});
