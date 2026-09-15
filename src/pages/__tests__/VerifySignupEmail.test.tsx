import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "firebase/auth";
const h = vi.hoisted(() => ({
  initial: vi.fn(),
  resend: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@/lib/accountSecurity", () => ({
  sendInitialVerificationEmail: h.initial,
  sendVerificationEmail: h.resend,
  requestEmailChange: h.change,
  resendVerificationErrorMessage: () =>
    "Couldn't send the email. Try again in a moment.",
}));
import VerifySignupEmail from "../VerifySignupEmail";
const user = {
  uid: "alice",
  email: "typo@example.com",
  emailVerified: false,
} as User;
beforeEach(() => {
  vi.clearAllMocks();
  h.initial.mockResolvedValue(undefined);
  h.resend.mockResolvedValue(undefined);
  h.change.mockResolvedValue(undefined);
});
function show(recheck = vi.fn().mockResolvedValue(false)) {
  return render(
    <MemoryRouter>
      <VerifySignupEmail user={user} recheck={recheck} />
    </MemoryRouter>
  );
}
describe("signup verification", () => {
  it("sends immediately, shows the address, and keeps account/help accessible", async () => {
    show();
    await screen.findByText(/Verification email sent/);
    expect(h.initial).toHaveBeenCalledWith("alice");
    expect(screen.getByText(user.email!)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/settings/account"
    );
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  });
  it("doesn't claim successful delivery after an error and allows a resend", async () => {
    h.initial.mockRejectedValueOnce(new Error("outage"));
    show();
    await screen.findByRole("alert");
    expect(
      screen.queryByText(/Verification email sent/)
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));
    await waitFor(() => expect(h.resend).toHaveBeenCalledOnce());
  });
  it("explains that setup is still waiting when verification isn't complete", async () => {
    const recheck = vi.fn().mockResolvedValue(false);
    show(recheck);
    await screen.findByText(/Verification email sent/);
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" })
    );
    await screen.findByText(/Your email isn't verified yet/);
    expect(recheck).toHaveBeenCalledOnce();
  });
  it("corrects a typo with password confirmation and shows the new destination", async () => {
    show();
    await screen.findByText(/Verification email sent/);
    fireEvent.click(
      screen.getByRole("button", { name: "Use a different email" })
    );
    fireEvent.change(screen.getByLabelText("New email"), {
      target: { value: "right@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "test-only" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send confirmation to new email" })
    );
    await screen.findByText("right@example.com");
    expect(h.change).toHaveBeenCalledWith(
      user,
      "test-only",
      "right@example.com"
    );
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });
});
