/**
 * EmailUpdatesGroup — a switch for each email (App1 Q55).
 *
 * The server keeps the record, so a switch is a call to setEmailConsent:
 * it shows its new place at once, keeps the server's answer, and goes back
 * with a toast when the call fails. The footer says where the email goes
 * and, for an address not verified yet, that nothing goes until it is.
 * Nothing shows until the emails are sent (`EMAIL_UPDATES_LIVE`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import type { EmailConsentRecord } from "@/lib/emailConsent";

const auth = vi.hoisted(() => ({
  user: null as null | { email: string | null; emailVerified: boolean },
  profile: null as null | { uid: string; emailConsent?: EmailConsentRecord },
  refreshProfile: vi.fn(async () => {}),
}));
const setEmailConsent = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/emailConsent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/emailConsent")>()),
  setEmailConsent,
}));

import EmailUpdatesGroup from "../EmailUpdatesGroup";
import { emailFooter } from "@/lib/emailConsent";

const weekly = () => screen.getByRole("switch", { name: "Weekly review" });
const breakSwitch = () => screen.getByRole("switch", { name: "After a break" });
const isOn = (el: HTMLElement) => el.getAttribute("aria-checked") === "true";

beforeEach(() => {
  auth.user = { email: "sam@example.com", emailVerified: true };
  auth.profile = { uid: "u1" };
  auth.refreshProfile = vi.fn(async () => {});
  setEmailConsent.mockReset();
  toastError.mockReset();
});

afterEach(() => cleanup());

describe("EmailUpdatesGroup", () => {
  it("shows nothing until the emails are sent", () => {
    const { container } = render(<EmailUpdatesGroup live={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows both off for someone never asked, with the words of each", () => {
    render(<EmailUpdatesGroup live />);
    expect(isOn(weekly())).toBe(false);
    expect(isOn(breakSwitch())).toBe(false);
    expect(
      screen.getByText(
        "Mondays at 08:00: last week’s sessions and food, when you logged any"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "If you stop logging: one email at 2 weeks and one at a month, then none"
      )
    ).toBeInTheDocument();
  });

  it("shows the stored answers", () => {
    auth.profile = {
      uid: "u1",
      emailConsent: { weeklyReview: { on: true }, winBack: { on: false } },
    };
    render(<EmailUpdatesGroup live />);
    expect(isOn(weekly())).toBe(true);
    expect(isOn(breakSwitch())).toBe(false);
  });

  it("turns one on through the server, and shows it at once", async () => {
    let answer: (v: Record<string, boolean>) => void = () => {};
    setEmailConsent.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    render(<EmailUpdatesGroup live />);
    fireEvent.click(weekly());
    // On before the server answers.
    expect(isOn(weekly())).toBe(true);
    expect(setEmailConsent).toHaveBeenCalledWith({ weeklyReview: true });
    await act(async () => {
      answer({ weeklyReview: true, winBack: false });
    });
    expect(isOn(weekly())).toBe(true);
    expect(auth.refreshProfile).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("goes back and says so when the server refuses", async () => {
    auth.profile = {
      uid: "u1",
      emailConsent: { weeklyReview: { on: true }, winBack: { on: true } },
    };
    setEmailConsent.mockRejectedValue(new Error("unavailable"));
    render(<EmailUpdatesGroup live />);
    await act(async () => {
      fireEvent.click(breakSwitch());
    });
    expect(setEmailConsent).toHaveBeenCalledWith({ winBack: false });
    expect(isOn(breakSwitch())).toBe(true);
    expect(toastError).toHaveBeenCalledWith("Couldn’t save that. Try again.");
  });

  it("says where the emails go", () => {
    render(<EmailUpdatesGroup live />);
    expect(
      screen.getByText(
        "Sent to sam@example.com. Every email has a link to unsubscribe."
      )
    ).toBeInTheDocument();
  });

  it("says nothing goes until an unverified address is verified", () => {
    expect(emailFooter("sam@example.com", false)).toBe(
      "Sent to sam@example.com once you verify it. Every email has a link to unsubscribe."
    );
    expect(emailFooter(null, false)).toBe(
      "Every email has a link to unsubscribe."
    );
  });
});
