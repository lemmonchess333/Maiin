/**
 * Home's strip in a renewing store trial's last two days (Sub1 pin 12,
 * STATUS 2026-10-06): when it ends, what it costs after, and the store's
 * own page to manage it. Nothing at any other time, and nothing once
 * renewal is off.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TrialEndingStrip from "../TrialEndingStrip";
import type { SubscriptionTrial } from "@/lib/auth";

const ENDS = new Date(2026, 9, 10, 14, 30); // Saturday

function trial(overrides: Partial<SubscriptionTrial> = {}): SubscriptionTrial {
  return {
    productId: "com.tropos.app.pro.yearly",
    store: "app_store",
    period: "year",
    startedAt: new Date(2026, 9, 3, 14, 30).toISOString(),
    endsAt: ENDS.toISOString(),
    cancelBy: new Date(2026, 9, 9, 14, 30).toISOString(),
    reminderAt: new Date(2026, 9, 7, 10, 0).toISOString(),
    willRenew: true,
    price: { amount: 34.99, currencyCode: "GBP", display: "£34.99" },
    reminderEmailedAt: null,
    ...overrides,
  };
}

function at(now: Date) {
  vi.useFakeTimers({ now, toFake: ["Date"] });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TrialEndingStrip", () => {
  it("says when the trial ends and links to the store's subscriptions", () => {
    at(new Date(2026, 9, 9, 18, 0)); // Friday evening
    render(<TrialEndingStrip trial={trial()} />);
    const strip = screen.getByRole("link", {
      name: /Free trial ends tomorrow, then £34\.99 a year/,
    });
    expect(strip).toHaveAttribute(
      "href",
      "https://apps.apple.com/account/subscriptions"
    );
    expect(strip).toHaveTextContent("Manage");
  });

  it("shows nothing before the last two days, after the end, or once renewal is off", () => {
    at(new Date(2026, 9, 7, 10, 0));
    const { rerender } = render(<TrialEndingStrip trial={trial()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 9, 9, 18, 0));
    rerender(<TrialEndingStrip trial={trial({ willRenew: false })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    vi.setSystemTime(ENDS);
    rerender(<TrialEndingStrip trial={trial()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(<TrialEndingStrip trial={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
