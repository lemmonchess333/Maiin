/**
 * The store trial on the Upgrade page's Pro card (Sub1, STATUS 2026-10-06):
 * what it says, and the one offer of a phone reminder.
 *
 * The offer is checked by what the phone ends up holding, not by what was
 * called: a reminder that never gets scheduled shows nothing and throws
 * nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/notifications");
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, profile: null, loading: false }),
}));

import TrialDetails from "../TrialDetails";
import type { SubscriptionTrial } from "@/lib/auth";
import { TRIAL_NOTIFICATION_ID } from "@/hooks/useTrialReminder";
import {
  resetNotifications,
  scheduledAt,
  scheduledIds,
  setNotificationPermission,
  settleNotifications,
} from "@/test/notificationsHarness";

// Wednesday 30 September 2026, 09:00 on the device's clock.
const NOW = new Date(2026, 8, 30, 9, 0);
const REMIND = new Date(2026, 9, 7, 10, 0);

function trial(overrides: Partial<SubscriptionTrial> = {}): SubscriptionTrial {
  return {
    productId: "com.tropos.app.pro.monthly",
    store: "app_store",
    period: "month",
    startedAt: new Date(2026, 9, 3, 14, 30).toISOString(),
    endsAt: new Date(2026, 9, 10, 14, 30).toISOString(),
    cancelBy: new Date(2026, 9, 9, 14, 30).toISOString(),
    reminderAt: REMIND.toISOString(),
    willRenew: true,
    price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
    reminderEmailedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  resetNotifications();
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await settleNotifications();
});

describe("TrialDetails", () => {
  it("says when the trial ends, what it costs after and the last moment to cancel", () => {
    render(<TrialDetails trial={trial()} />);
    expect(
      screen.getByText("Free trial until Saturday 10 October.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Then £3.99 a month, unless you cancel by 14:30 on Friday 9 October."
      )
    ).toBeInTheDocument();
  });

  it("says nothing will be charged once renewal is off, and offers no reminder", async () => {
    setNotificationPermission("default");
    render(<TrialDetails trial={trial({ willRenew: false })} />);
    expect(
      screen.getByText(
        "You've turned off renewal, so nothing will be charged. Pro stays on until Saturday 10 October."
      )
    ).toBeInTheDocument();
    await settleNotifications();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks once for notifications, and holds the reminder at the email's instant", async () => {
    setNotificationPermission("default");
    render(<TrialDetails trial={trial()} />);
    const offer = await screen.findByRole("button", {
      name: "Remind me before the trial ends",
    });
    expect(scheduledIds()).toEqual([]);

    // The person says yes to the system prompt.
    setNotificationPermission("granted");
    fireEvent.click(offer);
    expect(
      await screen.findByText(
        "You'll get a reminder on this phone at 10:00 on Wednesday 7 October."
      )
    ).toBeInTheDocument();
    expect(scheduledIds()).toEqual([TRIAL_NOTIFICATION_ID]);
    expect(scheduledAt(TRIAL_NOTIFICATION_ID)?.scheduleAt).toEqual(REMIND);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("holds nothing and stops offering when the prompt is declined", async () => {
    setNotificationPermission("default");
    render(<TrialDetails trial={trial()} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remind me before the trial ends",
      })
    );
    await settleNotifications();
    await vi.waitFor(() =>
      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    );
    expect(scheduledIds()).toEqual([]);
  });

  it("offers nothing where notifications are already off", async () => {
    setNotificationPermission("denied");
    render(<TrialDetails trial={trial()} />);
    await settleNotifications();
    expect(
      screen.getByText("Free trial until Saturday 10 October.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
