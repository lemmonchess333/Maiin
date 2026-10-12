/**
 * The store trial as the app shows it (Sub1, STATUS 2026-10-06).
 *
 * The server chooses the reminder's instant and the last moment to cancel
 * (functions/lib/trialReminder.js); these read them and work nothing out
 * again, so the phone, Home and the Upgrade page say what the email says.
 * Instants here are built from the device's own clock, so the words are
 * the same in every zone the suite runs in.
 */
import { describe, it, expect } from "vitest";
import type { SubscriptionTrial } from "@/lib/auth";
import {
  cancelByText,
  relativeDayText,
  runningTrial,
  storeSubscriptionsUrl,
  trialEndDayText,
  trialPhoneReminder,
  trialPriceText,
  trialStripText,
} from "../subscriptionTrial";

/** Local wall-clock instants: Wednesday 7 to Saturday 10 October 2026. */
const REMIND = new Date(2026, 9, 7, 10, 0);
const CANCEL_BY = new Date(2026, 9, 9, 14, 30);
const ENDS = new Date(2026, 9, 10, 14, 30);

function trial(overrides: Partial<SubscriptionTrial> = {}): SubscriptionTrial {
  return {
    productId: "com.tropos.app.pro.monthly",
    store: "app_store",
    period: "month",
    startedAt: new Date(2026, 9, 3, 14, 30).toISOString(),
    endsAt: ENDS.toISOString(),
    cancelBy: CANCEL_BY.toISOString(),
    reminderAt: REMIND.toISOString(),
    willRenew: true,
    price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
    reminderEmailedAt: null,
    ...overrides,
  };
}

describe("the words", () => {
  it("say the price with how often it is taken", () => {
    expect(trialPriceText(trial())).toBe("£3.99 a month");
    expect(trialPriceText(trial({ period: "year" }))).toBe("£3.99 a year");
    expect(trialPriceText(trial({ period: null }))).toBe("£3.99");
    expect(trialPriceText(trial({ price: null }))).toBeNull();
  });

  it("say the day it ends and the last moment to cancel, day first and 24-hour", () => {
    expect(trialEndDayText(trial())).toBe("Saturday 10 October");
    expect(cancelByText(trial())).toBe("14:30 on Friday 9 October");
    expect(cancelByText(trial({ cancelBy: "soon" }))).toBeNull();
  });

  it("open the store's own subscription list", () => {
    expect(storeSubscriptionsUrl("app_store")).toBe(
      "https://apps.apple.com/account/subscriptions"
    );
    expect(storeSubscriptionsUrl("play_store")).toBe(
      "https://play.google.com/store/account/subscriptions"
    );
  });
});

describe("runningTrial", () => {
  it("is the trial until it ends", () => {
    const now = new Date(2026, 9, 8, 9, 0);
    expect(runningTrial(trial(), now)).not.toBeNull();
    expect(runningTrial(trial(), ENDS)).toBeNull();
    expect(runningTrial(null, now)).toBeNull();
    expect(runningTrial(trial({ endsAt: "never" }), now)).toBeNull();
  });
});

describe("trialPhoneReminder", () => {
  const before = new Date(2026, 9, 5, 9, 0);

  it("goes when the email does, and holds even if they have already cancelled", () => {
    expect(trialPhoneReminder(trial(), before)).toEqual({
      fireAt: REMIND,
      title: "Your free trial ends on Saturday 10 October",
      body: "Cancel by 14:30 on Friday 9 October if you don't want to pay £3.99 a month. Already cancelled? There's nothing to do.",
    });
  });

  it("names no amount it was not given", () => {
    expect(trialPhoneReminder(trial({ price: null }), before)?.body).toBe(
      "Cancel by 14:30 on Friday 9 October if you don't want your subscription to start. Already cancelled? There's nothing to do."
    );
  });

  it("is nothing once renewal is off, or once its instant has passed", () => {
    expect(trialPhoneReminder(trial({ willRenew: false }), before)).toBeNull();
    expect(trialPhoneReminder(trial(), REMIND)).toBeNull();
    expect(trialPhoneReminder(null, before)).toBeNull();
    expect(
      trialPhoneReminder(trial({ reminderAt: "later" }), before)
    ).toBeNull();
  });
});

describe("relativeDayText", () => {
  it("says today, tomorrow, or the weekday", () => {
    const now = new Date(2026, 9, 8, 9, 0); // Thursday
    expect(relativeDayText(new Date(2026, 9, 8, 23, 0), now)).toBe("today");
    expect(relativeDayText(new Date(2026, 9, 9, 1, 0), now)).toBe("tomorrow");
    expect(relativeDayText(ENDS, now)).toBe("on Saturday");
  });
});

describe("trialStripText", () => {
  it("shows in the last two days, while renewal is on", () => {
    expect(trialStripText(trial(), new Date(2026, 9, 8, 14, 0))).toBeNull();
    expect(trialStripText(trial(), new Date(2026, 9, 8, 15, 0))).toBe(
      "Free trial ends on Saturday, then £3.99 a month"
    );
    expect(trialStripText(trial(), new Date(2026, 9, 9, 18, 0))).toBe(
      "Free trial ends tomorrow, then £3.99 a month"
    );
    expect(
      trialStripText(trial({ price: null }), new Date(2026, 9, 10, 9, 0))
    ).toBe("Free trial ends today");
  });

  it("is gone once the trial ends or renewal is off", () => {
    expect(trialStripText(trial(), ENDS)).toBeNull();
    expect(
      trialStripText(trial({ willRenew: false }), new Date(2026, 9, 9, 18, 0))
    ).toBeNull();
  });
});
