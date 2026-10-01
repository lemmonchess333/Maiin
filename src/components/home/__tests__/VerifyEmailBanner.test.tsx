import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  sendVerificationEmail: vi.fn(async () => {}),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user }),
  useUidForStorageKey: () => "u1",
}));
vi.mock("@/lib/accountSecurity", () => ({
  sendVerificationEmail: h.sendVerificationEmail,
  resendVerificationErrorMessage: () => "Couldn't send the email. Try again.",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import VerifyEmailBanner from "../VerifyEmailBanner";

function emailUser(verified = false) {
  const user: Record<string, unknown> = {
    uid: "u1",
    email: "new@example.com",
    emailVerified: verified,
    providerData: [{ providerId: "password" }],
    getIdToken: vi.fn(async () => "token"),
  };
  user.reload = vi.fn(async () => {
    user.emailVerified = true;
  });
  return user;
}

const show = () =>
  render(
    <MemoryRouter>
      <VerifyEmailBanner />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("VerifyEmailBanner", () => {
  it("asks an unverified email account, with its address and a way to fix it", () => {
    h.user = emailUser();
    show();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Verify your email to post and comment");
    expect(banner).toHaveTextContent("new@example.com");
    expect(
      screen.getByRole("link", { name: "Change it in Account" })
    ).toHaveAttribute("href", "/settings/account");
    expect(screen.getByRole("button", { name: "Resend link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "I've verified" })).toBeVisible();
  });

  // The two absences below are anchored on the same render showing the
  // notice first, so "nothing rendered" can't pass by rendering nothing.
  it("asks nothing of a verified account", () => {
    h.user = emailUser();
    const view = show();
    expect(screen.getByText(/Verify your email/)).toBeVisible();
    h.user = emailUser(true);
    view.rerender(
      <MemoryRouter>
        <VerifyEmailBanner />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Verify your email/)).toBeNull();
  });

  it("asks nothing of a Google or Apple account", () => {
    h.user = emailUser();
    const view = show();
    expect(screen.getByText(/Verify your email/)).toBeVisible();
    h.user = { ...emailUser(), providerData: [{ providerId: "google.com" }] };
    view.rerender(
      <MemoryRouter>
        <VerifyEmailBanner />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Verify your email/)).toBeNull();
  });

  it("resends through the shared path", async () => {
    h.user = emailUser();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await waitFor(() =>
      expect(h.sendVerificationEmail).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith("Verification email sent")
    );
  });

  it("goes once the address is verified, after a reload and a token refresh", async () => {
    const user = emailUser();
    h.user = user;
    show();
    fireEvent.click(screen.getByRole("button", { name: "I've verified" }));
    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith("Email verified")
    );
    expect(user.reload).toHaveBeenCalledTimes(1);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(screen.queryByText(/Verify your email/)).toBeNull();
  });

  it("Not now hides it for this account, and it stays hidden", () => {
    h.user = emailUser();
    show();
    expect(screen.getByText(/Verify your email/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/Verify your email/)).toBeNull();
    cleanup();
    show();
    expect(screen.queryByText(/Verify your email/)).toBeNull();
  });
});
