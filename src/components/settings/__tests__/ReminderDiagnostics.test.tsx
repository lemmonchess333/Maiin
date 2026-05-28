/**
 * ReminderDiagnostics — Phase 1 of #851 (drop "install the app"
 * copy that promises a non-existent app).
 *
 * The empty-pending branch is the default state on web today. The
 * strip used to say "Web reminders fire while the app is open.
 * Install Tropos for durable native delivery." — a CTA pointing at
 * an artifact that doesn't exist yet (Tropos has not shipped to the
 * App Store). This test pins the post-fix contract:
 *
 *   - the empty branch renders an honest, scope-limited caveat
 *   - it does NOT mention installing, iOS, Android, or the App
 *     Store
 *   - the non-empty branch still renders the relative time as
 *     before
 *
 * Phase 2 (post-iOS) re-introduces the install CTA with platform-
 * aware copy + real URLs. At that point this test will be extended,
 * not deleted.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReminderDiagnostics } from "../NotificationsSection";
import type { PendingNotification } from "@/lib/notifications";

const noopFormat = (iso: string | null): string | null =>
  iso ? "in 4h 12m" : null;

describe("ReminderDiagnostics — copy hygiene (#851 Phase 1)", () => {
  it("renders the tab-open caveat when there is no scheduled fire", () => {
    render(
      <ReminderDiagnostics
        next={null}
        formatNextFire={noopFormat}
        onTest={() => {}}
      />
    );
    expect(
      screen.getByText(/Reminders fire while this tab is open\./i)
    ).toBeInTheDocument();
  });

  it("does NOT mention installing, iOS, Android, or the App Store", () => {
    const { container } = render(
      <ReminderDiagnostics
        next={null}
        formatNextFire={noopFormat}
        onTest={() => {}}
      />
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/install/i);
    expect(text).not.toMatch(/\bios\b/i);
    expect(text).not.toMatch(/android/i);
    expect(text).not.toMatch(/app store/i);
    expect(text).not.toMatch(/play store/i);
  });

  it("renders the relative time when a scheduled fire is available", () => {
    const next: PendingNotification = {
      id: 1,
      title: "Lunch reminder",
      body: null,
      scheduleAt: "2026-05-28T16:00:00.000Z",
    };
    render(
      <ReminderDiagnostics
        next={next}
        formatNextFire={noopFormat}
        onTest={() => {}}
      />
    );
    expect(screen.getByText(/Next:/i)).toBeInTheDocument();
    expect(screen.getByText("in 4h 12m")).toBeInTheDocument();
    expect(
      screen.queryByText(/Reminders fire while this tab is open\./i)
    ).not.toBeInTheDocument();
  });

  it("invokes onTest when Send test is pressed", () => {
    const onTest = vi.fn();
    render(
      <ReminderDiagnostics
        next={null}
        formatNextFire={noopFormat}
        onTest={onTest}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /send test/i }));
    expect(onTest).toHaveBeenCalledTimes(1);
  });
});
