/**
 * Trial-ending reminder — what the OS is holding, not what was called.
 *
 * A reminder that does not fire produces no error and no UI, so every
 * assertion is on the resulting SCHEDULE (the notifications harness):
 * the id is held at the right instant while a trial is live with room
 * to remind, with the copy for THAT kind of trial (billed: the
 * subscription starts; legacy free week: nothing is charged), and it is
 * absent — not merely "cancelled once" — for a paid subscriber past the
 * trial, a lapsed trial, a signed-out session, the last two days, and a
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
  TRIAL_REMINDER_COPY,
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
/** An ISO instant `days` days after NOW, at NOW's time of day. */
function daysFromNow(days: number): string {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
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
  it("fires at 10:00 local, two calendar days before the end's local day", () => {
    const ends = new Date(2026, 8, 5, 23, 30); // Saturday 5 Sept, late
    expect(
      trialReminderFireAt({
        trialKind: "billed",
        trialEndsAt: ends.toISOString(),
        now: NOW,
      })
    ).toEqual(new Date(2026, 8, 3, 10, 0, 0, 0));
  });

  it("is null once the fire time is behind us — the Home strip carries the last two days", () => {
    expect(
      trialReminderFireAt({
        trialKind: "billed",
        trialEndsAt: new Date(2026, 8, 2, 12, 0).toISOString(),
        now: NOW,
      })
    ).toBeNull();
  });

  it("is null without a live trial, and for an unreadable end", () => {
    const ends = daysFromNow(6);
    expect(
      trialReminderFireAt({ trialKind: null, trialEndsAt: ends, now: NOW })
    ).toBeNull();
    expect(
      trialReminderFireAt({ trialKind: "billed", trialEndsAt: null, now: NOW })
    ).toBeNull();
    expect(
      trialReminderFireAt({
        trialKind: "onboarding",
        trialEndsAt: "not a date",
        now: NOW,
      })
    ).toBeNull();
  });
});

describe("useTrialReminderInternal — the billed trial", () => {
  it("holds one reminder at 10:00 two days before the trial ends, in the billed register", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(7),
      subscriptionTrialEndsAt: daysFromNow(7),
    };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);
    const payload = scheduledAt(TRIAL_NOTIFICATION_ID)!;
    expect(payload.title).toBe(TRIAL_REMINDER_COPY.billed.title);
    expect(payload.body).toMatch(/subscription starts/);
    expect(payload.body).not.toMatch(/Nothing is charged/);
    expect(payload.scheduleAt).toEqual(new Date(2026, 8, 6, 10, 0, 0, 0));
    expect(payload.repeats).toBeFalsy();
  });

  it("holds nothing for a subscriber whose trial has converted (trial end behind now, still Pro)", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(30),
      subscriptionTrialEndsAt: daysFromNow(-1),
    };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("holds nothing in the last two days, nor once the subscription has lapsed, nor signed out", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(1),
      subscriptionTrialEndsAt: daysFromNow(1),
    };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);

    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(-2),
      subscriptionTrialEndsAt: daysFromNow(-2),
    };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);

    mockProfile = null;
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("drops the reminder when the trial converts mid-way (the webhook clears the end)", async () => {
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(6),
      subscriptionTrialEndsAt: daysFromNow(6),
    };
    const { rerender } = renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);

    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(36),
      subscriptionTrialEndsAt: null,
    };
    rerender();
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("holds nothing without notification permission, and does not throw", async () => {
    setNotificationPermission("denied");
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(7),
      subscriptionTrialEndsAt: daysFromNow(7),
    };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });

  it("does nothing while the profile is still loading", async () => {
    mockLoading = true;
    mockProfile = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: daysFromNow(7),
      subscriptionTrialEndsAt: daysFromNow(7),
    };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    expect(scheduledIds()).toEqual([]);
  });
});

describe("useTrialReminderInternal — the legacy free week", () => {
  it("still reminds, in the nothing-is-charged register", async () => {
    mockProfile = { trialExpiresAt: daysFromNow(7), subscriptionTier: "free" };
    renderHook(() => useTrialReminderInternal());
    await settleNotifications();
    const payload = scheduledAt(TRIAL_NOTIFICATION_ID)!;
    expect(payload.title).toBe(TRIAL_REMINDER_COPY.onboarding.title);
    expect(payload.body).toMatch(/Nothing is charged/);
  });
});
